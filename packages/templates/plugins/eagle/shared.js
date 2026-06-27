// Eagle Web API v2 公共请求与配置工具
// 文档: docs/readme.md
// 基础 URL 默认 http://localhost:41595/api/v2/
// 本地访问无需 token；远程访问需在 URL 上附加 ?token=

const DEFAULT_BASE_URL = 'http://localhost:41595/api/v2/'

function buildBaseUrl(args) {
  const baseUrl = (args.baseUrl && String(args.baseUrl).trim()) || DEFAULT_BASE_URL
  // 规范化：保证以 /api/v2/ 结尾，兼容用户只填到 host 或填到 /api/v2 的情况
  let url = baseUrl.replace(/\/+$/, '')
  if (!/\/api\/v2$/.test(url)) {
    // 用户填的是 host（如 http://localhost:41595），补全到 /api/v2
    url = url + '/api/v2'
  }
  return url + '/'
}

function attachToken(url, token) {
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}token=${encodeURIComponent(token)}`
}

function buildUrl(args, path, query) {
  const base = buildBaseUrl(args)
  let url = `${base}${path.replace(/^\/+/, '')}`
  const qs = []
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
  }
  if (args.token) qs.push(`token=${encodeURIComponent(args.token)}`)
  if (qs.length) url += `?${qs.join('&')}`
  return url
}

/**
 * GET 请求，返回 JSend 解析后的 data。
 * Eagle 所有响应为 { status: 'success'|'error', data | message }
 */
async function eagleGet(ctx, args, path, query) {
  const url = buildUrl(args, path, query)
  ctx.logger.info(`Eagle GET ${path}`)
  const res = await ctx.api.fetchJson(url, { timeout: args.timeout || 60000 })
  return unwrap(res, path)
}

/**
 * POST 请求，body 为 JSON。
 */
async function eaglePost(ctx, args, path, body) {
  const url = buildUrl(args, path)
  ctx.logger.info(`Eagle POST ${path}`)
  const res = await ctx.api.postJson(url, {
    body: body || {},
    timeout: args.timeout || 60000,
  })
  return unwrap(res, path)
}

function unwrap(res, path) {
  if (!res || typeof res !== 'object') {
    throw new Error(`Eagle ${path}: empty response`)
  }
  if (res.status === 'error') {
    throw new Error(`Eagle ${path}: ${res.message || 'unknown error'}`)
  }
  // status === 'success' 或未声明 status，统一返回 data
  return res.data
}

/**
 * 通用配置属性：baseUrl / token / timeout
 * 通过 __config__ 插值从插件全局配置注入（与 aliyun_oss 一致）。
 */
function configProperties(t) {
  const prefix = '{{ __config__["workflow.eagle"]'
  return [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      dataType: 'string',
      tooltip: t('config.baseUrl.tooltip', 'Eagle API base URL. Local default: http://localhost:41595'),
      default: `${prefix}["baseUrl"]}}`,
    },
    {
      key: 'token',
      label: 'Token',
      type: 'text',
      dataType: 'string',
      toolRequired: false,
      tooltip: t('config.token.tooltip', 'Required only for remote (LAN) access. Leave empty for localhost.'),
      default: `${prefix}["token"]}}`,
    },
    {
      key: 'timeout',
      label: 'Timeout (ms)',
      type: 'number',
      dataType: 'number',
      toolRequired: false,
      tooltip: t('config.timeout.tooltip', 'Request timeout in milliseconds.'),
      default: 60000,
    },
  ]
}

/**
 * 防御式解析为数组：已是数组直接返回，字符串尝试 JSON.parse，否则按逗号拆分。
 * 与 plugin-guide 对 string[] property 的 run 处理建议一致。
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

/**
 * 防御式解析为对象：已是对象直接返回，字符串尝试 JSON.parse。
 */
function asObject(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return undefined
    try {
      return JSON.parse(s)
    } catch {
      return undefined
    }
  }
  return undefined
}

module.exports = {
  buildBaseUrl,
  buildUrl,
  attachToken,
  eagleGet,
  eaglePost,
  unwrap,
  configProperties,
  asArray,
  asObject,
}
