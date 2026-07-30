const fs = require('fs')

const DEFAULT_BASE_URL = 'http://127.0.0.1:30231'
const DEFAULT_TIMEOUT = 600000

function getBaseUrl(args) {
  const value = args?.baseUrl != null ? String(args.baseUrl).trim() : ''
  return (value || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function getTimeout(args) {
  const value = Number(args?.timeout)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT
}

function normalizeBoxes(input) {
  let boxes = input
  if (typeof boxes === 'string') {
    try {
      boxes = JSON.parse(boxes)
    } catch {
      throw new Error('boxes 必须是合法 JSON 数组')
    }
  }
  if (!Array.isArray(boxes)) return []
  return boxes.map((box, index) => {
    const normalized = {
      slot_id: box?.slot_id != null ? String(box.slot_id) : '',
      x_min: Number(box?.x_min),
      y_min: Number(box?.y_min),
      x_max: Number(box?.x_max),
      y_max: Number(box?.y_max),
    }
    if (!normalized.slot_id) throw new Error(`boxes[${index}].slot_id 不能为空`)
    for (const key of ['x_min', 'y_min', 'x_max', 'y_max']) {
      if (!Number.isFinite(normalized[key])) throw new Error(`boxes[${index}].${key} 必须是数字`)
    }
    if (normalized.x_max <= normalized.x_min || normalized.y_max <= normalized.y_min) {
      throw new Error(`boxes[${index}] 坐标范围无效`)
    }
    return normalized
  })
}

async function resolveImage(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('图片输入不能为空')
  const value = input.trim()
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(value)
  if (dataMatch) {
    const buffer = dataMatch[2]
      ? Buffer.from(dataMatch[3], 'base64')
      : Buffer.from(decodeURIComponent(dataMatch[3]), 'utf8')
    if (!buffer.length) throw new Error('图片 data URI 为空')
    return { buffer }
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await globalThis.fetch(value)
    if (!response.ok) throw new Error(`下载图片失败: HTTP ${response.status} ${value}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) throw new Error('下载图片为空')
    return { buffer }
  }
  const buffer = fs.readFileSync(value)
  if (!buffer.length) throw new Error('本地图片为空')
  return { buffer }
}

async function readResponseDetail(response) {
  const text = await response.text()
  if (!text) return ''
  try {
    const json = JSON.parse(text)
    return json.error || json.detail || json.message || text.slice(0, 500)
  } catch {
    return text.slice(0, 500)
  }
}

async function segmentWithBoxes({ baseUrl, timeout, imageBuffer, boxes }) {
  const response = await globalThis.fetch(`${baseUrl}/segment_with_boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: imageBuffer.toString('base64'), boxes }),
    signal: AbortSignal.timeout(timeout),
  })
  if (!response.ok) {
    const detail = await readResponseDetail(response)
    throw new Error(`SAM HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('SAM 响应不是合法 JSON')
  }
  if (!Array.isArray(payload?.masks)) throw new Error('SAM 响应缺少 masks 数组')
  return payload.masks.map((mask, index) => {
    const slotId = mask?.slot_id != null ? String(mask.slot_id) : ''
    if (!slotId) throw new Error(`SAM masks[${index}].slot_id 缺失`)
    if (typeof mask.mask_b64 !== 'string' || !mask.mask_b64) {
      throw new Error(`SAM masks[${index}].mask_b64 缺失`)
    }
    const score = Number(mask.score)
    return { slotId, score: Number.isFinite(score) ? score : null, maskB64: mask.mask_b64 }
  })
}

function saveMasks(ctx, masks) {
  return masks.map((mask) => {
    const buffer = Buffer.from(mask.maskB64, 'base64')
    if (!buffer.length) throw new Error(`SAM mask "${mask.slotId}" 解码为空`)
    const saved = ctx.api.savePublicFile(buffer, 'png')
    if (!saved?.httpPath) throw new Error(`SAM mask "${mask.slotId}" 落盘失败`)
    return { slotId: mask.slotId, score: mask.score, maskUrl: saved.httpPath }
  })
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  getBaseUrl,
  getTimeout,
  normalizeBoxes,
  resolveImage,
  segmentWithBoxes,
  saveMasks,
}
