// ComfyUI HTTP API 公共封装
// 文档参考: https://github.com/comfyanonymous/ComfyUI
// ComfyUI 本地服务通常无需鉴权；如开启反向代理鉴权，可在节点入参传 auth。

const DEFAULT_BASE_URL = 'http://127.0.0.1:8188'
const POLL_INTERVAL = 2000 // 轮询历史间隔

/** 解析配置，统一从 args（含 __config__ 注入）取值 */
function getConfig(args) {
  return {
    baseUrl: (args && args.baseUrl ? String(args.baseUrl) : '').trim() || DEFAULT_BASE_URL,
    timeout: Number(args && args.timeout) || 600000,
    clientId: (args && args.clientId) || `workfox-${Math.random().toString(36).slice(2, 10)}`,
  }
}

/** 规范化 base url：去掉结尾斜杠 */
function getBaseUrl(args) {
  return getConfig(args).baseUrl.replace(/\/+$/, '')
}

/** 构造鉴权头（可选）。支持 { type:'bearer', token } 或 { type:'basic', username, password } */
function authHeaders(args) {
  const auth = args && args.auth
  if (!auth || typeof auth !== 'object') return {}
  if (auth.type === 'bearer' && auth.token) {
    return { Authorization: `Bearer ${auth.token}` }
  }
  if (auth.type === 'basic' && auth.username != null) {
    return { Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password || ''}`).toString('base64')}` }
  }
  return {}
}

/** GET */
async function comfyGet(ctx, args, path, query) {
  const base = getBaseUrl(args)
  let url = `${base}${path}`
  if (query && typeof query === 'object') {
    const qs = []
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    }
    if (qs.length) url += `?${qs.join('&')}`
  }
  return ctx.api.fetchJson(url, { headers: authHeaders(args), timeout: getConfig(args).timeout })
}

/** POST JSON */
async function comfyPost(ctx, args, path, body) {
  const base = getBaseUrl(args)
  const url = `${base}${path}`
  return ctx.api.postJson(url, {
    headers: authHeaders(args),
    body: body || {},
    timeout: getConfig(args).timeout,
  })
}

/**
 * 提交工作流到队列。prompt 必须是 ComfyUI API 格式（节点 id 为键的对象）。
 * 返回 { prompt_id, number, node_errors }
 */
async function submitPrompt(ctx, args, prompt, extraData) {
  const cfg = getConfig(args)
  const body = {
    prompt,
    client_id: cfg.clientId,
  }
  if (extraData && typeof extraData === 'object') {
    body.extra_data = extraData
  }
  ctx.logger.info(`Submitting workflow to ${getBaseUrl(args)}/prompt`)
  const res = await comfyPost(ctx, args, '/prompt', body)
  if (!res || !res.prompt_id) {
    const msg = res && res.node_errors ? `node_errors: ${JSON.stringify(res.node_errors)}` : 'no prompt_id returned'
    throw new Error(`ComfyUI submit failed: ${msg}`)
  }
  ctx.logger.info(`Submitted prompt_id=${res.prompt_id}, number=${res.number}`)
  return res
}

/**
 * 轮询 /history/{prompt_id} 直到任务结束。
 * 返回该 prompt 的 history 条目 { outputs, status, ... }。
 */
async function pollHistory(ctx, args, promptId) {
  const base = getBaseUrl(args)
  const deadline = Date.now() + getConfig(args).timeout
  const url = `${base}/history/${encodeURIComponent(promptId)}`
  let lastLogged = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    let res
    try {
      res = await ctx.api.fetchJson(url, { headers: authHeaders(args), timeout: 30000 })
    } catch (err) {
      ctx.logger.warning(`Query history failed, will retry: ${err.message}`)
      continue
    }
    const entry = res && res[promptId]
    if (!entry) {
      // 还在队列中，未进入历史
      if (Date.now() - lastLogged > 10000) {
        ctx.logger.info(`prompt_id=${promptId} still running...`)
        lastLogged = Date.now()
      }
      continue
    }
    const status = entry.status || {}
    const completed = status.completed !== undefined ? !!status.completed : status.status_str === 'success'
    // ComfyUI 执行完成才写入 history（默认配置下），entry 出现即视为完成
    if (entry.outputs || completed || status.status_str) {
      ctx.logger.info(`prompt_id=${promptId} completed (status_str=${status.status_str || 'success'})`)
    }
    return entry
  }
  throw new Error(`ComfyUI workflow timed out after ${getConfig(args).timeout}ms (prompt_id=${promptId})`)
}

