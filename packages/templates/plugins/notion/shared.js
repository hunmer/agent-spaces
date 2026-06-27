// Notion API 公共请求与配置工具
// 文档: https://developers.notion.com/reference/intro
// 鉴权: Authorization: Bearer <token>，请求头需带 Notion-Version
// 默认 API 版本 2022-06-28；move-page 需要 2026-03-11+

const DEFAULT_BASE_URL = 'https://api.notion.com/v1/'
const DEFAULT_NOTION_VERSION = '2022-06-28'
// move-page 端点要求更新的 API 版本
const MOVE_PAGE_MIN_VERSION = '2026-03-11'

function getBaseUrl(args) {
  const baseUrl = (args.baseUrl && String(args.baseUrl).trim()) || DEFAULT_BASE_URL
  // 规范化：保证以 / 结尾
  return /\/$/.test(baseUrl) ? baseUrl : baseUrl + '/'
}

function getVersion(args, minVersion) {
  const v = (args.notionVersion && String(args.notionVersion).trim()) || DEFAULT_NOTION_VERSION
  // move-page 等需要更高版本：若用户配置版本低于要求，自动提升
  if (minVersion && compareVersion(v, minVersion) < 0) {
    return minVersion
  }
  return v
}

// 简单语义版本比较（仅按点分段数字比较）
function compareVersion(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0)
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0
    const db = pb[i] || 0
    if (da !== db) return da - db
  }
  return 0
}

function buildUrl(args, path) {
  const base = getBaseUrl(args)
  return `${base}${path.replace(/^\/+/, '')}`
}

function buildHeaders(args, minVersion) {
  const token = args.token
  if (!token) {
    throw new Error('Missing Notion Integration Token. Configure it in plugin settings.')
  }
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': getVersion(args, minVersion),
    'Content-Type': 'application/json',
  }
}

/**
 * 解析 Notion 错误响应。Notion 错误体形如 { object: 'error', status: 4xx, message, code }
 */
function parseNotionError(text, status) {
  let msg = `Notion API error (HTTP ${status})`
  try {
    const body = JSON.parse(text)
    if (body && body.message) msg = `${msg}: ${body.message}`
    if (body && body.code) msg = `${msg} [code=${body.code}]`
  } catch {
    if (text) msg = `${msg}: ${String(text).slice(0, 300)}`
  }
  return new Error(msg)
}

/**
 * 通用请求：用 globalThis.fetch 实现，支持 GET/POST/PATCH/DELETE。
 * ctx.api 仅封装了 GET/POST，Notion 的 update/move/archive 需要 PATCH，
 * 因此这里统一走 fetch（与 ai-image/openai 插件做法一致）。
 */
async function notionRequest(ctx, args, method, path, { body, query, minVersion } = {}) {
  let url = buildUrl(args, path)
  if (query && typeof query === 'object') {
    const qs = []
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
    if (qs.length) url += `?${qs.join('&')}`
  }

  const headers = buildHeaders(args, minVersion)
  const init = { method, headers, signal: undefined }
  if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(body)
  }
  const timeoutMs = Number(args.timeout) || 60000
  // fetch 不支持直接 timeout，用 AbortController
  const controller = new AbortController()
  init.signal = controller.signal
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  ctx.logger.info(`Notion ${method} ${path}`)
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    if (!res.ok) {
      throw parseNotionError(text, res.status)
    }
    // 部分端点（DELETE）可能返回空体
    if (!text) return null
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

async function notionGet(ctx, args, path, query) {
  return notionRequest(ctx, args, 'GET', path, { query })
}

async function notionPost(ctx, args, path, body) {
  return notionRequest(ctx, args, 'POST', path, { body })
}

async function notionPatch(ctx, args, path, body, opts = {}) {
  return notionRequest(ctx, args, 'PATCH', path, { body, minVersion: opts.minVersion })
}

async function notionDelete(ctx, args, path, query) {
  return notionRequest(ctx, args, 'DELETE', path, { query })
}

/**
 * 通用配置属性：token / notionVersion / timeout / baseUrl
 * 通过 __config__ 插值从插件全局配置注入（与 eagle/aliyun_oss 一致）。
 */
function configProperties(t) {
  const prefix = '{{ __config__["workflow.notion"]'
  return [
    {
      key: 'token',
      label: t('config.token.label', 'Integration Token'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('config.token.tooltip', 'Notion Internal Integration Token. Create one at https://www.notion.so/my-integrations and share it with target pages.'),
      default: `${prefix}["token"]}}`,
    },
    {
      key: 'notionVersion',
      label: 'Notion-Version',
      type: 'text',
      dataType: 'string',
      toolRequired: false,
      tooltip: t('config.notionVersion.tooltip', 'Notion API version. Default 2022-06-28. move-page requires 2026-03-11+.'),
      default: `${prefix}["notionVersion"]}}`,
    },
    {
      key: 'timeout',
      label: t('config.timeout.label', 'Timeout (ms)'),
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
  DEFAULT_NOTION_VERSION,
  MOVE_PAGE_MIN_VERSION,
  getBaseUrl,
  getVersion,
  buildUrl,
  buildHeaders,
  notionGet,
  notionPost,
  notionPatch,
  notionDelete,
  notionRequest,
  configProperties,
  asArray,
  asObject,
}
