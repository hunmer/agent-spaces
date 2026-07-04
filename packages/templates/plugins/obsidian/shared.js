// Obsidian Local REST API 公共请求与配置工具
// 文档: https://coddingtonbear.github.io/obsidian-local-rest-api/
// 鉴权: Authorization: Bearer <apiKey>
// 默认 https://127.0.0.1:27124，使用自签名证书；http 端点默认 127.0.0.1:27123
//
// 关键差异点：
// 1. 自签名证书 —— Node fetch 默认会校验 TLS。当 rejectUnauthorized=false 时，
//    通过动态创建 Agent 关闭证书校验（与 fish-audio / ai-image 处理自签名的方式一致）。
// 2. PATCH 端点用请求头表达操作语义：Operation / Target-Type / Target
//    （append / prepend / replace × heading / block / frontmatter）

const https = require('https')
const http = require('http')

// 缓存 dispatcher，避免每次请求重建 Agent
let cachedDispatcher = null
let cachedDispatcherKey = ''

/**
 * 根据配置返回合适的 dispatcher（Node undici 术语）。
 * Obsidian 自签名证书场景下需要关闭 TLS 校验。
 *
 * Node 18+ 的全局 fetch 支持通过 dispatcher 选项传入 Agent；
 * 这里在 require('undici') 可用时使用，否则降级为 fetch 原生能力
 * （部分运行时不支持 dispatcher，会抛错，由调用方捕获后提示用户改用 http 端点）。
 */
function getDispatcher(args) {
  const rejectUnauthorized = args.rejectUnauthorized !== false && args.rejectUnauthorized !== 'false'
  const scheme = String(args.scheme || 'https').toLowerCase()
  const key = `${scheme}|${rejectUnauthorized}`

  if (cachedDispatcher && cachedDispatcherKey === key) return cachedDispatcher

  let dispatcher = undefined
  try {
    // undici 是 Node 18+ 内置依赖，可直接 require
    const undici = require('undici')
    if (scheme === 'https' && !rejectUnauthorized) {
      // 关闭自签名证书校验
      dispatcher = new undici.Agent({ connect: { rejectUnauthorized: false } })
    }
  } catch {
    // undici 不可用 —— 留空，调用方依赖 fetch 默认行为
  }

  cachedDispatcher = dispatcher
  cachedDispatcherKey = key
  return dispatcher
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
 * 通用请求。用 globalThis.fetch 实现，支持 GET/POST/PUT/PATCH/DELETE。
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
async function obsidianRequest(ctx, args, method, path, { body, headers, query, rawBody } = {}) {
  let url = buildUrl(args, path)
  if (query && typeof query === 'object') {
    const qs = []
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
    if (qs.length) url += `?${qs.join('&')}`
  }

  const finalHeaders = buildHeaders(args, headers)
  const init = { method, headers: finalHeaders }

  // body 处理
  if (body !== undefined && !['GET', 'DELETE'].includes(method)) {
    if (rawBody || typeof body === 'string' || Buffer.isBuffer(body)) {
      init.body = body
    } else {
      init.body = JSON.stringify(body)
      if (!finalHeaders['Content-Type'] && !finalHeaders['content-type']) {
        finalHeaders['Content-Type'] = 'application/json'
      }
    }
  }

  // 超时控制
  const timeoutMs = Number(args.timeout) || 30000
  const controller = new AbortController()
  init.signal = controller.signal
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // 自签名证书：注入 dispatcher
  const dispatcher = getDispatcher(args)
  if (dispatcher) init.dispatcher = dispatcher

  ctx.logger.info(`Obsidian ${method} ${path}`)
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    if (!res.ok) {
      throw parseObsidianError(text, res.status)
    }
    // 部分端点返回空体
    if (!text) return null
    // 尝试 JSON 解析，失败则原样返回文本
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  } catch (err) {
    // 网络层 / TLS 错误归一化提示
    const msg = String(err && err.message || err)
    if (/certificate|self.signed|unable.to.verify|ECONNREFUSED/i.test(msg)) {
      throw new Error(
        `Obsidian connection failed: ${msg}. Check that the Local REST API plugin is running, and that apiKey/host/port are correct. For HTTPS you may need to trust the certificate or switch to http://127.0.0.1:27123 (enable HTTP server in Obsidian settings).`
      )
    }
    if (/aborted|timeout/i.test(msg)) {
      throw new Error(`Obsidian request timed out after ${timeoutMs}ms.`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
