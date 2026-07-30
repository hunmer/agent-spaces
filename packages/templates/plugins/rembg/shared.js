// Rembg HTTP 客户端封装
//
// 对接文档：D:\rembg\API.md
//   GET  /api/remove?url=...             从图片 URL 去背景（query 传参）
//   POST /api/remove                     multipart/form-data 上传文件去背景
//   通用参数：model / a / af / ab / ae / om / ppm / bgc / extras
//
// 运行时说明：插件在 vm sandbox 中执行，仅注入 fetch / Buffer / setTimeout 等，
// 没有 FormData / Blob，因此 multipart body 需手动拼装（参考 ai-image 插件做法）。

const fs = require('fs')

const DEFAULT_BASE_URL = 'http://localhost:7000'
const DEFAULT_MODEL = 'u2net'
const DEFAULT_TIMEOUT = 120000

// ── 配置解析 ────────────────────────────────────────────────
function getBaseUrl(args) {
  const v = args.baseUrl != null ? String(args.baseUrl).trim() : ''
  return v || DEFAULT_BASE_URL
}

function getModel(args) {
  const v = args.model != null ? String(args.model).trim() : ''
  return v || DEFAULT_MODEL
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

function basename(p) {
  const m = /[^/\\?]+/.exec(p || '')
  return m ? m[0] : 'image.png'
}

// ── 图片输入解析 ───────────────────────────────────────────
// 接受 data URI / http(s) URL / 本地路径，统一返回 { buffer, mime, filename }
async function resolveImage(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('图片输入不能为空')
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

  // http(s) URL：在客户端下载成 buffer，统一走 POST /api/remove 上传。
  // 不用 GET /api/remove?url=...，因为 rembg 服务端有 SSRF 防护，会拒绝
  // 回环/内网地址（如 127.0.0.1、192.168.x.x），本地图片必须由客户端下载后上传。
  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) {
      throw new Error(`下载图片失败: HTTP ${resp.status} ${input}`)
    }
    const buffer = Buffer.from(await resp.arrayBuffer())
    const mime = (resp.headers.get('content-type') || mimeFromExt(input)).split(';')[0].trim()
    return { buffer, mime, filename: basename(input) || `image.${extFromMime(mime)}` }
  }

  // 本地路径
  const buffer = fs.readFileSync(input)
  return { buffer, mime: mimeFromExt(input), filename: basename(input) }
}

function extFromMime(mime) {
  const sub = ((mime || 'image/png').split('/')[1] || 'png').split('+')[0].toLowerCase()
  return sub === 'jpeg' ? 'jpg' : sub
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

// ── 参数构建 ───────────────────────────────────────────────
// 构造通用参数对象（去掉空值），供 query / form 使用
function buildParams(args) {
  const params = {}
  if (args.model) params.model = String(args.model)

  // Alpha Matting
  if (args.alphaMatting === true || args.a === true) {
    params.a = 'true'
    if (args.af != null) params.af = String(args.af)
    if (args.ab != null) params.ab = String(args.ab)
    if (args.ae != null) params.ae = String(args.ae)
  }

  // 仅返回掩码
  if (args.maskOnly === true || args.om === true) {
    params.om = 'true'
  }

  // 掩码后处理
  if (args.postProcessMask === true || args.ppm === true) {
    params.ppm = 'true'
  }

  // 纯色背景（"R,G,B,A" 或 "#RRGGBB" 或 "R,G,B"）
  if (args.backgroundColor || args.bgc) {
    params.bgc = normalizeColor(args.backgroundColor || args.bgc)
  }

  // SAM prompt 等额外参数（对象或 JSON 字符串）
  if (args.extras) {
    params.extras = typeof args.extras === 'string' ? args.extras : JSON.stringify(args.extras)
  }

  return params
}

// 颜色归一化为 "R,G,B,A"
function normalizeColor(c) {
  if (!c) return ''
  const s = String(c).trim()
  // #RRGGBB / #RRGGBBAA
  const hex = /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s)
  if (hex) {
    const v = hex[1]
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    const a = v.length >= 8 ? parseInt(v.slice(6, 8), 16) : 255
    return `${r},${g},${b},${a}`
  }
  // 已经是 "R,G,B,A" 或 "R,G,B"
  if (/^\d+,\d+,\d+(,\d+)?$/.test(s)) {
    return s.split(',').length === 3 ? `${s},255` : s
  }
  // 其他原样透传，让服务端校验
  return s
}

// ── multipart 手拼（sandbox 无 FormData/Blob）──────────────
function buildMultipart(fields) {
  const boundary = '----RembgPlugin' + Math.random().toString(36).slice(2)
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

// 把对象转成 query string（不做 URL 编码，参数都是简单值；如需编码可改 encodeParams）
function toQueryString(params) {
  const parts = []
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

// ── 错误解析 ───────────────────────────────────────────────
async function readError(resp) {
  let detail = ''
  try {
    const text = await resp.text()
    try {
      const json = JSON.parse(text)
      detail = json.detail || JSON.stringify(json)
    } catch {
      detail = text.slice(0, 300)
    }
  } catch {
    /* ignore */
  }
  return `Rembg HTTP ${resp.status}${detail ? `: ${detail}` : ''}`
}

// ── 主调用：上传 buffer 去背景 ─────────────────────────────
// 所有输入（URL / 本地路径 / data URI）在 resolveImage 阶段都已转成 buffer，
// 统一走 POST /api/remove multipart 上传。不用 GET ?url= 是因为 rembg 服务端
// 有 SSRF 防护，会拒绝回环/内网地址，本地图片必须由客户端下载后上传。
// image: { buffer, mime, filename }
async function removeBackgroundFromFile(ctx, args, image) {
  if (!image.buffer) {
    throw new Error('图片解析失败：缺少 buffer')
  }

  const baseUrl = getBaseUrl(args)
  const formParams = buildParams(args)
  // bgc 与 extras 服务端要求走 query
  const queryArgs = {}
  if (formParams.bgc) {
    queryArgs.bgc = formParams.bgc
    delete formParams.bgc
  }
  if (formParams.extras) {
    queryArgs.extras = formParams.extras
    delete formParams.extras
  }

  const fields = {
    file: { buffer: image.buffer, mime: image.mime, filename: image.filename },
    ...formParams,
  }
  const { body, contentType } = buildMultipart(fields)
  const url = `${baseUrl}/api/remove${toQueryString(queryArgs)}`
  ctx.logger.info(`Rembg POST ${baseUrl}/api/remove (file=${image.filename}, model=${formParams.model || '-'})`)

  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  })
  if (!resp.ok) {
    throw new Error(await readError(resp))
  }
  return Buffer.from(await resp.arrayBuffer())
}

// ── 结果保存：PNG buffer → 公网可访问 httpPath ─────────────
function saveResultImage(ctx, buffer, extHint) {
  const saved = ctx.api.savePublicFile(buffer, extHint || 'png')
  if (!saved || !saved.httpPath) {
    throw new Error('结果图片落盘失败')
  }
  return saved
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT,
  getBaseUrl,
  getModel,
  getTimeout,
  mimeFromExt,
  extFromMime,
  basename,
  resolveImage,
  toImageArray,
  buildParams,
  normalizeColor,
  buildMultipart,
  removeBackgroundFromFile,
  saveResultImage,
}
