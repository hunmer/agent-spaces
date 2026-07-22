// 百度AI图像处理插件 - 公共逻辑
// 对接百度智能云图像处理 API：
//   智能抠图   POST https://aip.baidubce.com/rest/2.0/image-process/v1/segment              (JSON)
//   图像放大   POST https://aip.baidubce.com/rest/2.0/image-process/v1/image_quality_enhance (form-urlencoded)
//
// 鉴权：用 API Key + Secret Key 换取 access_token，有效期约 30 天，进程内缓存复用。
//
// 运行时说明：插件在 vm sandbox 中执行，仅注入 fetch / Buffer / setTimeout 等，
// ctx.api 只提供 postJson（Content-Type 固定 application/json），
// 因此 form-urlencoded 请求需要用 globalThis.fetch 手动构造 body。
//
// sandbox 注入的 URLSearchParams 可用于拼装 form-urlencoded。

const fs = require('fs')

const TOKEN_ENDPOINT = 'https://aip.baidubce.com/oauth/2.0/token'
const SEGMENT_ENDPOINT = 'https://aip.baidubce.com/rest/2.0/image-process/v1/segment'
const ENHANCE_ENDPOINT = 'https://aip.baidubce.com/rest/2.0/image-process/v1/image_quality_enhance'

// access_token 进程内缓存，避免每次请求都换一次 token
// 结构：{ [cacheKey]: { token, expireAt } }
const tokenCache = {}

// ── 基础工具 ────────────────────────────────────────────────

function mimeFromExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file || '')
  const ext = (m && m[1] || '').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'bmp') return 'image/bmp'
  return 'image/jpeg'
}

function extFromMime(mime) {
  const sub = ((mime || 'image/png').split('/')[1] || 'png').split('+')[0].toLowerCase()
  return sub === 'jpeg' ? 'jpg' : sub
}

// ── 图片输入解析 ────────────────────────────────────────────
// 接受 data URI / http(s) URL / 本地路径，统一返回 base64 字符串（不带 data: 前缀）。
async function imageToBase64(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('图片输入不能为空')
  }

  // data:image/png;base64,xxxx
  const dataMatch = /^data:([^;,]+)?(?:;base64)?,(.*)$/is.exec(input)
  if (dataMatch) {
    const isBase64 = /;base64/i.test(input.slice(0, dataMatch[0].indexOf(',')))
    if (isBase64) return dataMatch[2]
    // 非 base64 的 data URI 极少见，回退到解码后再编码
    return Buffer.from(decodeURIComponent(dataMatch[2]), 'utf-8').toString('base64')
  }

  // http(s) URL：用注入的 fetch 下载
  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) throw new Error(`下载图片失败: HTTP ${resp.status}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    return buffer.toString('base64')
  }

  // 本地路径
  const buffer = fs.readFileSync(input)
  return buffer.toString('base64')
}

// ── access_token 获取（带缓存）─────────────────────────────
async function getAccessToken(ctx, args) {
  const apiKey = (args.apiKey || '').trim()
  const secretKey = (args.secretKey || '').trim()
  if (!apiKey || !secretKey) {
    throw new Error('缺少 apiKey 或 secretKey（百度智能云应用凭证）')
  }

  const cacheKey = `${apiKey}:${secretKey}`
  const cached = tokenCache[cacheKey]
  const now = Date.now()
  // 提前 5 分钟过期，避免边界失效
  if (cached && cached.expireAt > now + 5 * 60 * 1000) {
    return cached.token
  }

  // client_credentials 换 token，返回 { access_token, expires_in, ... }
  const url = `${TOKEN_ENDPOINT}?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`
  ctx.logger.info('正在获取百度 access_token')
  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!resp.ok) {
    throw new Error(`获取 access_token 失败: HTTP ${resp.status}`)
  }
  const data = await resp.json()
  if (!data.access_token) {
    const err = new Error(`获取 access_token 失败: ${data.error || ''} ${data.error_description || ''}`)
    err.baiduError = data
    throw err
  }

  tokenCache[cacheKey] = {
    token: data.access_token,
    expireAt: now + (data.expires_in ? Number(data.expires_in) * 1000 : 30 * 24 * 60 * 60 * 1000),
  }
  ctx.logger.info('access_token 获取成功并已缓存')
  return data.access_token
}

// ── 智能抠图请求（JSON）────────────────────────────────────
// 百度 segment 接口要求 Content-Type: application/json，body 是 JSON 字符串。
async function callSegment(ctx, accessToken, payload) {
  const url = `${SEGMENT_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`
  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseBaiduResponse(resp)
}

// ── 图像放大请求（form-urlencoded）────────────────────────
// 百度 image_quality_enhance 接口要求 Content-Type: application/x-www-form-urlencoded。
async function callEnhance(ctx, accessToken, formFields) {
  const url = `${ENHANCE_ENDPOINT}?access_token=${encodeURIComponent(accessToken)}`
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(formFields)) {
    if (v != null) params.append(k, String(v))
  }
  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  return parseBaiduResponse(resp)
}

// ── 响应解析：百度错误返回 { error_code, error_msg } ───────
async function parseBaiduResponse(resp) {
  const text = await resp.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`百度接口返回非 JSON: HTTP ${resp.status}, body=${text.slice(0, 200)}`)
  }
  if (data.error_code || data.error_msg) {
    const err = new Error(`百度接口错误: ${data.error_code} - ${data.error_msg}`)
    err.baiduError = data
    throw err
  }
  return data
}

// ── 结果图片落盘：base64 → httpPath ────────────────────────
// 百度返回的是结果图片的 base64 编码（不带 data: 前缀）。
function saveResultImage(ctx, base64, extHint) {
  const buffer = Buffer.from(base64, 'base64')
  const saved = ctx.api.savePublicFile(buffer, extHint || 'png')
  if (!saved || !saved.httpPath) {
    throw new Error('结果图片落盘失败')
  }
  return saved.httpPath
}

module.exports = {
  SEGMENT_ENDPOINT,
  ENHANCE_ENDPOINT,
  mimeFromExt,
  extFromMime,
  imageToBase64,
  getAccessToken,
  callSegment,
  callEnhance,
  saveResultImage,
}
