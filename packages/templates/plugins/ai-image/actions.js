// AI 图片生成与编辑插件
// 对接 OpenAI 兼容的异步图像 API（参考 closeai.fans 等 DALL·E 格式中转）：
//   文生图  POST /v1/images/generations?async=true  (JSON)
//   图像编辑 POST /v1/images/edits?async=true       (multipart/form-data)
//   查询任务 GET /v1/images/tasks/{task_id}
// 提交返回 task_id，轮询查询接口直到终态（IN_PROGRESS / SUCCESS / FAILURE）。
//
// 运行时说明：插件在 vm sandbox 中执行，仅注入了 fetch / Buffer / setTimeout 等，
// 没有 FormData / Blob / AbortController，因此图像编辑的 multipart body 需要手动拼装。

const fs = require('fs')

// 版本前缀 /v1 由 baseUrl 承担，路径常量不带 /v1，方便用户自定义。
const DEFAULT_BASE_URL = 'https://ai.comfly.chat/v1'
const GENERATIONS_PATH = '/images/generations'
const EDITS_PATH = '/images/edits'
const TASK_PATH = '/images/tasks'
const CHAT_COMPLETIONS_PATH = '/chat/completions'
const RESPONSES_PATH = '/responses'
const POLL_INTERVAL = 5000
const POLL_MAX_ATTEMPTS = 120 // 最长 ~10 分钟

const API_MODES = [
  { label: '异步任务 (Images API)', value: 'async_task' },
  { label: 'Chat Completions', value: 'chat_completions' },
  { label: 'Responses', value: 'responses' },
]

const CONFIG_APIKEY = '{{ __config__["workflow.ai-image"]["apiKey"] }}'
const CONFIG_BASEURL = '{{ __config__["workflow.ai-image"]["baseUrl"] }}'

// ── 基础工具 ────────────────────────────────────────────────

function getBaseUrl(args) {
  return (args.baseUrl && String(args.baseUrl).trim()) || DEFAULT_BASE_URL
}

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 apiKey（请填写 Bearer Token）')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
}

// ── 同步接口模式（chat / responses）工具 ─────────────────────

function getApiMode(args) {
  const mode = (args.apiMode || 'async_task').toString()
  return API_MODES.some((m) => m.value === mode) ? mode : 'async_task'
}

// buffer → data URI（用于 chat image_url / responses input_image）
function bufferToDataUri(img) {
  const mime = (img && img.mime) || 'image/png'
  const buf = img && img.buffer
  if (!Buffer.isBuffer(buf)) throw new Error('无效的图片 buffer')
  return `data:${mime};base64,${buf.toString('base64')}`
}

// 比例 → Responses API 标准尺寸（非标准比例返回 ''，交由模型默认处理）
function aspectRatioToSize(ratio) {
  const map = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
  }
  return map[ratio] || ''
}

// 从 chat/completions 的 message.content 提取图片
// content 可能是字符串（markdown/url/data-uri）或多模态数组（image_url）
function extractImagesFromChatContent(content, ctx) {
  const images = []
  const collect = (raw) => {
    if (!raw) return
    // http(s) 图片 URL（非页面 URL：不含 html/htm 后缀，避免把网页链接当图片）
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif|bmp)(\?\S*)?$/i.test(raw)) {
      images.push(raw)
      return
    }
    // data:image/...;base64,xxxx
    const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(raw)
    if (dataMatch) {
      const mime = (dataMatch[1] || 'image/png').split(';')[0]
      const buf = Buffer.from(dataMatch[3], 'base64')
      const { httpPath } = ctx.api.savePublicFile(buf, extFromMime(mime))
      images.push(httpPath)
      return
    }
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      // 常见写法 { type:'image_url', image_url:{ url } } 或 { type:'image', image:{ url } }
      const url =
        (part.image_url && (part.image_url.url || part.image_url)) ||
        (part.image && (part.image.url || part.image)) ||
        part.url
      collect(typeof url === 'string' ? url : '')
    }
  } else if (typeof content === 'string') {
    // 1) markdown 图片 ![..](url)
    const mdRe = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
    let mdHit = false
    let m
    while ((m = mdRe.exec(content))) {
      mdHit = true
      collect(m[1])
    }
    if (mdHit && images.length) return images
    // 2) content 整体就是 url / data-uri
    const trimmed = content.trim()
    if (/^(https?:|data:)/i.test(trimmed)) {
      collect(trimmed)
      if (images.length) return images
    }
    // 3) 文本里散落的 url / data-uri
    const re = /(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp)(?:\?\S*)?|data:[^;\s]+;base64,[A-Za-z0-9+/=]+)/gi
    while ((m = re.exec(content))) collect(m[1])
  }
  return images
}

