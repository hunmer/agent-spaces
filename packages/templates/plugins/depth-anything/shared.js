// Depth Anything HTTP 客户端封装
//
// 对接文档：G:\Depth-Anything\API.md
//   POST /predict   multipart/form-data 上传图片，返回深度估计 PNG
//     - file       待推理图片（JPG/PNG/WEBP）
//     - grayscale  "true"=灰度图（默认） / "false"=彩色热力图（Inferno）
//     - pred_only  "true"=仅深度图（默认） / "false"=原图+深度图左右拼接
//   响应：200 → image/png；Header X-Saved-As = 服务器保存的文件名
//
// 运行时说明：插件在 vm sandbox 中执行，仅注入 fetch / Buffer / setTimeout 等，
// 没有 FormData / Blob，因此 multipart body 需手动拼装（参考 ai-image / rembg 插件做法）。

const fs = require('fs')

const DEFAULT_BASE_URL = 'http://localhost:7860'
const DEFAULT_TIMEOUT = 120000
// API 文档：/predict/batch 单次请求最大文件数
const MAX_BATCH_FILES = 16

// ── 配置解析 ────────────────────────────────────────────────
function getBaseUrl(args) {
  const v = args.baseUrl != null ? String(args.baseUrl).trim() : ''
  return v || DEFAULT_BASE_URL
}

function getTimeout(args) {
  const n = Number(args.timeout)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT
}

// ── 文件名 / MIME 工具 ─────────────────────────────────────
function mimeFromExt(file) {
  const m = /\.([a-z0-9]+)$/i.exec(file || '')
  const ext = (m && m[1] || '').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'png') return 'image/png'
  return 'image/png'
}

function extFromMime(mime) {
  const sub = ((mime || 'image/png').split('/')[1] || 'png').split('+')[0].toLowerCase()
  return sub === 'jpeg' ? 'jpg' : sub
}

function basename(p) {
  const m = /[^/\\?]+/.exec(p || '')
  return m ? m[0] : 'image.png'
}

// ── 图片输入解析 ───────────────────────────────────────────
// 接受 data URI / http(s) URL / 本地路径，统一返回 { buffer, mime, filename }
async function resolveImage(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Image input must not be empty')
  }

  // data:image/png;base64,xxxx
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(input)
  if (dataMatch) {
    const mime = (dataMatch[1] || 'image/png').split(';')[0]
    const isBase64 = !!dataMatch[2]
    const buffer = isBase64
      ? Buffer.from(dataMatch[3], 'base64')
      : Buffer.from(decodeURIComponent(dataMatch[3]), 'utf-8')
    return { buffer, mime, filename: `image.${extFromMime(mime)}` }
  }

  // http(s) URL：客户端下载成 buffer，统一走 POST /predict 上传
  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) {
      throw new Error(`Failed to download image: HTTP ${resp.status} ${input}`)
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const mime = (resp.headers.get('content-type') || mimeFromExt(input)).split(';')[0].trim()
    return { buffer, mime, filename: basename(input) || `image.${extFromMime(mime)}` }
  }

  // 本地路径
  const buffer = fs.readFileSync(input)
  return { buffer, mime: mimeFromExt(input), filename: basename(input) }
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

