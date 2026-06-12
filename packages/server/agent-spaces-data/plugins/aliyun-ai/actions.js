// ============================================================
// 阿里云百炼 AI 插件 - 统一 Actions
// 合并自: tools-asr.js, tools-image.js, tools-upload.js, tools-video.js, workflow.js
// ============================================================

const shared = require('./shared')

const {
  SYNC_ENDPOINT,
  ASYNC_ENDPOINTS,
  getHeaders,
  extractImageUrls,
  extractLegacyImageUrls,
  executeAsyncTask,
} = shared

// ASR specific constants
const TASK_SUBMIT_ENDPOINT = '/api/v1/services/audio/asr/transcription'
const TASK_QUERY_BASE = 'https://dashscope.aliyuncs.com/api/v1/tasks'
const QWEN_SYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const UPLOAD_POLICY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/uploads'

// ── Model options ──────────────────────────────────────────

const QWEN_IMAGE_MODELS = [
  { label: 'qwen-image-2.0-pro (推荐)', value: 'qwen-image-2.0-pro' },
  { label: 'qwen-image-2.0', value: 'qwen-image-2.0' },
  { label: 'qwen-image-max', value: 'qwen-image-max' },
  { label: 'wan2.7-image-pro (万相2.7)', value: 'wan2.7-image-pro' },
  { label: 'wan2.7-image (万相2.7加速)', value: 'wan2.7-image' },
  { label: 'wan2.6-t2i (万相2.6)', value: 'wan2.6-t2i' },
]

const QWEN_EDIT_MODELS = [
  { label: 'qwen-image-2.0-pro (推荐)', value: 'qwen-image-2.0-pro' },
  { label: 'qwen-image-2.0', value: 'qwen-image-2.0' },
  { label: 'qwen-image-edit', value: 'qwen-image-edit' },
  { label: 'wan2.7-image-pro (万相2.7)', value: 'wan2.7-image-pro' },
  { label: 'wan2.7-image (万相2.7加速)', value: 'wan2.7-image' },
]

const WAN_T2I_MODELS = [
  { label: 'wan2.5-t2i-preview (推荐)', value: 'wan2.5-t2i-preview' },
  { label: 'wan2.2-t2i-flash (极速版)', value: 'wan2.2-t2i-flash' },
  { label: 'wan2.2-t2i-plus (专业版)', value: 'wan2.2-t2i-plus' },
  { label: 'wanx2.1-t2i-turbo', value: 'wanx2.1-t2i-turbo' },
  { label: 'wanx2.1-t2i-plus', value: 'wanx2.1-t2i-plus' },
]

const KLING_IMAGE_MODELS = [
  { label: 'kling-v3-image-generation', value: 'kling/kling-v3-image-generation' },
  { label: 'kling-v3-omni-image-generation', value: 'kling/kling-v3-omni-image-generation' },
]

const I2V_LEGACY_MODELS = [
  { label: 'wan2.6-i2v-flash (推荐)', value: 'wan2.6-i2v-flash' },
  { label: 'wan2.5-i2v-preview', value: 'wan2.5-i2v-preview' },
  { label: 'wan2.2-i2v-flash (极速版)', value: 'wan2.2-i2v-flash' },
  { label: 'wan2.2-i2v-plus (专业版)', value: 'wan2.2-i2v-plus' },
  { label: 'wanx2.1-i2v-turbo', value: 'wanx2.1-i2v-turbo' },
  { label: 'wanx2.1-i2v-plus', value: 'wanx2.1-i2v-plus' },
]

const KF2V_MODELS = [
  { label: 'wan2.2-kf2v-flash (推荐)', value: 'wan2.2-kf2v-flash' },
  { label: 'wanx2.1-kf2v-plus', value: 'wanx2.1-kf2v-plus' },
]

const ANIMATE_MOVE_MODELS = [
  { label: 'wan-std (标准模式)', value: 'wan-std' },
  { label: 'wan-pro (专业模式)', value: 'wan-pro' },
]

const RESOLUTION_IMAGE = [
  { label: '2048*2048 (默认)', value: '2048*2048' },
  { label: '1024*1024', value: '1024*1024' },
  { label: '1536*1536', value: '1536*1536' },
  { label: '2688*1536 (16:9)', value: '2688*1536' },
  { label: '1536*2688 (9:16)', value: '1536*2688' },
  { label: '2368*1728 (4:3)', value: '2368*1728' },
  { label: '1728*2368 (3:4)', value: '1728*2368' },
]

const RESOLUTION_WAN_T2I = [
  { label: '1280*1280 (默认)', value: '1280*1280' },
  { label: '1024*1024', value: '1024*1024' },
  { label: '1104*1472 (3:4)', value: '1104*1472' },
  { label: '1472*1104 (4:3)', value: '1472*1104' },
  { label: '960*1696 (9:16)', value: '960*1696' },
  { label: '1696*960 (16:9)', value: '1696*960' },
]

const RESOLUTION_VIDEO = [
  { label: '1080P (默认)', value: '1080P' },
  { label: '720P', value: '720P' },
  { label: '480P', value: '480P' },
]

const ASPECT_RATIO = [
  { label: '16:9 (默认)', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
]

// ── Common property definitions ─────────────────────────────

const CONFIG_PREFIX = '{{ __config__["workflow.aliyun-ai"]'

// ── ASR Helpers ──────────────────────────────────────────────

function parseArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return [value]
  }
}

function extractAsrTexts(transcription) {
  const texts = []
  const transcripts = transcription.transcripts || []
  for (const transcript of transcripts) {
    if (transcript.text) {
      texts.push(transcript.text)
    } else if (transcript.sentences) {
      const sentenceTexts = transcript.sentences.map(s => s.text).filter(Boolean)
      texts.push(...sentenceTexts)
    }
  }
  return texts
}

async function fetchAsrTranscriptionContent(ctx, pollResult, t) {
  const output = pollResult.output || {}
  const items = output.results || (output.result ? [output.result] : [])

  const texts = []
  const details = []

  for (const item of items) {
    if (item.subtask_status === 'FAILED') {
      details.push({
        fileUrl: item.file_url || '',
        status: 'FAILED',
        error: `${item.code || ''} - ${item.message || ''}`,
      })
      continue
    }

    const transcriptionUrl = item.transcription_url
    if (!transcriptionUrl) continue

    const transcription = await ctx.api.getJson(transcriptionUrl, { timeout: 30000 })
    const transcriptTexts = extractAsrTexts(transcription)
    texts.push(...transcriptTexts)
    details.push({
      fileUrl: transcription.file_url || item.file_url || '',
      status: 'SUCCEEDED',
      text: transcriptTexts.join('\n'),
      properties: transcription.properties || null,
      sentences: transcription.transcripts || null,
    })
  }

  const fullText = texts.join('\n')
  ctx.logger.info(`[ASR] 识别完成，共提取 ${texts.length} 段文本`)

  return {
    success: true,
    message: t('message.asrDone', 'Recognition completed, {fileCount} file(s), {textCount} text segment(s)').replace('{fileCount}', details.length).replace('{textCount}', texts.length),
    data: {
      text: fullText,
      details,
      taskId: output.task_id,
      usage: pollResult.usage || null,
    },
  }
}

// ── Async task helper (for workflow context with ctx.logger) ──

