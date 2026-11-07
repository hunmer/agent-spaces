// Obsidian Local REST API 公共请求与配置工具
// 文档: https://coddingtonbear.github.io/obsidian-local-rest-api/
// 鉴权: Authorization: Bearer <apiKey>
// 默认 https://127.0.0.1:27124，使用自签名证书；http 端点默认 127.0.0.1:27123
//
// 关键差异点：
// 1. 自签名证书 —— 插件运行在 VM sandbox 中，全局 fetch 来自主进程但无法可靠注入
//    undici dispatcher（sandbox 的 require('undici') 会返回 stub）。
//    因此这里直接用 node:https / node:http（builtin module，sandbox 可正常 require），
//    通过 https.Agent({ rejectUnauthorized: false }) 关闭自签名证书校验。
//    这与 plugin-runtime-api.ts 中 httpGet/httpPost 的底层方式一致。
// 2. PATCH 端点用请求头表达操作语义：Operation / Target-Type / Target
//    （append / prepend / replace × heading / block / frontmatter）

const https = require('node:https')
const http = require('node:http')

// 缓存 Agent，避免每个请求重建（含 TLS 上下文）
const agentCache = new Map()

function getAgent(args) {
  const scheme = String(args.scheme || 'https').toLowerCase()
  const rejectUnauthorized = args.rejectUnauthorized !== false && args.rejectUnauthorized !== 'false'
  const key = `${scheme}|${rejectUnauthorized}`

  let agent = agentCache.get(key)
  if (agent) return agent

  if (scheme === 'https') {
    // 关键：默认关闭证书校验以兼容 Obsidian 自签名证书
    agent = new https.Agent({ rejectUnauthorized, keepAlive: true })
  } else {
    agent = new http.Agent({ keepAlive: true })
  }
  agentCache.set(key, agent)
  return agent
}

function buildBaseUrl(args) {
  const scheme = String(args.scheme || 'https').toLowerCase()
  const host = (args.host && String(args.host).trim()) || '127.0.0.1'
  let port = Number(args.port)
  if (!port) port = scheme === 'http' ? 27123 : 27124
  return `${scheme}://${host}:${port}`
}

function buildUrl(args, path) {
  const base = buildBaseUrl(args)
  const cleanPath = path.replace(/^\/+/, '')
  return `${base}/${cleanPath}`
}

function buildHeaders(args, extra = {}) {
  const apiKey = args.apiKey
  if (!apiKey) {
    throw new Error('Missing Obsidian API Key. Configure it in plugin settings.')
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    ...extra,
  }
}

/**
 * 解析 Obsidian 错误响应。
 * Local REST API 错误体通常为 { message: "..." }，部分场景返回纯文本。
 */
function parseObsidianError(text, status) {
  let msg = `Obsidian API error (HTTP ${status})`
  try {
    const body = JSON.parse(text)
    if (body && body.message) msg = `${msg}: ${body.message}`
  } catch {
    if (text) msg = `${msg}: ${String(text).slice(0, 300)}`
  }
  return new Error(msg)
}

/**
 * 通用请求。直接基于 node:https / node:http 实现，支持 GET/POST/PUT/PATCH/DELETE。
 *
 * 不使用全局 fetch 的原因：
 *   - sandbox 中全局 fetch 来自主进程，被 wrapFetchWithDebug 包装；
 *   - 要关闭 TLS 校验需注入 undici dispatcher，但 sandbox 的 require('undici')
 *     命中 createRequireStub 返回空 Proxy，dispatcher 无效，自签名证书握手失败。
 *   - node:https 是 builtin module，sandbox 可正常 require，且原生支持 rejectUnauthorized。
 *
 * @param {object} ctx      插件上下文（含 logger）
 * @param {object} args     含 apiKey / scheme / host / port / rejectUnauthorized / timeout
 * @param {string} method   HTTP 方法
 * @param {string} path     不含 baseUrl 的路径，例如 'vault/' / 'vault/note.md' / 'search/simple/'
 * @param {object} opts
 *   - body:    string | Buffer | object（object 会被 JSON.stringify）
 *   - headers: 额外请求头（如 Operation / Target-Type / Target / Content-Type）
 *   - query:   查询参数对象
 *   - rawBody: 为 true 时 body 即使是字符串也不做任何转换（用于 text/plain 写入）
 */
