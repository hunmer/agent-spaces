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

const DEFAULT_BASE_URL = 'https://api.closeai.fans'
const GENERATIONS_PATH = '/v1/images/generations'
const EDITS_PATH = '/v1/images/edits'
const TASK_PATH = '/v1/images/tasks'
const POLL_INTERVAL = 5000
const POLL_MAX_ATTEMPTS = 120 // 最长 ~10 分钟

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
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
      },
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Image Description'),
        type: 'textarea',
        required: true,
        tooltip: t('field.prompt.tooltip', 'Describe the image you want to generate.'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        default: 'sora_image',
        options: [
          { label: 'sora_image', value: 'sora_image' },
          { label: 'nano-banana', value: 'nano-banana' },
          { label: 'gpt-image-1', value: 'gpt-image-1' },
          { label: 'dall-e-3', value: 'dall-e-3' },
          { label: 'flux-pro-1.1', value: 'flux-pro-1.1' },
          { label: 'flux-kontext-pro', value: 'flux-kontext-pro' },
        ],
      },
      {
        key: 'size',
        label: t('field.size.label', 'Size'),
        type: 'select',
        default: '1024x1024',
        options: [
          { label: '1024x1024', value: '1024x1024' },
          { label: '1024x1792', value: '1024x1792' },
          { label: '1792x1024', value: '1792x1024' },
          { label: 'auto', value: 'auto' },
        ],
      },
      {
        key: 'n',
        label: t('field.n.label', 'Count'),
        type: 'number',
        default: 1,
        tooltip: t('field.n.tooltip', 'Number of images to generate.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        children: [
          { key: 'images', type: 'image[]' },
          { key: 'taskId', type: 'string' },
          { key: 'model', type: 'string' },
          { key: 'created', type: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const body = {
        prompt: args.prompt,
        model: args.model || 'sora_image',
        ...(args.size && { size: args.size }),
        ...(args.n && { n: Number(args.n) }),
      }
      ctx.logger.info(`文生图 model=${body.model} size=${body.size || 'auto'} n=${body.n || 1}`)
      ctx.logger.info(`提示词: ${body.prompt}`)
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
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
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
        required: true,
        tooltip: t('field.editPrompt.tooltip', 'Describe how to edit the image, e.g. "put on sunglasses".'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        default: 'gpt-image-1',
        options: [
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
        tooltip: t(
          'field.mask.tooltip',
          'PNG mask: transparent (alpha=0) areas are edited. Same size as the first image. gpt-image-1 only.',
        ),
      },
      {
        key: 'size',
        label: t('field.size.label', 'Size'),
        type: 'select',
        default: 'auto',
        options: [
          { label: 'auto', value: 'auto' },
          { label: '1024x1024', value: '1024x1024' },
          { label: '1024x1536', value: '1024x1536' },
          { label: '1536x1024', value: '1536x1024' },
        ],
      },
      {
        key: 'n',
        label: t('field.n.label', 'Count'),
        type: 'number',
        default: 1,
        tooltip: t('field.n.tooltip', 'Number of images to generate.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        children: [
          { key: 'images', type: 'image[]' },
          { key: 'taskId', type: 'string' },
          { key: 'model', type: 'string' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const inputs = toImageArray(args.image)
      if (!inputs.length) {
        return { success: false, message: t('message.imageRequired', 'At least one reference image is required.') }
      }

      const files = []
      for (const src of inputs) files.push(await resolveImage(src))

      const fields = {}
      // 多图用 image[]，单图用 image（OpenAI / gpt-image-1 多参考图约定）
      const fileField = files.length > 1 ? 'image[]' : 'image'
      fields[fileField] = files.map((f) => ({ buffer: f.buffer, filename: f.filename, mime: f.mime }))

      fields.prompt = args.prompt
      fields.model = args.model || 'gpt-image-1'
      if (args.size) fields.size = args.size
      if (args.n) fields.n = String(args.n)
      if (args.mask) {
        const maskFile = await resolveImage(args.mask)
        fields.mask = { buffer: maskFile.buffer, filename: maskFile.filename, mime: maskFile.mime || 'image/png' }
      }

      const mp = buildMultipart(fields)
      ctx.logger.info(`图片编辑 model=${fields.model} 输入图片=${files.length} 蒙版=${args.mask ? '有' : '无'}`)
      ctx.logger.info(`编辑指令: ${args.prompt}`)

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
        required: true,
        default: CONFIG_APIKEY,
        tooltip: t('field.apiKey.tooltip', 'Bearer token for the image service.'),
      },
      {
        key: 'baseUrl',
        label: t('field.baseUrl.label', 'API Base URL'),
        type: 'text',
        default: CONFIG_BASEURL,
        tooltip: t('field.baseUrl.tooltip', 'OpenAI-compatible image API base URL.'),
      },
      {
        key: 'taskId',
        label: t('field.taskId.label', 'Task ID'),
        type: 'text',
        required: true,
        tooltip: t('field.taskId.tooltip', 'task_id returned by a generate/edit action.'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
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
