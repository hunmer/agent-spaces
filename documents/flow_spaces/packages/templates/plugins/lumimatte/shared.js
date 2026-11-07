// LumiMatte HTTP 客户端封装
//
// 对接文档：G:\LumiMatte-main\lumi-matte-server\API.md
//   GET  /api/system/status                健康检查
//   GET  /api/system/models                已安装离线模型清单
//   POST /api/process/matting              AI 智能抠图 {imageData}
//   POST /api/process/inpaint              智能局部消除 {imageData, maskData}
//   POST /api/process/super-res            画质超分 {imageData, options{scale,...}}
//   POST /api/export/psd                   导出 PSD {width, height, layers[], filename}
//
// 协议要点：
//   - 全部 JSON（Content-Type: application/json），图片以 base64 字符串传参，
//     带不带 data:image/xxx;base64, 前缀均可
//   - 处理接口响应结构一致：{success, model, durationMs, resultImage, timestamp}
//   - PSD 响应：{filename, width, height, layerCount, sizeBytes, dataBase64, psdBase64}
//   - 错误统一 {error: "..."} + 500；请求体上限 100MB
//   - 推理全局串行化，首次调用某引擎需加载模型（约 10~30s），超时需留足余量

const fs = require('fs')

const DEFAULT_BASE_URL = 'http://127.0.0.1:8317'
const DEFAULT_TIMEOUT = 300000

// ── 配置解析 ────────────────────────────────────────────────
function getBaseUrl(args) {
  const v = args.baseUrl != null ? String(args.baseUrl).trim() : ''
  return v.replace(/\/+$/, '') || DEFAULT_BASE_URL
}

function getTimeout(args) {
  const n = Number(args.timeout)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT
}

// ── 图片输入解析 ───────────────────────────────────────────
// 接受 data URI / http(s) URL / 本地路径，统一返回 { buffer, mime }
async function resolveImage(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('image input is empty')
  }

  // data:image/png;base64,xxxx
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(input)
  if (dataMatch) {
    const mime = (dataMatch[1] || 'image/png').split(';')[0]
    const buffer = dataMatch[2]
      ? Buffer.from(dataMatch[3], 'base64')
      : Buffer.from(decodeURIComponent(dataMatch[3]), 'utf-8')
    return { buffer, mime }
  }

  // http(s) URL：客户端下载后转 base64 上传
  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) {
      throw new Error(`download image failed: HTTP ${resp.status} ${input}`)
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const mime = (resp.headers.get('content-type') || mimeFromExt(input)).split(';')[0].trim()
    return { buffer, mime }
  }

  // 本地路径
  const buffer = fs.readFileSync(input)
  return { buffer, mime: mimeFromExt(input) }
}

function mimeFromExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file || '')
  const ext = (m && m[1] || '').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  return 'image/png'
}

// buffer → data URI（服务端带不带前缀均可，带上更规范）
function toDataUrl(buffer, mime) {
  return `data:${mime || 'image/png'};base64,${buffer.toString('base64')}`
}

// 服务端返回的 data URL → { buffer, ext }
function parseDataUrlImage(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(String(dataUrl || ''))
  if (!m) throw new Error('response image is not a data URL')
  const buffer = Buffer.from(m[3], 'base64')
  const mime = (m[1] || 'image/png').split(';')[0]
  return { buffer, mime, ext: extFromMime(mime) }
}

function extFromMime(mime) {
  const sub = ((mime || 'image/png').split('/')[1] || 'png').split('+')[0].toLowerCase()
  return sub === 'jpeg' ? 'jpg' : sub
}

// ── 请求封装 ───────────────────────────────────────────────
async function readError(resp) {
  let detail = ''
  try {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      detail = json.error || JSON.stringify(json)
    } catch {
      detail = text.slice(0, 300)
    }
  } catch {
    /* ignore */
  }
  return `LumiMatte HTTP ${resp.status}${detail ? `: ${detail}` : ''}`
}

// timeout 用 AbortController + setTimeout（sandbox 内无 AbortSignal.timeout 依赖假设）
async function requestJson(ctx, args, method, path, body) {
  const baseUrl = getBaseUrl(args)
  const timeout = getTimeout(args)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const resp = await globalThis.fetch(`${baseUrl}${path}`, {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!resp.ok) {
      throw new Error(await readError(resp))
    }
    return await resp.json()
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`LumiMatte request timeout after ${timeout}ms: ${method} ${path}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// ── 处理接口通用调用：{imageData[, maskData][, options]} → {buffer, ext, meta} ──
async function processImage(ctx, args, path, payload) {
  const json = await requestJson(ctx, args, 'POST', path, payload)
  if (!json || json.success === false || !json.resultImage) {
    throw new Error(`LumiMatte ${path} failed: ${JSON.stringify(json).slice(0, 300)}`)
  }
  const { buffer, ext } = parseDataUrlImage(json.resultImage)
  return { buffer, ext, meta: json }
}

// ── 结果保存：buffer → 公网可访问 httpPath ─────────────────
function saveResultFile(ctx, buffer, ext) {
  const saved = ctx.api.savePublicFile(buffer, ext || 'png')
  if (!saved || !saved.httpPath) {
    throw new Error('save result file failed')
  }
  return saved
}

// layers 入参防御式解析：object[] / JSON 字符串 → 数组
function toLayerArray(input) {
  if (input == null) return []
  if (Array.isArray(input)) return input
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      throw new Error(`invalid layers JSON: ${trimmed.slice(0, 100)}`)
    }
  }
  return [input]
}

// string / string[] / JSON 字符串 → 图片数组
function toImageArray(input) {
  if (input == null) return []
  if (Array.isArray(input)) return input.filter(Boolean)
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return [trimmed]
      }
    }
    return [trimmed]
  }
  return []
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  getBaseUrl,
  getTimeout,
  resolveImage,
  mimeFromExt,
  extFromMime,
  toDataUrl,
  parseDataUrlImage,
  requestJson,
  processImage,
  saveResultFile,
  toLayerArray,
  toImageArray,
}