// 从 /v1/responses 的 output 数组提取图片
// output 项 type === 'image_generation_call' → result(b64_json)，兜底取 image_url
function extractImagesFromResponsesOutput(output, ctx) {
  const images = []
  const items = Array.isArray(output) ? output : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item.type === 'image_generation_call' || item.type === 'image_generation') {
      if (typeof item.result === 'string' && item.result) {
        const { httpPath } = ctx.api.savePublicFile(Buffer.from(item.result, 'base64'), 'png')
        images.push(httpPath)
      } else if (typeof item.image_url === 'string') {
        images.push(item.image_url)
      } else if (item.url) {
        images.push(item.url)
      }
    }
  }
  return images
}

// 通用同步 POST + 返回 { images, model, created }
async function runChatCompletions(ctx, args, body) {
  const baseUrl = getBaseUrl(args)
  const headers = getHeaders(args)
  ctx.logger.info(`chat/completions model=${body.model} 同步请求`)
  const resp = await ctx.api.postJson(`${baseUrl}${CHAT_COMPLETIONS_PATH}`, {
    headers,
    body,
    timeout: 180000,
  })
  const choice = resp && resp.choices && resp.choices[0]
  if (!choice) throw new Error(`chat/completions 响应异常: ${JSON.stringify(resp).slice(0, 200)}`)
  // content：字符串（markdown/url/data-uri）或多模态数组（image_url）
  const content = choice.message && choice.message.content
  const images = extractImagesFromChatContent(content, ctx)
  if (!images.length) {
    throw new Error(`未从 chat/completions 响应解析到图片: ${JSON.stringify(content).slice(0, 200)}`)
  }
  return { images, model: resp.model || body.model, created: resp.created }
}

async function runResponses(ctx, args, body) {
  const baseUrl = getBaseUrl(args)
  const headers = getHeaders(args)
  ctx.logger.info(`/v1/responses model=${body.model} 同步请求`)
  const resp = await ctx.api.postJson(`${baseUrl}${RESPONSES_PATH}`, {
    headers,
    body,
    timeout: 180000,
  })
  const output = (resp && resp.output) || []
  const images = extractImagesFromResponsesOutput(output, ctx)
  if (!images.length) {
    throw new Error(`未从 /v1/responses 响应解析到图片: ${JSON.stringify(resp).slice(0, 200)}`)
  }
  return { images, model: resp.model || body.model, created: resp.created }
}

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

// ── 图片输入解析 ────────────────────────────────────────────
// 接受 data URI / http(s) URL / 本地路径，统一返回 { buffer, mime, filename }
async function resolveImage(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('图片输入不能为空')

  // data:image/png;base64,xxxx 或 data:image/png,xxxx
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(input)
  if (dataMatch) {
    const mime = (dataMatch[1] || 'image/png').split(';')[0]
    const isBase64 = !!dataMatch[2]
    const buffer = isBase64
      ? Buffer.from(dataMatch[3], 'base64')
      : Buffer.from(decodeURIComponent(dataMatch[3]), 'utf-8')
    return { buffer, mime, filename: `image.${extFromMime(mime)}` }
  }

  // http(s) URL：用注入的 fetch 下载
  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) throw new Error(`下载图片失败: HTTP ${resp.status}`)
    const buffer = Buffer.from(await resp.arrayBuffer())
    const mime = (resp.headers.get('content-type') || mimeFromExt(input)).split(';')[0].trim()
    const filename = basename(input) || `image.${extFromMime(mime)}`
    return { buffer, mime, filename }
  }

  // 本地路径
  const buffer = fs.readFileSync(input)
  return { buffer, mime: mimeFromExt(input), filename: basename(input) }
}

// 把 string / string[] / JSON 字符串归一为图片数组
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
  const boundary = '----AIImagePlugin' + Math.random().toString(36).slice(2)
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
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