// ── multipart 手拼（sandbox 无 FormData/Blob）──────────────
function buildMultipart(fields) {
  const boundary = '----DepthAnythingPlugin' + Math.random().toString(36).slice(2)
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    if (value == null) continue
    const list = Array.isArray(value) ? value : [value]
    for (const item of list) {
      if (item && typeof item === 'object' && Buffer.isBuffer(item.buffer)) {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="${name}"; filename="${item.filename || 'image.png'}"\r\n` +
              `Content-Type: ${item.mime || 'image/png'}\r\n\r\n`,
            'utf-8',
          ),
        )
        chunks.push(item.buffer)
        chunks.push(Buffer.from('\r\n', 'utf-8'))
      } else {
        chunks.push(
          Buffer.from(
            `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
              `${item == null ? '' : String(item)}\r\n`,
            'utf-8',
          ),
        )
      }
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'))
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` }
}

// ── 错误解析 ───────────────────────────────────────────────
async function readError(resp) {
  let detail = ''
  try {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      detail = json.error || json.detail || JSON.stringify(json)
    } catch {
      detail = text.slice(0, 300)
    }
  } catch {
    /* ignore */
  }
  return `Depth Anything HTTP ${resp.status}${detail ? `: ${detail}` : ''}`
}

// ── 主调用：上传 buffer 做深度估计 ─────────────────────────
// 所有输入（URL / 本地路径 / data URI）在 resolveImage 阶段都已转成 buffer，
// 统一走 POST /predict multipart 上传。
// image: { buffer, mime, filename }
async function predictFromFile(ctx, args, image) {
  if (!image.buffer) {
    throw new Error('Image parse failed: missing buffer')
  }

  const baseUrl = getBaseUrl(args)
  const fields = {
    file: { buffer: image.buffer, mime: image.mime, filename: image.filename },
  }
  // API 默认 grayscale=true / pred_only=true；仅显式传 false 时才写字段，避免歧义
  if (args.grayscale === false) fields.grayscale = 'false'
  if (args.pred_only === false) fields.pred_only = 'false'

  const { body, contentType } = buildMultipart(fields)
  const url = `${baseUrl}/predict`
  ctx.logger.info(
    `Depth Anything POST ${url} (file=${image.filename}, grayscale=${fields.grayscale || 'true'}, pred_only=${fields.pred_only || 'true'})`,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getTimeout(args))
  try {
    const resp = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: controller.signal,
    })
    if (!resp.ok) {
      throw new Error(await readError(resp))
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    // 服务端保存的文件名（非必需，仅透传）
    const savedAs = resp.headers.get('x-saved-as') || ''
    return { buffer, savedAs }
  } finally {
    clearTimeout(timer)
  }
}

// ── 最小 ZIP reader（store + deflate，零依赖）──────────────
// sandbox 无第三方 unzip 库，但子模块可 require Node 内置 zlib。
// 服务端打包 PNG 可能用 store（compMethod=0）或 deflate（compMethod=8）。
let zlibFallback = null
function tryRequireZlib() {
  if (zlibFallback !== null) return zlibFallback
  try {
    zlibFallback = require('zlib')
  } catch {
    zlibFallback = false
  }
  return zlibFallback
}

function readZipEntries(buf) {
  // EOCD 在末尾，向后扫描签名 0x06054b50
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      const cdCount = buf.readUInt16LE(i + 10)
      const cdOffset = buf.readUInt32LE(i + 16)
      const entries = []
      let p = cdOffset
      for (let j = 0; j < cdCount; j++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) break
        const compMethod = buf.readUInt16LE(p + 10)
        const compSize = buf.readUInt32LE(p + 20)
        const nameLen = buf.readUInt16LE(p + 28)
        const extraLen = buf.readUInt16LE(p + 30)
        const commentLen = buf.readUInt16LE(p + 32)
        const localHeaderOffset = buf.readUInt32LE(p + 42)
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
        entries.push({ name, compMethod: compMethod, compSize, localHeaderOffset })
        p += 46 + nameLen + extraLen + commentLen
      }
      return entries
    }
  }
  throw new Error('Invalid zip: EOCD not found')
}

function readZipEntry(buf, entry) {
  if (entry.name.endsWith('/')) return null // 目录
  const lh = entry.localHeaderOffset
  const dataStart = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28)
  const raw = buf.subarray(dataStart, dataStart + entry.compSize)
  if (entry.compMethod === 0) return raw // stored
  if (entry.compMethod === 8) {
    // deflated（raw deflate，无 zlib 头）
    const zlib = tryRequireZlib()
    if (zlib && zlib.inflateRawSync) return zlib.inflateRawSync(raw)
    throw new Error('Deflate zip entry but zlib unavailable')
  }
  throw new Error(`Unsupported zip compression for ${entry.name}: ${entry.compMethod}`)
}

// 解析 ZIP，返回 [{ name, buffer }]，跳过目录，过滤掉 macOS __MACOSX 残留
function parseZip(buf) {
  const entries = readZipEntries(buf)
  const out = []
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue
    if (entry.name.includes('__MACOSX') || entry.name.startsWith('.')) continue
    const data = readZipEntry(buf, entry)
    if (data) out.push({ name: entry.name, buffer: Buffer.from(data) })
  }
  return out
}

// ── 主调用：批量上传多图，返回 ZIP ─────────────────────────
// images: [{ buffer, mime, filename }, ...]
// 上限 16 张，由 actions 层做切片。
async function predictBatchFromFiles(ctx, args, images) {
  if (!images.length) {
    throw new Error('Batch input must not be empty')
  }
  const baseUrl = getBaseUrl(args)
  // 同一字段名 files 重复，multipart 用数组值
  const fields = {
    files: images.map((img) => ({
      buffer: img.buffer,
      mime: img.mime,
      filename: img.filename,
    })),
  }
  if (args.grayscale === false) fields.grayscale = 'false'
  if (args.pred_only === false) fields.pred_only = 'false'

  const { body, contentType } = buildMultipart(fields)
  const url = `${baseUrl}/predict/batch`
  ctx.logger.info(
    `Depth Anything POST ${url} (files=${images.length}, grayscale=${fields.grayscale || 'true'}, pred_only=${fields.pred_only || 'true'})`,
  )

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), getTimeout(args))
  try {
    const resp = await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: controller.signal,
    })
    if (!resp.ok) {
      throw new Error(await readError(resp))
    }
    const zipBuffer = Buffer.from(await resp.arrayBuffer())
    return zipBuffer
  } finally {
    clearTimeout(timer)
  }
}

// ── 结果保存：PNG buffer → 公网可访问 httpPath ─────────────
function saveResultImage(ctx, buffer, extHint) {
  const saved = ctx.api.savePublicFile(buffer, extHint || 'png')
  if (!saved || !saved.httpPath) {
    throw new Error('Failed to save result image')
  }
  return saved
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  MAX_BATCH_FILES,
  getBaseUrl,
  getTimeout,
  mimeFromExt,
  extFromMime,
  basename,
  resolveImage,
  toImageArray,
  buildMultipart,
  predictFromFile,
  predictBatchFromFiles,
  parseZip,
  saveResultImage,
}