async function executeAsyncTaskCtx(ctx, apiKey, endpoint, body, extractResult, t) {
  const asyncHeaders = { ...getHeaders({ apiKey }), 'X-DashScope-Async': 'enable' }

  ctx.logger.info(`创建异步任务: ${endpoint}`)
  ctx.logger.info(`模型: ${body.model}`)
  const createResult = await ctx.api.postJson(endpoint, { headers: asyncHeaders, body, timeout: 600000 })

  if (createResult.code || createResult.message) {
    ctx.logger.error(`创建任务失败: ${createResult.code} - ${createResult.message}`)
    return { success: false, message: t('message.taskFailed', 'Failed to create task: {code} - {message}').replace('{code}', createResult.code || '').replace('{message}', createResult.message || '') }
  }

  const taskId = createResult.output?.task_id
  if (!taskId) {
    return { success: false, message: t('message.taskNoId', 'Task created but no task_id returned') }
  }
  ctx.logger.info(`任务已创建: ${taskId}, 状态: ${createResult.output.task_status}`)

  const pollHeaders = getHeaders({ apiKey })
  const TASK_QUERY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/tasks'
  const maxAttempts = 120
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000))

    const pollResult = await ctx.api.getJson(`${TASK_QUERY_ENDPOINT}/${taskId}`, { headers: pollHeaders, timeout: 30000 })
    const status = pollResult.output?.task_status
    ctx.logger.info(`轮询 #${i + 1}: 状态=${status}`)

    if (status === 'SUCCEEDED') {
      return extractResult(pollResult)
    }
    if (status === 'FAILED') {
      const code = pollResult.output?.code || ''
      const msg = pollResult.output?.message || '未知错误'
      ctx.logger.error(`任务失败: ${code} - ${msg}`)
      return { success: false, message: t('message.taskPollFailed', 'Task failed: {code} - {message}').replace('{code}', code).replace('{message}', msg) }
    }
    if (status === 'UNKNOWN' || status === 'CANCELED') {
      return { success: false, message: t('message.taskAbnormal', 'Task abnormal: {status}').replace('{status}', status) }
    }
  }
  return { success: false, message: t('message.pollTimeout', 'Polling timed out, please check manually later') }
}

// ── Actions ────────────────────────────────────────────────