// ── 任务结果解析 ────────────────────────────────────────────
// 任务查询响应：result.data = { status, progress, fail_reason, data: { data: [{url,b64_json}], model, created, usage } }
async function extractImages(taskData, ctx) {
  const payload = taskData && taskData.data ? taskData.data : {}
  const items = Array.isArray(payload.data) ? payload.data : []
  const images = []
  const revisedPrompts = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item.revised_prompt) revisedPrompts.push(item.revised_prompt)
    if (item.url) {
      images.push(item.url)
    } else if (item.b64_json) {
      const { httpPath } = ctx.api.savePublicFile(Buffer.from(item.b64_json, 'base64'), 'png')
      images.push(httpPath)
    }
  }
  return {
    images,
    model: payload.model,
    created: payload.created,
    usage: payload.usage,
    revisedPrompts,
  }
}

// 轮询任务直到终态
async function pollTask(ctx, args, taskId) {
  const baseUrl = getBaseUrl(args)
  const headers = getHeaders(args)
  const url = `${baseUrl}${TASK_PATH}/${encodeURIComponent(taskId)}`
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
    let result
    try {
      result = await ctx.api.getJson(url, { headers, timeout: 30000 })
    } catch (err) {
      ctx.logger.warning(`查询任务失败，将重试: ${err.message}`)
      continue
    }
    const data = result && result.data ? result.data : {}
    const status = String(data.status || '').toUpperCase()
    ctx.logger.info(`任务 ${taskId} 状态: ${status || '未知'} ${data.progress || ''}`)
    if (status === 'SUCCESS') return data
    if (status === 'FAILURE' || status === 'FAILED') {
      throw new Error(`图片任务失败: ${data.fail_reason || result.message || '未知错误'}`)
    }
  }
  throw new Error(`轮询超时（约 ${Math.round((POLL_MAX_ATTEMPTS * POLL_INTERVAL) / 60000)} 分钟）`)
}

// 提交任务 → 拿 task_id → 轮询 → 提取图片
async function submitAndPoll(ctx, args, submitFn) {
  const taskId = await submitFn()
  if (!taskId) throw new Error('提交任务成功但未返回 task_id')
  ctx.logger.info(`已提交任务 task_id=${taskId}，开始轮询...`)
  const taskData = await pollTask(ctx, args, taskId)
  const out = await extractImages(taskData, ctx)
  return { taskId, ...out }
}

function pickTaskId(r) {
  if (!r) return ''
  // comfly 等服务直接在顶层返回 { task_id }；closeai 风格返回 { data: taskId | { task_id } }
  if (typeof r.task_id === 'string' && r.task_id) return r.task_id
  if (typeof r.data === 'string') return r.data
  if (r.data && typeof r.data === 'object') return r.data.task_id || ''
  return ''
}