function obsidianRequest(ctx, args, method, path, { body, headers, query, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(buildUrl(args, path))
    } catch (err) {
      reject(new Error(`Invalid request URL: ${err && err.message}`))
      return
    }

    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue
        url.searchParams.set(k, String(v))
      }
    }

    // 准备 body + Content-Type
    let bodyData = null
    const finalHeaders = buildHeaders(args, headers)
    if (body !== undefined && !['GET', 'DELETE'].includes(method)) {
      if (rawBody || typeof body === 'string' || Buffer.isBuffer(body)) {
        bodyData = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8')
        if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
          finalHeaders['Content-Type'] = 'text/plain'
        }
      } else {
        bodyData = Buffer.from(JSON.stringify(body), 'utf-8')
        if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
          finalHeaders['Content-Type'] = 'application/json'
        }
      }
      finalHeaders['Content-Length'] = String(bodyData.length)
    }

    const timeoutMs = Number(args.timeout) || 30000
    const isHttps = url.protocol === 'https:'
    const lib = isHttps ? https : http

    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: finalHeaders,
      agent: getAgent(args),
    }

    ctx.logger.info(`Obsidian ${method} ${path}`)

    const req = lib.request(reqOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8')
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(parseObsidianError(text, res.statusCode))
          return
        }
        if (!text) {
          resolve(null)
          return
        }
        // 尝试 JSON 解析，失败则原样返回文本
        try {
          resolve(JSON.parse(text))
        } catch {
          resolve(text)
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      const msg = String(err && err.message || err)
      if (/certificate|self.signed|unable.to.verify|UNABLE_TO_VERIFY|ERR_TLS|ECONNREFUSED|ECONNRESET|EHOSTUNREACH/i.test(msg)) {
        reject(new Error(
          `Obsidian connection failed: ${msg}. Check that the Local REST API plugin is running in Obsidian, and that apiKey/host/port are correct. For HTTPS with a self-signed cert, keep "Verify TLS Cert" off; or enable the HTTP server in Obsidian and switch to http://127.0.0.1:27123.`
        ))
        return
      }
      reject(err)
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Obsidian request timed out after ${timeoutMs}ms.`))
    })

    if (bodyData) req.write(bodyData)
    req.end()
  })
}

/**
 * 通用配置属性：apiKey / scheme / host / port / rejectUnauthorized / timeout
 * 通过 __config__ 插值从插件全局配置注入。
 */
function configProperties(t) {
  const prefix = '{{ __config__["workflow.obsidian"]'
  return [
    {
      key: 'apiKey',
      label: t('config.apiKey.label', 'API Key'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('config.apiKey.tooltip', 'Obsidian Local REST API key. Find it under Obsidian Settings → Local REST API.'),
      default: `${prefix}["apiKey"]}}`,
    },
    {
      key: 'scheme',
      label: t('config.scheme.label', 'Scheme'),
      type: 'select',
      dataType: 'string',
      toolRequired: false,
      default: 'https',
      options: [
        { label: 'https', value: 'https' },
        { label: 'http', value: 'http' },
      ],
      enum: ['https', 'http'],
      tooltip: t('config.scheme.tooltip', 'Default https (port 27124, self-signed cert). If you cannot trust the cert, enable the HTTP server in Obsidian and use http (port 27123).'),
      defaultSel: `${prefix}["scheme"]}}`,
    },
    {
      key: 'host',
      label: t('config.host.label', 'Host'),
      type: 'text',
      dataType: 'string',
      toolRequired: false,
      tooltip: t('config.host.tooltip', 'Obsidian host. Default 127.0.0.1.'),
      default: `${prefix}["host"]}}`,
    },
    {
      key: 'port',
      label: t('config.port.label', 'Port'),
      type: 'number',
      dataType: 'number',
      toolRequired: false,
      tooltip: t('config.port.tooltip', 'HTTPS default 27124, HTTP default 27123.'),
      default: 27124,
    },
    {
      key: 'rejectUnauthorized',
      label: t('config.rejectUnauthorized.label', 'Verify TLS Cert'),
      type: 'checkbox',
      dataType: 'boolean',
      toolRequired: false,
      tooltip: t('config.rejectUnauthorized.tooltip', 'Off by default. Obsidian uses a self-signed cert; keep this off unless you have trusted the certificate.'),
      default: false,
    },
    {
      key: 'timeout',
      label: t('config.timeout.label', 'Timeout (ms)'),
      type: 'number',
      dataType: 'number',
      toolRequired: false,
      tooltip: t('config.timeout.tooltip', 'Request timeout in milliseconds.'),
      default: 30000,
    },
  ]
}

/**
 * 防御式解析为数组：已是数组直接返回，字符串尝试 JSON.parse，否则按逗号拆分。
 */
function asArray(value) {
  if (value === undefined || value === null || value === '') return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return []
    if (s[0] === '[') {
      try {
        const parsed = JSON.parse(s)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        // 非合法 JSON，回退到逗号拆分
      }
    }
    return s.split(',').map((x) => x.trim()).filter(Boolean)
  }
  return [value]
}

module.exports = {
  buildBaseUrl,
  buildUrl,
  buildHeaders,
  obsidianRequest,
  configProperties,
  asArray,
}