module.exports = (t) => {
  // ── Common property helpers (need t) ───────────────────────
  const API_KEY_PROP = { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('config.apiKey.tooltip', 'Aliyun Bailian DashScope API Key'), default: `${CONFIG_PREFIX}["apiKey"]}}` }
  const PROMPT_PROP = (label, tip) => ({ key: 'prompt', label, type: 'textarea', required: true, tooltip: tip })
  const NEGATIVE_PROMPT_PROP = { key: 'negativePrompt', label: t('field.negativePrompt.label', 'Negative Prompt'), type: 'textarea', tooltip: t('field.negativePrompt.tooltip', 'Content to exclude from generation') }
  const SEED_PROP = { key: 'seed', label: t('field.seed.label', 'Random Seed'), type: 'number', tooltip: t('field.seed.tooltip', 'Fixed seed for reproducible results, 0~2147483647') }
  const WATERMARK_PROP = { key: 'watermark', label: t('field.watermark.label', 'Watermark'), type: 'select', default: 'false', options: [{ label: t('field.watermark.option_no', 'No watermark (default)'), value: 'false' }, { label: t('field.watermark.option_yes', 'Add watermark'), value: 'true' }] }

  const IMAGE_OUTPUTS = [
    { key: 'success', type: 'boolean' },
    { key: 'message', type: 'string' },
    { key: 'data', type: 'object', children: [
      { key: 'images', type: 'object', children: [] },
      { key: 'requestId', type: 'string' },
    ] },
  ]

  const VIDEO_OUTPUTS = [
    { key: 'success', type: 'boolean' },
    { key: 'message', type: 'string' },
    { key: 'data', type: 'object', children: [
      { key: 'videoUrl', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'requestId', type: 'string' },
    ] },
  ]

  return [
  // ─── 1. AI文生图 (SYNC) ────────────────────────────────
  {
    name: 'aliyun_text_to_image',
    label: t('action.textToImage.label', 'AI Text to Image'),
    category: t('category', 'Aliyun AI'),
    icon: 'Image',
    description: t('action.textToImage.description', 'Qwen/Wan text-to-image: generate images from text descriptions (synchronous)'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_image', 'Image Description'), t('field.prompt.tooltip_image', 'Describe the image you want to generate')),
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'qwen-image-2.0-pro', options: QWEN_IMAGE_MODELS },
      { key: 'size', label: t('field.size.label', 'Resolution'), type: 'select', default: '2048*2048', options: RESOLUTION_IMAGE },
      { key: 'n', label: t('field.n.label_image_count', 'Image Count'), type: 'number', default: 1, tooltip: t('field.n.tooltip_image_count', 'Number of images to generate (1-6)') },
      NEGATIVE_PROMPT_PROP,
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
        prompt: { type: 'string', description: '图片描述文字' },
        model: { type: 'string', description: '模型名，默认 qwen-image-2.0-pro' },
        size: { type: 'string', description: '分辨率，默认 2048*2048' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        n: { type: 'number', description: '生成图片数量，默认1' },
        promptExtend: { type: 'boolean', description: '是否智能改写，默认true' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'prompt'],
    },
    outputs: IMAGE_OUTPUTS,
    run: async (ctx, args) => {
      const headers = getHeaders(args)
      const body = {
        model: args.model || 'qwen-image-2.0-pro',
        input: { messages: [{ role: 'user', content: [{ text: args.prompt }] }] },
        parameters: {
          size: args.size || '2048*2048',
          ...(args.n && { n: args.n }),
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          ...(args.seed != null && { seed: args.seed }),
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
        },
      }
      ctx.logger.info(`[文生图] 模型: ${body.model}, 分辨率: ${body.parameters.size}`)
      const result = await ctx.api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
      if (result.code || result.message) {
        return { success: false, message: t('message.apiError', 'API error: {code} - {message}').replace('{code}', result.code || '').replace('{message}', result.message || '') }
      }
      const urls = extractImageUrls(result)
      return { success: true, message: t('message.imagesGenerated', 'Generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, requestId: result.request_id } }
    },
  },

  // ─── 2. AI图像编辑 (SYNC) ──────────────────────────────
  {
    name: 'aliyun_image_edit',
    label: t('action.imageEdit.label', 'AI Image Edit'),
    category: t('category', 'Aliyun AI'),
    icon: 'Wand2',
    description: t('action.imageEdit.description', 'Qwen/Wan image editing: style transfer, object add/remove, and local edits based on input images and text'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_edit', 'Edit Instruction'), t('field.prompt.tooltip_edit', 'Describe the edit direction, e.g. "change background to seaside"')),
      { key: 'images', label: t('field.images.label_url', 'Image URL'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.images.tooltip_url', 'Input image URL array, e.g. ["https://..."]') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'qwen-image-2.0-pro', options: QWEN_EDIT_MODELS },
      { key: 'size', label: t('field.size.label', 'Resolution'), type: 'select', default: '2048*2048', options: [
        { label: '2048*2048 (默认)', value: '2048*2048' },
        { label: '1024*1024', value: '1024*1024' },
      ] },
      { key: 'n', label: t('field.n.label_image_count', 'Image Count'), type: 'number', default: 1 },
      NEGATIVE_PROMPT_PROP,
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '编辑指令' },
        images: { type: 'array', items: { type: 'string' }, description: '输入图片URL数组(1-9张)' },
        model: { type: 'string', description: '模型名，默认 qwen-image-2.0-pro' },
        size: { type: 'string', description: '分辨率，默认 2048*2048' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        n: { type: 'number', description: '生成数量' },
        promptExtend: { type: 'boolean', description: '智能改写，默认true' },
      },
      required: ['apiKey', 'prompt'],
    },
    outputs: IMAGE_OUTPUTS,
    run: async (ctx, args) => {
      const images = Array.isArray(args.images) ? args.images : (() => { try { return JSON.parse(args.images) } catch { return [] } })()
      if (!images.length) return { success: false, message: t('message.needOneImage', 'At least 1 input image is required') }
      const headers = getHeaders(args)
      const content = images.map(img => ({ image: img }))
      content.push({ text: args.prompt })
      const body = {
        model: args.model || 'qwen-image-2.0-pro',
        input: { messages: [{ role: 'user', content }] },
        parameters: {
          size: args.size || '2048*2048',
          ...(args.n && { n: args.n }),
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
        },
      }
      ctx.logger.info(`[图像编辑] 模型: ${body.model}, 输入: ${images.length} 张`)
      const result = await ctx.api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
      if (result.code || result.message) {
        return { success: false, message: t('message.apiError', 'API error: {code} - {message}').replace('{code}', result.code || '').replace('{message}', result.message || '') }
      }
      const urls = extractImageUrls(result)
      return { success: true, message: t('message.imagesGenerated', 'Generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, requestId: result.request_id } }
    },
  },

  // ─── 3. 万相文生图-旧版 (ASYNC) ────────────────────────
  {
    name: 'aliyun_wan_text_to_image_legacy',
    label: t('action.wanTextToImageLegacy.label', 'Wan Text to Image (Legacy)'),
    category: t('category', 'Aliyun AI'),
    icon: 'ImagePlus',
    description: t('action.wanTextToImageLegacy.description', 'Wan 2.5 and earlier text-to-image (async, wan2.5/2.2/2.1 models)'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_image', 'Image Description'), t('field.prompt.tooltip_image', 'Describe the image you want to generate')),
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'wan2.5-t2i-preview', options: WAN_T2I_MODELS },
      { key: 'size', label: t('field.size.label', 'Resolution'), type: 'select', default: '1280*1280', options: RESOLUTION_WAN_T2I },
      { key: 'n', label: t('field.n.label_image_count', 'Image Count'), type: 'number', default: 1, tooltip: t('field.n.tooltip_wan', '1-4 images') },
      NEGATIVE_PROMPT_PROP,
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '图片描述' },
        model: { type: 'string', description: '模型，默认 wan2.5-t2i-preview' },
        size: { type: 'string', description: '分辨率，默认 1280*1280' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        n: { type: 'number', description: '图片数量(1-4)，默认1' },
        promptExtend: { type: 'boolean', description: '智能改写，默认true' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'prompt'],
    },
    outputs: IMAGE_OUTPUTS,
    run: async (ctx, args) => {
      const body = {
        model: args.model || 'wan2.5-t2i-preview',
        input: {
          prompt: args.prompt,
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
        },
        parameters: {
          size: args.size || '1280*1280',
          ...(args.n && { n: args.n }),
          ...(args.seed != null && { seed: args.seed }),
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.wanText2Image, body, (result) => {
        const urls = extractLegacyImageUrls(result)
        ctx.logger.info(`[万相文生图] 完成，${urls.length} 张图片`)
        return { success: true, message: t('message.imagesGenerated', 'Generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 4. 图像画面扩展/扩图 (ASYNC) ──────────────────────
  {
    name: 'aliyun_image_out_painting',
    label: t('action.imageOutPainting.label', 'AI Image Outpainting'),
    category: t('category', 'Aliyun AI'),
    icon: 'Expand',
    description: t('action.imageOutPainting.description', 'Image outpainting: expand by ratio, direction, or aspect ratio. Supports rotation.'),
    properties: [
      API_KEY_PROP,
      { key: 'imageUrl', label: t('field.imageUrl.label', 'Image URL'), type: 'text', required: true, tooltip: t('field.imageUrl.tooltip', 'Input image URL') },
      { key: 'expandMode', label: t('field.expandMode.label', 'Expand Mode'), type: 'select', default: 'ratio', options: [
        { label: t('field.expandMode.option_ratio', 'By Aspect Ratio'), value: 'ratio' },
        { label: t('field.expandMode.option_scale', 'By Scale'), value: 'scale' },
        { label: t('field.expandMode.option_offset', 'By Direction Pixels'), value: 'offset' },
      ] },
      { key: 'outputRatio', label: t('field.outputRatio.label', 'Aspect Ratio'), type: 'select', tooltip: t('field.outputRatio.tooltip', 'Only effective in "By Aspect Ratio" mode'), options: [
        { label: t('field.outputRatio.option_none', 'Not set'), value: '' },
        { label: '1:1', value: '1:1' },
        { label: '3:4', value: '3:4' },
        { label: '4:3', value: '4:3' },
        { label: '9:16', value: '9:16' },
        { label: '16:9', value: '16:9' },
      ] },
      { key: 'xScale', label: t('field.xScale.label', 'Horizontal Scale'), type: 'number', tooltip: t('field.xScale.tooltip', '1.0~3.0, default 1.0') },
      { key: 'yScale', label: t('field.yScale.label', 'Vertical Scale'), type: 'number', tooltip: t('field.yScale.tooltip', '1.0~3.0, default 1.0') },
      { key: 'leftOffset', label: t('field.leftOffset.label', 'Left Expand (px)'), type: 'number', tooltip: t('field.leftOffset.tooltip', 'Pixels to add') },
      { key: 'rightOffset', label: t('field.rightOffset.label', 'Right Expand (px)'), type: 'number', tooltip: t('field.rightOffset.tooltip', 'Pixels to add') },
      { key: 'topOffset', label: t('field.topOffset.label', 'Top Expand (px)'), type: 'number', tooltip: t('field.topOffset.tooltip', 'Pixels to add') },
      { key: 'bottomOffset', label: t('field.bottomOffset.label', 'Bottom Expand (px)'), type: 'number', tooltip: t('field.bottomOffset.tooltip', 'Pixels to add') },
      { key: 'angle', label: t('field.angle.label', 'Rotation Angle'), type: 'number', tooltip: t('field.angle.tooltip', 'Counter-clockwise 0~359 degrees') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        imageUrl: { type: 'string', description: '输入图片URL' },
        outputRatio: { type: 'string', description: '宽高比: 1:1/3:4/4:3/9:16/16:9' },
        xScale: { type: 'number', description: '水平扩展比例(1.0-3.0)' },
        yScale: { type: 'number', description: '垂直扩展比例(1.0-3.0)' },
        leftOffset: { type: 'number', description: '左侧扩展像素' },
        rightOffset: { type: 'number', description: '右侧扩展像素' },
        topOffset: { type: 'number', description: '上方扩展像素' },
        bottomOffset: { type: 'number', description: '下方扩展像素' },
        angle: { type: 'number', description: '逆时针旋转角度(0-359)' },
      },
      required: ['apiKey', 'imageUrl'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'imageUrl', type: 'string' },
        { key: 'requestId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      if (!args.imageUrl) throw new Error(t('message.missingImageUrl', 'Missing input image URL'))
      const body = {
        model: 'image-out-painting',
        input: { image_url: args.imageUrl },
        parameters: {
          ...(args.angle && { angle: args.angle }),
          ...(args.expandMode === 'ratio' && args.outputRatio && { output_ratio: args.outputRatio }),
          ...(args.expandMode === 'scale' && {
            ...(args.xScale && { x_scale: args.xScale }),
            ...(args.yScale && { y_scale: args.yScale }),
          }),
          ...(args.expandMode === 'offset' && {
            ...(args.leftOffset && { left_offset: args.leftOffset }),
            ...(args.rightOffset && { right_offset: args.rightOffset }),
            ...(args.topOffset && { top_offset: args.topOffset }),
            ...(args.bottomOffset && { bottom_offset: args.bottomOffset }),
          }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.outPainting, body, (result) => {
        const url = result.output?.output_image_url
        ctx.logger.info('[图像扩图] 完成')
        return { success: true, message: t('message.imageOutPaintingDone', 'Image outpainting completed'), data: { imageUrl: url, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 5. 可灵图像生成 (ASYNC) ───────────────────────────
  {
    name: 'aliyun_kling_image_generation',
    label: t('action.klingImageGeneration.label', 'Kling Image Generation'),
    category: t('category', 'Aliyun AI'),
    icon: 'Sparkles',
    description: t('action.klingImageGeneration.description', 'Kling AI text-to-image or reference-image-to-image, supports single and series modes'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_image', 'Image Description'), t('field.prompt.tooltip_image', 'Describe the image you want to generate')),
      { key: 'images', label: t('field.images.label_reference', 'Reference Image URL'), type: 'textarea', dataType: 'string[]', tooltip: t('field.images.tooltip_reference', 'Reference image URL array (optional), e.g. ["https://..."]') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'kling/kling-v3-image-generation', options: KLING_IMAGE_MODELS },
      { key: 'aspectRatio', label: t('field.aspectRatio.label', 'Aspect Ratio'), type: 'select', default: '1:1', options: ASPECT_RATIO },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '1k', options: [
        { label: '1K (默认)', value: '1k' },
        { label: '2K', value: '2k' },
        { label: '4K (仅omni)', value: '4k' },
      ] },
      { key: 'n', label: t('field.n.label_image_count', 'Image Count'), type: 'number', default: 1, tooltip: t('field.n.tooltip_kling', '1-9 images') },
      { key: 'resultType', label: t('field.resultType.label', 'Generation Type'), type: 'select', default: 'single', tooltip: t('field.resultType.tooltip', 'Only omni model supports series mode'), options: [
        { label: t('field.resultType.option_single', 'Single (default)'), value: 'single' },
        { label: t('field.resultType.option_series', 'Series'), value: 'series' },
      ] },
      { key: 'seriesAmount', label: t('field.seriesAmount.label', 'Series Count'), type: 'number', tooltip: t('field.seriesAmount.tooltip', '2-9 images, series mode only') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '图片描述' },
        images: { type: 'array', items: { type: 'string' }, description: '参考图URL数组(可选)' },
        model: { type: 'string', description: '模型，默认 kling/kling-v3-image-generation' },
        aspectRatio: { type: 'string', description: '宽高比: 16:9/9:16/1:1，默认1:1' },
        resolution: { type: 'string', description: '分辨率: 1k/2k/4k，默认1k' },
        n: { type: 'number', description: '图片数量(1-9)，默认1' },
        resultType: { type: 'string', description: 'single或series，默认single' },
        seriesAmount: { type: 'number', description: '组图张数(2-9)' },
      },
      required: ['apiKey', 'prompt'],
    },
    outputs: IMAGE_OUTPUTS,
    run: async (ctx, args) => {
      const content = [{ text: args.prompt }]
      if (args.images) {
        const imgs = Array.isArray(args.images) ? args.images : (() => { try { return JSON.parse(args.images) } catch { return [] } })()
        for (const img of imgs) content.push({ image: img })
      }
      const body = {
        model: args.model || 'kling/kling-v3-image-generation',
        input: { messages: [{ role: 'user', content }] },
        parameters: {
          n: args.n || 1,
          aspect_ratio: args.aspectRatio || '1:1',
          resolution: args.resolution || '1k',
          ...(args.resultType === 'series' && { result_type: 'series', series_amount: args.seriesAmount || 4 }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.klingImage, body, (result) => {
        const urls = extractImageUrls(result)
        ctx.logger.info(`[可灵生图] 完成，${urls.length} 张图片`)
        return { success: true, message: t('message.imagesGenerated', 'Generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 6. 万相图生视频-wan2.7 (ASYNC) ──────────────────
  {
    name: 'aliyun_image_to_video_v27',
    label: t('action.imageToVideoV27.label', 'Wan Image to Video (2.7)'),
    category: t('category', 'Aliyun AI'),
    icon: 'Video',
    description: t('action.imageToVideoV27.description', 'Wan 2.7 image-to-video: supports first-frame, first-last-frame, video continuation, and audio-driven'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_video', 'Video Description'), t('field.prompt.tooltip_video_optional', 'Describe the video content (optional)')),
      { key: 'media', label: t('field.media.label_v27', 'Media Assets'), type: 'textarea', dataType: 'object[]', required: true, tooltip: t('field.media.tooltip_v27', 'JSON array, e.g. [{"type":"first_frame","url":"https://..."}]. Supports: first_frame, last_frame, driving_audio, first_clip') },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: [
        { label: '720P', value: '720P' },
        { label: '1080P', value: '1080P' },
      ] },
      { key: 'duration', label: t('field.duration.label_seconds', 'Duration (seconds)'), type: 'number', default: 5, tooltip: t('field.duration.tooltip_v27', '2-15 seconds') },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '视频描述(可选)' },
        media: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', description: 'first_frame/last_frame/driving_audio/first_clip' }, url: { type: 'string' } } }, description: '媒体素材数组' },
        resolution: { type: 'string', description: '720P或1080P，默认720P' },
        duration: { type: 'number', description: '视频时长2-15秒，默认5' },
        promptExtend: { type: 'boolean', description: '智能改写，默认true' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        watermark: { type: 'boolean', description: '水印，默认false' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'media'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      const media = Array.isArray(args.media) ? args.media : JSON.parse(args.media)
      if (!media.length) throw new Error(t('message.needOneMedia', 'At least 1 media asset is required'))
      const body = {
        model: 'wan2.7-i2v',
        input: {
          ...(args.prompt && { prompt: args.prompt }),
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          media,
        },
        parameters: {
          resolution: args.resolution || '720P',
          duration: args.duration || 5,
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[图生视频2.7] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 7. 万相图生视频-旧版 (ASYNC) ────────────────────
  {
    name: 'aliyun_image_to_video_legacy',
    label: t('action.imageToVideoLegacy.label', 'Wan Image to Video (Legacy)'),
    category: t('category', 'Aliyun AI'),
    icon: 'Video',
    description: t('action.imageToVideoLegacy.description', 'Wan 2.6 and earlier image-to-video models, generate video from first-frame image (wan2.6/2.5/2.2/2.1)'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_video', 'Video Description'), t('field.prompt.tooltip_video', 'Describe the video content')),
      { key: 'imageUrl', label: t('field.imageUrl.label_first_frame', 'First Frame Image URL'), type: 'text', required: true, tooltip: t('field.imageUrl.tooltip_first_frame', 'First frame image URL or Base64') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'wan2.6-i2v-flash', options: I2V_LEGACY_MODELS },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: RESOLUTION_VIDEO },
      { key: 'duration', label: t('field.duration.label_seconds', 'Duration (seconds)'), type: 'number', default: 5, tooltip: t('field.duration.tooltip_legacy', 'Varies by model') },
      { key: 'audioUrl', label: t('field.audioUrl.label', 'Audio URL'), type: 'text', tooltip: t('field.audioUrl.tooltip', 'Background music/dubbing (wan2.6/2.5)') },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '视频描述' },
        imageUrl: { type: 'string', description: '首帧图片URL' },
        model: { type: 'string', description: '模型，默认 wan2.6-i2v-flash' },
        resolution: { type: 'string', description: '480P/720P/1080P' },
        duration: { type: 'number', description: '视频时长(秒)，默认5' },
        audioUrl: { type: 'string', description: '音频URL(仅wan2.6/2.5)' },
        promptExtend: { type: 'boolean', description: '智能改写，默认true' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'imageUrl'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      if (!args.imageUrl) throw new Error(t('message.missingImageUrl', 'Missing input image URL'))
      const body = {
        model: args.model || 'wan2.6-i2v-flash',
        input: {
          prompt: args.prompt || '',
          img_url: args.imageUrl,
          ...(args.audioUrl && { audio_url: args.audioUrl }),
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
        },
        parameters: {
          resolution: args.resolution || '720P',
          duration: args.duration || 5,
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[图生视频旧版] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 8. 万相首尾帧生视频 (ASYNC) ──────────────────────
  {
    name: 'aliyun_first_last_frame_video',
    label: t('action.firstLastFrameVideo.label', 'First-Last Frame to Video'),
    category: t('category', 'Aliyun AI'),
    icon: 'Film',
    description: t('action.firstLastFrameVideo.description', 'Wan first-last-frame to video: generate smooth transition video from first and last frame images'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_video_transition', 'Video Description'), t('field.prompt.tooltip_video_transition', 'Describe the transition effect')),
      { key: 'firstFrameUrl', label: t('field.firstFrameUrl.label', 'First Frame Image URL'), type: 'text', required: true, tooltip: t('field.firstFrameUrl.tooltip', 'First frame image URL') },
      { key: 'lastFrameUrl', label: t('field.lastFrameUrl.label', 'Last Frame Image URL'), type: 'text', required: true, tooltip: t('field.lastFrameUrl.tooltip', 'Last frame image URL') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'wan2.2-kf2v-flash', options: KF2V_MODELS },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: RESOLUTION_VIDEO },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '视频描述' },
        firstFrameUrl: { type: 'string', description: '首帧图片URL' },
        lastFrameUrl: { type: 'string', description: '尾帧图片URL' },
        model: { type: 'string', description: '模型，默认 wan2.2-kf2v-flash' },
        resolution: { type: 'string', description: '480P/720P/1080P' },
        promptExtend: { type: 'boolean', description: '智能改写' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'firstFrameUrl', 'lastFrameUrl'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      if (!args.firstFrameUrl) throw new Error(t('message.missingFirstFrameUrl', 'Missing first frame image URL'))
      if (!args.lastFrameUrl) throw new Error(t('message.missingLastFrameUrl', 'Missing last frame image URL'))
      const body = {
        model: args.model || 'wan2.2-kf2v-flash',
        input: {
          prompt: args.prompt || '',
          first_frame_url: args.firstFrameUrl,
          last_frame_url: args.lastFrameUrl,
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
        },
        parameters: {
          resolution: args.resolution || '720P',
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.image2video, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[首尾帧生视频] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 9. 万相参考生视频 (ASYNC) ────────────────────────
  {
    name: 'aliyun_reference_video',
    label: t('action.referenceVideo.label', 'Reference to Video'),
    category: t('category', 'Aliyun AI'),
    icon: 'UserRound',
    description: t('action.referenceVideo.description', 'Wan 2.7 reference-to-video: generate video with a person or object as the main character, supports multi-character interaction'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_reference_video', 'Video Description'), t('field.prompt.tooltip_reference_video', 'Use "image 1" "video 1" to refer to reference materials, describe the video content')),
      { key: 'media', label: t('field.media.label_reference', 'Reference Assets'), type: 'textarea', dataType: 'object[]', required: true, tooltip: t('field.media.tooltip_reference', 'JSON array, e.g. [{"type":"reference_image","url":"https://...","reference_voice":"https://...mp3"}]') },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: [
        { label: '720P', value: '720P' },
        { label: '1080P', value: '1080P' },
      ] },
      { key: 'ratio', label: t('field.ratio.label', 'Aspect Ratio'), type: 'select', default: '16:9', options: ASPECT_RATIO },
      { key: 'duration', label: t('field.duration.label_seconds', 'Duration (seconds)'), type: 'number', default: 5, tooltip: t('field.duration.tooltip_v27', '2-15 seconds') },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '用"图1""视频1"指代素材描述视频' },
        media: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', description: 'reference_image/reference_video/first_frame' }, url: { type: 'string' }, reference_voice: { type: 'string' } } }, description: '参考素材数组' },
        resolution: { type: 'string', description: '720P或1080P' },
        ratio: { type: 'string', description: '宽高比，默认16:9' },
        duration: { type: 'number', description: '视频时长2-15秒' },
        promptExtend: { type: 'boolean', description: '智能改写' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'prompt', 'media'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      const media = Array.isArray(args.media) ? args.media : JSON.parse(args.media)
      if (!media.length) throw new Error(t('message.needOneReference', 'At least 1 reference asset is required'))
      const body = {
        model: 'wan2.7-r2v',
        input: {
          prompt: args.prompt,
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          media,
        },
        parameters: {
          resolution: args.resolution || '720P',
          ratio: args.ratio || '16:9',
          duration: args.duration || 5,
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[参考生视频] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 10. 万相文生视频 (ASYNC) ─────────────────────────
  {
    name: 'aliyun_text_to_video',
    label: t('action.textToVideo.label', 'Wan Text to Video'),
    category: t('category', 'Aliyun AI'),
    icon: 'Clapperboard',
    description: t('action.textToVideo.description', 'Wan 2.7 text-to-video: generate video from text, supports multi-shot narrative and automatic dubbing'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_video_gen', 'Video Description'), t('field.prompt.tooltip_video_gen', 'Describe the video scene, shots, characters, etc. in detail')),
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: [
        { label: '720P', value: '720P' },
        { label: '1080P', value: '1080P' },
      ] },
      { key: 'ratio', label: t('field.ratio.label', 'Aspect Ratio'), type: 'select', default: '16:9', options: ASPECT_RATIO },
      { key: 'duration', label: t('field.duration.label_seconds', 'Duration (seconds)'), type: 'number', default: 5, tooltip: t('field.duration.tooltip_v27', '2-15 seconds') },
      { key: 'audioUrl', label: t('field.audioUrl.label', 'Audio URL'), type: 'text', tooltip: t('field.audioUrl.tooltip_optional', 'Background music/dubbing audio URL (optional)') },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '视频场景描述' },
        resolution: { type: 'string', description: '720P或1080P' },
        ratio: { type: 'string', description: '宽高比，默认16:9' },
        duration: { type: 'number', description: '视频时长2-15秒，默认5' },
        audioUrl: { type: 'string', description: '音频URL(可选)' },
        promptExtend: { type: 'boolean', description: '智能改写' },
        negativePrompt: { type: 'string', description: '反向提示词' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'prompt'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      const body = {
        model: 'wan2.7-t2v',
        input: {
          prompt: args.prompt,
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          ...(args.audioUrl && { audio_url: args.audioUrl }),
        },
        parameters: {
          resolution: args.resolution || '720P',
          ratio: args.ratio || '16:9',
          duration: args.duration || 5,
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[文生视频] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 11. 万相视频编辑 (ASYNC) ─────────────────────────
  {
    name: 'aliyun_video_editing',
    label: t('action.videoEditing.label', 'Wan Video Editing'),
    category: t('category', 'Aliyun AI'),
    icon: 'PenTool',
    description: t('action.videoEditing.description', 'Wan 2.7 video editing: supports instruction-based editing (style change) and reference-image editing (local replacement)'),
    properties: [
      API_KEY_PROP,
      PROMPT_PROP(t('field.prompt.label_edit_video', 'Edit Instruction'), t('field.prompt.tooltip_edit_video', 'E.g. "convert to clay style" or "replace clothes with the reference image"')),
      { key: 'videoUrl', label: t('field.videoUrl.label', 'Video URL'), type: 'text', required: true, tooltip: t('field.videoUrl.tooltip', 'Video URL to edit (mp4/mov, 2-10 seconds)') },
      { key: 'referenceImages', label: t('field.referenceImages.label', 'Reference Image URL'), type: 'textarea', dataType: 'string[]', tooltip: t('field.referenceImages.tooltip', 'Reference image URL array (optional), e.g. ["https://..."], max 4') },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '720P', options: [
        { label: '720P', value: '720P' },
        { label: '1080P', value: '1080P' },
      ] },
      { key: 'duration', label: t('field.duration.label_output', 'Output Duration (seconds)'), type: 'number', tooltip: t('field.duration.tooltip_output', '0=use original duration, 2-10 seconds to truncate') },
      { key: 'audioSetting', label: t('field.audioSetting.label', 'Audio Setting'), type: 'select', default: 'auto', options: [
        { label: t('field.audioSetting.option_auto', 'Auto (default)'), value: 'auto' },
        { label: t('field.audioSetting.option_origin', 'Keep Original'), value: 'origin' },
      ] },
      { key: 'promptExtend', label: t('field.promptExtend.label', 'Smart Rewrite'), type: 'select', default: 'true', options: [{ label: t('field.promptExtend.option_on', 'Enabled (default)'), value: 'true' }, { label: t('field.promptExtend.option_off', 'Disabled'), value: 'false' }] },
      NEGATIVE_PROMPT_PROP,
      WATERMARK_PROP,
      SEED_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        prompt: { type: 'string', description: '编辑指令' },
        videoUrl: { type: 'string', description: '待编辑视频URL(mp4/mov, 2-10秒)' },
        referenceImages: { type: 'array', items: { type: 'string' }, description: '参考图URL数组(最多4张)' },
        resolution: { type: 'string', description: '720P或1080P' },
        duration: { type: 'number', description: '输出时长(0=原时长，2-10秒)' },
        audioSetting: { type: 'string', description: '声音: auto/origin' },
        promptExtend: { type: 'boolean', description: '智能改写' },
        seed: { type: 'number', description: '随机种子' },
      },
      required: ['apiKey', 'prompt', 'videoUrl'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      if (!args.videoUrl) throw new Error(t('message.missingVideoUrl', 'Missing video URL'))
      const media = [{ type: 'video', url: args.videoUrl }]
      if (args.referenceImages) {
        const imgs = Array.isArray(args.referenceImages) ? args.referenceImages : (() => { try { return JSON.parse(args.referenceImages) } catch { return [] } })()
        for (const img of imgs) media.push({ type: 'reference_image', url: img })
      }
      const body = {
        model: 'wan2.7-videoedit',
        input: {
          prompt: args.prompt,
          ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
          media,
        },
        parameters: {
          resolution: args.resolution || '720P',
          prompt_extend: args.promptExtend !== 'false' && args.promptExtend !== false,
          ...(args.duration && { duration: args.duration }),
          ...(args.audioSetting && { audio_setting: args.audioSetting }),
          watermark: args.watermark === 'true' || args.watermark === true,
          ...(args.seed != null && { seed: args.seed }),
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[视频编辑] 完成')
        return { success: true, message: t('message.videoEditDone', 'Video editing completed'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 12. 万相图生动作 (ASYNC) ──────────────────────────
  {
    name: 'aliyun_animate_move',
    label: t('action.animateMove.label', 'Wan Animate Move'),
    category: t('category', 'Aliyun AI'),
    icon: 'PersonStanding',
    description: t('action.animateMove.description', 'Wan animate move: transfer actions and expressions from a reference video to a person image'),
    properties: [
      API_KEY_PROP,
      { key: 'imageUrl', label: t('field.imageUrl.label', 'Image URL'), type: 'text', required: true, tooltip: t('field.imageUrl.tooltip_person', 'Person image URL (front-facing, single person, clear)') },
      { key: 'videoUrl', label: t('field.videoUrl.label', 'Video URL'), type: 'text', required: true, tooltip: t('field.videoUrl.tooltip_reference', 'Reference action video URL (2-30 seconds)') },
      { key: 'mode', label: t('field.model.label', 'Model'), type: 'select', default: 'wan-std', options: ANIMATE_MOVE_MODELS },
      WATERMARK_PROP,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        imageUrl: { type: 'string', description: '人物图片URL(正面单人清晰)' },
        videoUrl: { type: 'string', description: '参考动作视频URL(2-30秒)' },
        mode: { type: 'string', description: 'wan-std(标准)或wan-pro(专业)，默认wan-std' },
      },
      required: ['apiKey', 'imageUrl', 'videoUrl'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      if (!args.imageUrl) throw new Error(t('message.missingPersonImageUrl', 'Missing person image URL'))
      if (!args.videoUrl) throw new Error(t('message.missingReferenceVideoUrl', 'Missing reference video URL'))
      const body = {
        model: 'wan2.2-animate-move',
        input: {
          image_url: args.imageUrl,
          video_url: args.videoUrl,
          watermark: args.watermark === 'true' || args.watermark === true,
        },
        parameters: { mode: args.mode || 'wan-std' },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.image2video, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[图生动作] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 13. 声动人像VideoRetalk (ASYNC) ───────────────────
  {
    name: 'aliyun_videoretalk',
    label: t('action.videoretalk.label', 'VideoRetalk'),
    category: t('category', 'Aliyun AI'),
    icon: 'Mic',
    description: t('action.videoretalk.description', 'VideoRetalk: generate lip-synced video from a person video and voice audio'),
    properties: [
      API_KEY_PROP,
      { key: 'videoUrl', label: t('field.videoUrl.label', 'Video URL'), type: 'text', required: true, tooltip: t('field.videoUrl.tooltip_person', 'Person video URL (front-facing)') },
      { key: 'audioUrl', label: t('field.audioUrl.label', 'Audio URL'), type: 'text', required: true, tooltip: t('field.audioUrl.tooltip_voice', 'Clear voice audio file URL (wav/mp3)') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: 'API Key' },
        videoUrl: { type: 'string', description: '人物视频URL(正面镜头)' },
        audioUrl: { type: 'string', description: '人声音频URL(wav/mp3)' },
      },
      required: ['apiKey', 'videoUrl', 'audioUrl'],
    },
    outputs: VIDEO_OUTPUTS,
    run: async (ctx, args) => {
      if (!args.videoUrl) throw new Error(t('message.missingPersonVideoUrl', 'Missing person video URL'))
      if (!args.audioUrl) throw new Error(t('message.missingAudioUrl', 'Missing voice audio URL'))
      const body = {
        model: 'videoretalk',
        input: {
          video_url: args.videoUrl,
          audio_url: args.audioUrl,
        },
      }
      return executeAsyncTaskCtx(ctx, args.apiKey, ASYNC_ENDPOINTS.image2video, body, (result) => {
        const videoUrl = result.output?.video_url
        ctx.logger.info('[声动人像] 完成')
        return { success: true, message: t('message.videoGenerated', 'Video generated successfully'), data: { videoUrl, requestId: result.request_id } }
      }, t)
    },
  },

  // ─── 14. 上传文件到百炼临时存储 ──────────────────────
  {
    name: 'aliyun_upload_file',
    label: t('action.uploadFile.label', 'Upload File (Bailian)'),
    category: t('category', 'Aliyun AI'),
    icon: 'Upload',
    description: t('action.uploadFile.description', 'Upload local file to Aliyun Bailian temporary storage and get an oss:// URL (valid for 48 hours)'),
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
        filePath: { type: 'string', description: '本地文件路径' },
        model: { type: 'string', description: '目标模型名（文件与模型绑定，须与后续调用一致），如 qwen-vl-plus、wan2.7-i2v 等' },
      },
      required: ['apiKey', 'filePath', 'model'],
    },
    properties: [
      API_KEY_PROP,
      { key: 'filePath', label: t('field.filePath.label', 'Local File Path'), type: 'text', required: true, tooltip: t('field.filePath.tooltip', 'Full local file path') },
      { key: 'model', label: t('field.model.label_target', 'Target Model'), type: 'text', required: true, tooltip: t('field.model.tooltip_target', 'Target model name, e.g. qwen-vl-plus, wan2.7-i2v') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'url', type: 'string' },
        { key: 'fileName', type: 'string' },
        { key: 'key', type: 'string' },
        { key: 'model', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const { apiKey, filePath, model } = args
      if (!apiKey || !filePath || !model) {
        return { success: false, message: t('message.missingParams', 'Missing required parameters: apiKey, filePath, model') }
      }

      // 1. 获取上传凭证
      const policyHeaders = getHeaders(args)
      const policyUrl = `${UPLOAD_POLICY_ENDPOINT}?action=getPolicy&model=${encodeURIComponent(model)}`
      const policyResult = await ctx.api.getJson(policyUrl, { headers: policyHeaders, timeout: 30000 })

      if (!policyResult.data) {
        return { success: false, message: t('message.uploadPolicyFailed', 'Failed to get upload policy: {detail}').replace('{detail}', policyResult.message || JSON.stringify(policyResult)) }
      }

      const policy = policyResult.data
      const fileName = filePath.split(/[/\\]/).pop()
      const key = `${policy.upload_dir}/${fileName}`

      // 2. 上传文件到 OSS
      const uploaded = await ctx.api.uploadFile(policy.upload_host, {
        fields: {
          OSSAccessKeyId: policy.oss_access_key_id,
          Signature: policy.signature,
          policy: policy.policy,
          'x-oss-object-acl': policy.x_oss_object_acl,
          'x-oss-forbid-overwrite': policy.x_oss_forbid_overwrite,
          key,
          success_action_status: '200',
        },
        filePath,
      })

      if (!uploaded) {
        return { success: false, message: t('message.uploadFailed', 'File upload failed') }
      }

      // 3. 拼接临时 URL
      const ossUrl = `oss://${key}`
      const maxSizeInfo = policy.max_file_size_mb ? `，文件大小限制 ${policy.max_file_size_mb}MB` : ''

      return {
        success: true,
        message: t('message.uploadSuccess', 'File uploaded successfully, temporary URL valid for 48 hours{sizeInfo}').replace('{sizeInfo}', maxSizeInfo),
        data: {
          url: ossUrl,
          fileName,
          key,
          model,
          expireInSeconds: policy.expire_in_seconds,
        },
      }
    },
  },

  // ─── 15. 录音文件异步转写 (ASYNC) ──────────────────────
  {
    name: 'asr_file_recognition',
    label: t('action.asrFileRecognition.label', 'Audio File Transcription'),
    category: t('category_asr', 'Speech Recognition'),
    icon: 'FileAudio',
    description: t('action.asrFileRecognition.description', 'Submit audio/video file URL for async speech recognition, supports FunASR/Paraformer/Qwen models, auto-polls for results'),
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('config.apiKey.asr.tooltip', 'Aliyun Bailian DashScope API Key'), default: `${CONFIG_PREFIX}["apiKey"]}}` },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.aliyun-ai"]["baseUrl"] || "https://dashscope.aliyuncs.com" }}', tooltip: t('config.baseUrl.tooltip', 'DashScope API base URL') },
      { key: 'model', label: t('field.model.label_asr', 'Recognition Model'), type: 'select', default: 'paraformer-v2', options: [
        { label: 'paraformer-v2 (推荐多语种)', value: 'paraformer-v2' },
        { label: 'paraformer-8k-v2 (8kHz电话)', value: 'paraformer-8k-v2' },
        { label: 'paraformer-v1 (中英文)', value: 'paraformer-v1' },
        { label: 'paraformer-8k-v1 (8kHz)', value: 'paraformer-8k-v1' },
        { label: 'paraformer-mtl-v1 (多语种)', value: 'paraformer-mtl-v1' },
        { label: 'fun-asr (中英文)', value: 'fun-asr' },
        { label: 'qwen3-asr-flash-filetrans (千问长音频)', value: 'qwen3-asr-flash-filetrans' },
      ], tooltip: t('field.model.tooltip_asr', 'Supported languages and sample rates vary by model') },
      { key: 'fileUrls', label: t('field.fileUrls.label', 'Audio File URL'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.fileUrls.tooltip', 'FunASR/Paraformer: URL array, e.g. ["https://...mp3"], max 100') },
      { key: 'fileUrl', label: t('field.fileUrl.label_qwen', 'Audio File URL (Qwen)'), type: 'text', tooltip: t('field.fileUrl.tooltip_qwen', 'Qwen-Filetrans only: single audio file URL') },
      { key: 'languageHints', label: t('field.languageHints.label', 'Language Hints'), type: 'text', tooltip: t('field.languageHints.tooltip', 'Paraformer-v2 language code array, e.g. ["zh","en"]') },
      { key: 'language', label: t('field.language.label_qwen', 'Language (Qwen)'), type: 'select', default: '', options: [
        { label: t('field.language.option_auto', 'Auto Detect'), value: '' },
        { label: 'zh 中文', value: 'zh' },
        { label: 'en 英文', value: 'en' },
        { label: 'ja 日语', value: 'ja' },
        { label: 'ko 韩语', value: 'ko' },
        { label: 'yue 粤语', value: 'yue' },
        { label: 'de 德语', value: 'de' },
        { label: 'fr 法语', value: 'fr' },
        { label: 'ru 俄语', value: 'ru' },
      ], tooltip: t('field.language.tooltip_qwen', 'Qwen-Filetrans specified language') },
      { key: 'diarizationEnabled', label: t('field.diarizationEnabled.label', 'Speaker Diarization'), type: 'boolean', default: false, tooltip: t('field.diarizationEnabled.tooltip', 'When enabled, different speakers will be distinguished in results') },
      { key: 'speakerCount', label: t('field.speakerCount.label', 'Speaker Count'), type: 'number', tooltip: t('field.speakerCount.tooltip', 'Estimated speaker count (2-100), requires speaker diarization enabled first') },
      { key: 'channelId', label: t('field.channelId.label', 'Channel Index'), type: 'text', tooltip: t('field.channelId.tooltip', 'Specify channel, e.g. [0] or [0,1]') },
      { key: 'enableItn', label: t('field.enableItn.label', 'Inverse Text Normalization'), type: 'boolean', default: false, tooltip: t('field.enableItn.tooltip_qwen', 'Qwen-Filetrans: enable ITN') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
        baseUrl: { type: 'string', description: 'DashScope API 地址，默认 https://dashscope.aliyuncs.com' },
        model: { type: 'string', description: '识别模型。paraformer-v2(推荐多语种)/fun-asr(中英文)/qwen3-asr-flash-filetrans(千问长音频) 等' },
        fileUrls: { type: 'array', items: { type: 'string' }, description: 'FunASR/Paraformer: 音频文件URL列表（最多100个）' },
        fileUrl: { type: 'string', description: 'Qwen-Filetrans: 单个音频文件URL' },
        languageHints: { type: 'array', items: { type: 'string' }, description: 'Paraformer-v2 语言提示，如 ["zh","en"]' },
        language: { type: 'string', description: 'Qwen-Filetrans 指定语言代码（zh/en/ja/ko 等）' },
        diarizationEnabled: { type: 'boolean', description: '是否开启说话人分离（默认关闭）' },
        speakerCount: { type: 'integer', description: '说话人数量参考值（2-100）' },
      },
      required: ['apiKey'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'text', type: 'string' },
        { key: 'details', type: 'object', children: [] },
        { key: 'taskId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = (args.baseUrl || 'https://dashscope.aliyuncs.com').replace(/\/$/, '')
      const apiKey = args.apiKey
      const model = args.model || 'paraformer-v2'
      const isQwenFiletrans = model.startsWith('qwen')

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-Async': 'enable',
      }

      const body = { model }

      if (isQwenFiletrans) {
        const fileUrl = args.fileUrl
        if (!fileUrl) throw new Error(t('message.asrQwenNeedFileUrl', 'Qwen-Filetrans model requires fileUrl (single audio file URL)'))
        body.input = { file_url: fileUrl }
        body.parameters = {}
        if (args.channelId) body.parameters.channel_id = parseArray(args.channelId)
        if (args.language) body.parameters.language = args.language
        if (args.enableItn !== undefined) body.parameters.enable_itn = args.enableItn
      } else {
        const fileUrls = parseArray(args.fileUrls)
        if (fileUrls.length === 0) throw new Error(t('message.asrNeedFileUrls', 'fileUrls is required (audio file URL array)'))
        body.input = { file_urls: fileUrls }
        body.parameters = {}
        if (args.channelId) body.parameters.channel_id = parseArray(args.channelId)
        if (args.vocabularyId) body.parameters.vocabulary_id = args.vocabularyId
        if (args.specialWordFilter) body.parameters.special_word_filter = args.specialWordFilter
        if (args.diarizationEnabled !== undefined) body.parameters.diarization_enabled = args.diarizationEnabled
        if (args.speakerCount) body.parameters.speaker_count = args.speakerCount
        if (args.languageHints) body.parameters.language_hints = parseArray(args.languageHints)
        if (args.disfluencyRemovalEnabled !== undefined) body.parameters.disfluency_removal_enabled = args.disfluencyRemovalEnabled
        if (args.timestampAlignmentEnabled !== undefined) body.parameters.timestamp_alignment_enabled = args.timestampAlignmentEnabled
      }

      ctx.logger.info(`[ASR] 提交语音识别任务: 模型=${model}`)

      const submitEndpoint = `${baseUrl}/api/v1/services/audio/asr/transcription`
      const createResult = await ctx.api.postJson(submitEndpoint, { headers, body, timeout: 600000 })

      if (createResult.code || createResult.message) {
        throw new Error(t('message.asrCreateFailed', 'Failed to create task: {code} - {message}').replace('{code}', createResult.code || '').replace('{message}', createResult.message || ''))
      }

      const taskId = createResult.output?.task_id
      if (!taskId) throw new Error(t('message.asrNoTaskId', 'Task created but no task_id returned'))

      ctx.logger.info(`[ASR] 任务已提交: task_id=${taskId}，开始轮询...`)

      const pollHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }
      const taskQueryBase = `${baseUrl}/api/v1/tasks`
      const maxAttempts = 120
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        const pollResult = await ctx.api.getJson(`${taskQueryBase}/${taskId}`, { headers: pollHeaders, timeout: 30000 })
        const status = pollResult.output?.task_status
        ctx.logger.info(`[ASR] 任务 ${taskId} 状态: ${status}`)

        if (status === 'SUCCEEDED') {
          return fetchAsrTranscriptionContent(ctx, pollResult, t)
        }
        if (status === 'FAILED') {
          throw new Error(t('message.asrTaskFailed', 'Task failed: {code} - {message}').replace('{code}', pollResult.output?.code || '').replace('{message}', pollResult.output?.message || ''))
        }
        if (status === 'UNKNOWN' || status === 'CANCELED') {
          throw new Error(t('message.asrTaskAbnormal', 'Task abnormal: {status}').replace('{status}', status))
        }
      }
      throw new Error(t('message.asrPollTimeout', 'Polling timed out (waited 10 minutes)'))
    },
  },

  // ─── 16. 千问实时语音识别 (SYNC) ──────────────────────
  {
    name: 'asr_qwen_flash',
    label: t('action.asrQwenFlash.label', 'Qwen Real-time ASR'),
    category: t('category_asr', 'Speech Recognition'),
    icon: 'AudioLines',
    description: t('action.asrQwenFlash.description', 'Qwen-ASR real-time speech recognition (synchronous), for short audio transcription with language detection and emotion analysis'),
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('config.apiKey.asr.tooltip', 'Aliyun Bailian DashScope API Key'), default: `${CONFIG_PREFIX}["apiKey"]}}` },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.aliyun-ai"]["baseUrl"] || "https://dashscope.aliyuncs.com" }}', tooltip: t('config.baseUrl.tooltip', 'DashScope API base URL') },
      { key: 'audio', label: t('field.audio.label', 'Audio Content'), type: 'textarea', required: true, tooltip: t('field.audio.tooltip', 'Public audio URL or Base64 Data URI (data:audio/wav;base64,...)') },
      { key: 'language', label: t('field.language.label_asr_flash', 'Language'), type: 'select', default: '', options: [
        { label: t('field.language.option_auto', 'Auto Detect'), value: '' },
        { label: 'zh 中文', value: 'zh' },
        { label: 'en 英文', value: 'en' },
        { label: 'ja 日语', value: 'ja' },
        { label: 'ko 韩语', value: 'ko' },
        { label: 'de 德语', value: 'de' },
        { label: 'fr 法语', value: 'fr' },
        { label: 'ru 俄语', value: 'ru' },
      ], tooltip: t('field.language.tooltip_asr_flash', 'Specifying language improves accuracy. Auto-detected if not specified.') },
      { key: 'enableItn', label: t('field.enableItn.label', 'Inverse Text Normalization'), type: 'boolean', default: false, tooltip: t('field.enableItn.tooltip', 'Only supports Chinese and English') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
        baseUrl: { type: 'string', description: 'DashScope API 地址，默认 https://dashscope.aliyuncs.com' },
        audio: { type: 'string', description: '音频内容：公网可访问URL 或 Base64 Data URI（data:audio/wav;base64,...）' },
        language: { type: 'string', description: '指定语种（zh/en/ja/ko/de/fr/ru 等），不指定则自动检测' },
        enableItn: { type: 'boolean', description: '是否启用逆文本标准化（ITN），默认 false' },
      },
      required: ['apiKey', 'audio'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'text', type: 'string' },
        { key: 'language', type: 'string' },
        { key: 'emotion', type: 'string' },
        { key: 'duration', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = (args.baseUrl || 'https://dashscope.aliyuncs.com').replace(/\/$/, '')
      const apiKey = args.apiKey
      if (!args.audio) throw new Error(t('message.asrNeedAudio', 'audio is required (audio URL or Base64 encoding)'))

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      }

      const body = {
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: args.audio },
              },
            ],
          },
        ],
        stream: false,
        asr_options: {
          ...(args.language && { language: args.language }),
          ...(args.enableItn !== undefined && { enable_itn: args.enableItn }),
        },
      }

      ctx.logger.info(`[ASR] 千问实时语音识别: 音频=${args.audio.substring(0, 100)}...`)

      const syncEndpoint = `${baseUrl}/compatible-mode/v1/chat/completions`
      const result = await ctx.api.postJson(syncEndpoint, { headers, body, timeout: 120000 })

      if (result.error) {
        throw new Error(t('message.asrFlashFailed', 'Recognition failed: {error}').replace('{error}', result.error.message || JSON.stringify(result.error)))
      }

      const text = result.choices?.[0]?.message?.content || ''
      const annotations = result.choices?.[0]?.message?.annotations || []
      const audioInfo = annotations.find(a => a.type === 'audio_info') || {}
      const usage = result.usage || {}

      ctx.logger.info(`[ASR] 识别完成: 语种=${audioInfo.language || '未知'}, 情感=${audioInfo.emotion || '未知'}, 时长=${usage.seconds || 0}s`)

      return {
        success: true,
        message: text ? t('message.asrFlashDone', 'Recognition completed') : t('message.asrFlashDoneNoContent', 'Recognition completed but no content'),
        data: {
          text,
          language: audioInfo.language || '',
          emotion: audioInfo.emotion || '',
          duration: usage.seconds || 0,
          usage,
        },
      }
    },
  },
  ]
}