/**
 * 从 history entry 的 outputs 中提取输出文件清单。
 * 返回 [{ nodeId, type, filename, subfolder, kind }, ...]
 * kind: 'image' | 'gif' | 'audio' | 'video' | 'file'
 */
function extractOutputFiles(entry) {
  const files = []
  if (!entry || !entry.outputs) return files
  for (const [nodeId, out] of Object.entries(entry.outputs)) {
    const pushList = (arr, kind) => {
      if (!Array.isArray(arr)) return
      for (const f of arr) {
        if (!f || !f.filename) continue
        files.push({ nodeId, kind, filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output' })
      }
    }
    pushList(out.images, 'image')
    pushList(out.gifs, 'gif')
    pushList(out.audio, 'audio')
    pushList(out.video, 'video')
    if (Array.isArray(out.files)) pushList(out.files, 'file')
  }
  return files
}

/** 拼装 /view 访问 URL */
function viewUrl(args, file) {
  const base = getBaseUrl(args)
  const q = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
  })
  return `${base}/view?${q.toString()}`
}

/**
 * 上传图片到 ComfyUI 的 /upload/image（multipart/form-data）。
 * ComfyUI 字段：image(文件) + 可选 type("input"|"temp"|"output") + 可选 overwrite + 可选 subfolder。
 * 返回 ComfyUI 响应 { name, subfolder, type }
 */
async function uploadImage(ctx, args, filePath, { type = 'input', subfolder = '', overwrite = false } = {}) {
  const fs = require('fs')
  const path = require('path')
  const buffer = fs.readFileSync(filePath)
  const filename = path.basename(filePath)
  const ext = path.extname(filename).toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'

  const boundary = '----ComfyUIPlugin' + Math.random().toString(36).slice(2)
  const chunks = []
  const text = (str) => chunks.push(Buffer.from(str, 'utf-8'))
  text(`--${boundary}\r\n`)
  text(`Content-Disposition: form-data; name="image"; filename="${filename}"\r\n`)
  text(`Content-Type: ${mime}\r\n\r\n`)
  chunks.push(buffer)
  text('\r\n')
  text(`--${boundary}\r\n`)
  text(`Content-Disposition: form-data; name="type"\r\n\r\n${type}\r\n`)
  if (subfolder) {
    text(`--${boundary}\r\n`)
    text(`Content-Disposition: form-data; name="subfolder"\r\n\r\n${subfolder}\r\n`)
  }
  if (overwrite) {
    text(`--${boundary}\r\n`)
    text(`Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n`)
  }
  text(`--${boundary}--\r\n`)

  const url = `${getBaseUrl(args)}/upload/image`
  ctx.logger.info(`Uploading image ${filename} -> ${url}`)
  const resp = await globalThis.fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(args), 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(chunks),
  })
  if (!resp.ok) {
    const text2 = await resp.text().catch(() => '')
    throw new Error(`ComfyUI upload failed: HTTP ${resp.status} ${text2.slice(0, 300)}`)
  }
  return resp.json()
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
}

/** 防御式解析为对象（工作流 prompt / auth / extraData 等输入） */
function asObject(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

module.exports = {
  getConfig,
  getBaseUrl,
  authHeaders,
  comfyGet,
  comfyPost,
  submitPrompt,
  pollHistory,
  extractOutputFiles,
  viewUrl,
  uploadImage,
  asObject,
}