module.exports = (t) => [
  {
    name: 'ai_image_generate',
    label: t('action.generate.label', 'AI Text to Image'),
    category: t('category', 'AI Image'),
    icon: 'Image',
    description: t(
      'action.generate.description',
      'Generate images from text descriptions via an OpenAI-compatible async image API.',
    ),
    properties: [
      {
        key: 'apiKey',
        label: t('field.apiKey.label', 'API Key'),
        type: 'text',
        dataType: 'string',
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        dataType: 'string',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
      },
      {
        key: 'apiMode',
        label: t('field.apiMode.label', 'API Mode'),
        type: 'select',
        dataType: 'string',
        default: 'async_task',
        options: API_MODES,
        tooltip: t(
          'field.apiMode.tooltip',
          'async_task: /v1/images/generations 轮询；chat_completions: /v1/chat/completions 同步；responses: /v1/responses 同步。',
        ),
      },
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Image Description'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.prompt.tooltip', 'Describe the image you want to generate.'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: 'gpt-image-2-all',
        options: [
          { label: 'gpt-image-2-all', value: 'gpt-image-2-all' },
          { label: 'gpt-image-1', value: 'gpt-image-1' },
          { label: 'sora_image', value: 'sora_image' },
          { label: 'nano-banana', value: 'nano-banana' },
          { label: 'dall-e-3', value: 'dall-e-3' },
          { label: 'flux-pro-1.1', value: 'flux-pro-1.1' },
          { label: 'flux-kontext-pro', value: 'flux-kontext-pro' },
        ],
      },
      {
        key: 'aspectRatio',
        label: t('field.aspectRatio.label', 'Aspect Ratio'),
        type: 'select',
        dataType: 'string',
        default: '1:1',
        options: [
          { label: '1:1', value: '1:1' },
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '4:3', value: '4:3' },
          { label: '3:4', value: '3:4' },
          { label: '3:2', value: '3:2' },
          { label: '2:3', value: '2:3' },
        ],
      },
      {
        key: 'n',
        label: t('field.n.label', 'Count'),
        type: 'number',
        dataType: 'number',
        default: 1,
        tooltip: t('field.n.tooltip', 'Number of images to generate.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object', dataType: 'object',
        children: [
          { key: 'images', type: 'image[]' },
          { key: 'taskId', type: 'string' },
          { key: 'model', type: 'string' },
          { key: 'created', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const model = args.model || 'gpt-image-2-all'
      const prompt = args.prompt
      const mode = getApiMode(args)
      ctx.logger.info(`文生图 mode=${mode} model=${model} ratio=${args.aspectRatio || '默认'} n=${args.n || 1}`)
      ctx.logger.info(`提示词: ${prompt}`)

      // ── chat/completions：同步，messages 取图 ──
      if (mode === 'chat_completions') {
        const body = {
          model,
          messages: [{ role: 'user', content: prompt }],
          ...(args.n && { n: Number(args.n) }),
        }
        const out = await runChatCompletions(ctx, args, body)
        return {
          success: true,
          message: t('message.generated', 'Generated {count} image(s)').replace('{count}', out.images.length),
          data: { images: out.images, taskId: '', model: out.model, created: out.created },
        }
      }

      // ── responses：同步，image_generation 工具 ──
      if (mode === 'responses') {
        const size = aspectRatioToSize(args.aspectRatio)
        const tool = { type: 'image_generation', ...(size && { size }) }
        const body = {
          model,
          input: prompt,
          tools: [tool],
        }
        const out = await runResponses(ctx, args, body)
        return {
          success: true,
          message: t('message.generated', 'Generated {count} image(s)').replace('{count}', out.images.length),
          data: { images: out.images, taskId: '', model: out.model, created: out.created },
        }
      }

      // ── async_task：现有异步任务逻辑（默认，兼容旧配置）──
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const body = {
        prompt,
        model,
        ...(args.aspectRatio && { aspect_ratio: args.aspectRatio }),
        ...(args.n && { n: Number(args.n) }),
      }
      const out = await submitAndPoll(ctx, args, async () => {
        const r = await ctx.api.postJson(`${baseUrl}${GENERATIONS_PATH}?async=true`, {
          headers,
          body,
          timeout: 60000,
        })
        const taskId = pickTaskId(r)
        if (!taskId) {
          throw new Error(`提交失败: ${r.code || ''} ${r.message || JSON.stringify(r).slice(0, 200)}`)
        }
        return taskId
      })
      return {
        success: true,
        message: t('message.generated', 'Generated {count} image(s)').replace('{count}', out.images.length),
        data: {
          images: out.images,
          taskId: out.taskId,
          model: out.model,
          created: out.created,
        },
      }
    },
  },

  {
    name: 'ai_image_edit',
    label: t('action.edit.label', 'AI Image Edit'),
    category: t('category', 'AI Image'),
    icon: 'Wand2',
    description: t(
      'action.edit.description',
      'Edit images from reference image(s) and a text instruction (gpt-image-1, flux-kontext, etc.).',
    ),
    properties: [
      {
        key: 'apiKey',
        label: t('field.apiKey.label', 'API Key'),
        type: 'text',
        dataType: 'string',
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        dataType: 'string',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
      },
      {
        key: 'apiMode',
        label: t('field.apiMode.label', 'API Mode'),
        type: 'select',
        dataType: 'string',
        default: 'async_task',
        options: API_MODES,
        tooltip: t(
          'field.apiMode.tooltip',
          'async_task: /v1/images/edits 轮询；chat_completions: /v1/chat/completions 多模态同步；responses: /v1/responses input_image 同步。',
        ),
      },
      {
        key: 'image',
        label: t('field.image.label', 'Reference Image'),
        type: 'textarea',
        dataType: 'string[]',
        required: true,
        tooltip: t(
          'field.image.tooltip',
          'Image URL / data URI / local path. Multiple allowed. JSON array supported.',
        ),
      },
      {
        key: 'prompt',
        label: t('field.editPrompt.label', 'Edit Instruction'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.editPrompt.tooltip', 'Describe how to edit the image, e.g. "put on sunglasses".'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: 'gpt-image-2-all',
        options: [
          { label: 'gpt-image-2-all', value: 'gpt-image-2-all' },
          { label: 'gpt-image-1', value: 'gpt-image-1' },
          { label: 'flux-kontext-pro', value: 'flux-kontext-pro' },
          { label: 'flux-kontext-max', value: 'flux-kontext-max' },
          { label: 'nano-banana', value: 'nano-banana' },
        ],
      },
      {
        key: 'mask',
        label: t('field.mask.label', 'Mask (optional)'),
        type: 'textarea',
        dataType: 'string',
        tooltip: t(
          'field.mask.tooltip',
          'PNG mask: transparent (alpha=0) areas are edited. Same size as the first image. gpt-image-1 only.',
        ),
      },
      {
        key: 'aspectRatio',
        label: t('field.aspectRatio.label', 'Aspect Ratio'),
        type: 'select',
        dataType: 'string',
        default: '1:1',
        options: [
          { label: '1:1', value: '1:1' },
          { label: '16:9', value: '16:9' },
          { label: '9:16', value: '9:16' },
          { label: '4:3', value: '4:3' },
          { label: '3:4', value: '3:4' },
        ],
      },
      {
        key: 'n',
        label: t('field.n.label', 'Count'),
        type: 'number',
        dataType: 'number',
        default: 1,
        tooltip: t('field.n.tooltip', 'Number of images to generate.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object', dataType: 'object',
        children: [
          { key: 'images', type: 'image[]' },
          { key: 'taskId', type: 'string' },
          { key: 'model', type: 'string' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const inputs = toImageArray(args.image)
      if (!inputs.length) {
        return { success: false, message: t('message.imageRequired', 'At least one reference image is required.') }
      }

      const files = []
      for (const src of inputs) files.push(await resolveImage(src))

      const model = args.model || 'gpt-image-1'
      const prompt = args.prompt
      const mode = getApiMode(args)

      // ── chat/completions：多模态 messages 同步取图 ──
      if (mode === 'chat_completions') {
        const content = [{ type: 'text', text: prompt }]
        for (const f of files) {
          content.push({ type: 'image_url', image_url: { url: bufferToDataUri(f) } })
        }
        if (args.mask) {
          const maskFile = await resolveImage(args.mask)
          content.push({ type: 'image_url', image_url: { url: bufferToDataUri(maskFile) } })
        }
        ctx.logger.info(`图片编辑 chat/completions model=${model} 输入图片=${files.length} 蒙版=${args.mask ? '有' : '无'}`)
        ctx.logger.info(`编辑指令: ${prompt}`)
        const body = { model, messages: [{ role: 'user', content }], ...(args.n && { n: Number(args.n) }) }
        const out = await runChatCompletions(ctx, args, body)
        return {
          success: true,
          message: t('message.edited', 'Edited {count} image(s)').replace('{count}', out.images.length),
          data: { images: out.images, taskId: '', model: out.model },
        }
      }

      // ── responses：input 数组多模态同步取图 ──
      if (mode === 'responses') {
        const content = [{ type: 'input_text', text: prompt }]
        for (const f of files) {
          content.push({ type: 'input_image', image_url: bufferToDataUri(f) })
        }
        if (args.mask) {
          const maskFile = await resolveImage(args.mask)
          content.push({ type: 'input_image', image_url: bufferToDataUri(maskFile) })
        }
        ctx.logger.info(`图片编辑 /v1/responses model=${model} 输入图片=${files.length} 蒙版=${args.mask ? '有' : '无'}`)
        ctx.logger.info(`编辑指令: ${prompt}`)
        const body = { model, input: [{ role: 'user', content }], tools: [{ type: 'image_generation' }] }
        const out = await runResponses(ctx, args, body)
        return {
          success: true,
          message: t('message.edited', 'Edited {count} image(s)').replace('{count}', out.images.length),
          data: { images: out.images, taskId: '', model: out.model },
        }
      }

      // ── async_task：现有异步任务逻辑（默认，兼容旧配置）──
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const fields = {}
      // 多图用 image[]，单图用 image（OpenAI / gpt-image-1 多参考图约定）
      const fileField = files.length > 1 ? 'image[]' : 'image'
      fields[fileField] = files.map((f) => ({ buffer: f.buffer, filename: f.filename, mime: f.mime }))

      fields.prompt = prompt
      fields.model = model
      if (args.aspectRatio) fields.aspect_ratio = args.aspectRatio
      if (args.n) fields.n = String(args.n)
      if (args.mask) {
        const maskFile = await resolveImage(args.mask)
        fields.mask = { buffer: maskFile.buffer, filename: maskFile.filename, mime: maskFile.mime || 'image/png' }
      }

      const mp = buildMultipart(fields)
      ctx.logger.info(`图片编辑 model=${fields.model} 输入图片=${files.length} 蒙版=${args.mask ? '有' : '无'}`)
      ctx.logger.info(`编辑指令: ${prompt}`)

      const out = await submitAndPoll(ctx, args, async () => {
        const resp = await globalThis.fetch(`${baseUrl}${EDITS_PATH}?async=true`, {
          method: 'POST',
          headers: { Authorization: headers.Authorization, 'Content-Type': mp.contentType },
          body: mp.body,
        })
        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`提交编辑失败: HTTP ${resp.status} ${text.slice(0, 200)}`)
        }
        const r = await resp.json()
        const taskId = pickTaskId(r)
        if (!taskId) {
          throw new Error(`提交失败: ${r.code || ''} ${r.message || JSON.stringify(r).slice(0, 200)}`)
        }
        return taskId
      })

      return {
        success: true,
        message: t('message.edited', 'Edited {count} image(s)').replace('{count}', out.images.length),
        data: { images: out.images, taskId: out.taskId, model: out.model },
      }
    },
  },

  {
    name: 'ai_image_query_task',
    label: t('action.query.label', 'Query Image Task'),
    category: t('category', 'AI Image'),
    icon: 'Search',
    description: t(
      'action.query.description',
      'Query an async image task by task_id once. Returns current status and images if finished.',
    ),
    tool: false,
    properties: [
      {
        key: 'apiKey',
        label: t('field.apiKey.label', 'API Key'),
        type: 'text',
        dataType: 'string',
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        dataType: 'string',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
      },
      {
        key: 'taskId',
        label: t('field.taskId.label', 'Task ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.taskId.tooltip', 'task_id returned by a generate/edit action.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object', dataType: 'object',
        children: [
          { key: 'status', type: 'string' },
          { key: 'progress', type: 'string' },
          { key: 'images', type: 'image[]' },
          { key: 'taskId', type: 'string' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.taskId) return { success: false, message: t('message.taskIdRequired', 'task_id is required.') }
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const url = `${baseUrl}${TASK_PATH}/${encodeURIComponent(args.taskId)}`
      ctx.logger.info(`查询任务 ${args.taskId}`)
      const r = await ctx.api.getJson(url, { headers, timeout: 30000 })
      const data = (r && r.data) || {}
      const status = String(data.status || '').toUpperCase()
      if (status === 'SUCCESS') {
        const out = await extractImages(data, ctx)
        return {
          success: true,
          message: t('message.taskSuccess', 'Task succeeded'),
          data: {
            status,
            images: out.images,
            taskId: args.taskId,
            model: out.model,
            created: out.created,
          },
        }
      }
      if (status === 'FAILURE' || status === 'FAILED') {
        return {
          success: false,
          message: t('message.taskFailed', 'Task failed: {reason}').replace(
            '{reason}',
            data.fail_reason || r.message || '',
          ),
          data: { status, taskId: args.taskId },
        }
      }
      return {
        success: true,
        message: t('message.taskInProgress', 'Task in progress: {progress}').replace(
          '{progress}',
          data.progress || status || '',
        ),
        data: { status, progress: data.progress || '', taskId: args.taskId },
      }
    },
  },
]
