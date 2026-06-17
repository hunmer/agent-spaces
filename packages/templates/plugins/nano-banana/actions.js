const path = require('path')
const fs = require('fs')
const { Buffer } = require('buffer')

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'
const DEFAULT_MODEL = 'gemini-3.1-flash-image'
const MAX_REFERENCE_IMAGES = 14

const CONFIG_APIKEY = '{{ __config__["workflow.nano-banana"]["apiKey"] }}'
const CONFIG_BASEURL = '{{ __config__["workflow.nano-banana"]["baseUrl"] }}'

function getBaseUrl(args) {
  return args.baseUrl || DEFAULT_BASE_URL
}

function mimeFromExt(file) {
  const ext = path.extname(file).toLowerCase()
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
  })[ext] || 'image/jpeg'
}

// mimeType → 落盘扩展名（jpeg 统一成 jpg）
function extFromMime(mimeType) {
  const sub = ((mimeType || 'image/png').split('/')[1] || 'png').split('+')[0]
  return sub === 'jpeg' ? 'jpg' : sub
}

// URL / 本地路径 / data URI → Gemini inline_data { mime_type, data(base64) }
async function toInlineData(input) {
  if (typeof input !== 'string' || !input) {
    throw new Error('image input must be a non-empty string')
  }

  // data URI: data:image/png;base64,xxxx
  const dataMatch = /^data:([^;,]+)?;base64,(.*)$/is.exec(input)
  if (dataMatch) {
    return { mime_type: dataMatch[1] || 'image/png', data: dataMatch[2] }
  }

  let buffer
  let mimeType

  if (/^https?:\/\//i.test(input)) {
    const resp = await globalThis.fetch(input)
    if (!resp.ok) throw new Error(`Failed to download image: ${resp.status}`)
    buffer = Buffer.from(await resp.arrayBuffer())
    mimeType = (resp.headers.get('content-type') || '').split(';')[0].trim() || mimeFromExt(input)
  } else {
    buffer = fs.readFileSync(input)
    mimeType = mimeFromExt(input)
  }

  return { mime_type: mimeType, data: buffer.toString('base64') }
}

// 接受 string / string[] / JSON 字符串，统一成 inline_data 数组
async function normalizeImages(input, { max = MAX_REFERENCE_IMAGES } = {}) {
  let arr = input
  if (typeof arr === 'string') {
    const trimmed = arr.trim()
    if (trimmed.startsWith('[')) {
      try { arr = JSON.parse(trimmed) } catch { arr = [arr] }
    } else {
      arr = [arr]
    }
  }
  if (!Array.isArray(arr)) arr = [arr]
  const list = arr.filter((x) => x != null && x !== '')
  if (max && list.length > max) {
    throw new Error(`Too many images: ${list.length} (max ${max})`)
  }
  return Promise.all(list.map(toInlineData))
}

// 拼装 tools：Google Search grounding（imageSearch 仅 3.1 Flash）
function buildTools(args, model) {
  const wantWeb = !!args.googleSearch
  const wantImage = !!args.imageSearch
  if (!wantWeb && !wantImage) return undefined

  const isFlash31 = model === 'gemini-3.1-flash-image'
  const searchTypes = {}
  if (wantWeb) searchTypes.webSearch = {}
  if (wantImage && isFlash31) searchTypes.imageSearch = {}

  return [{ google_search: Object.keys(searchTypes).length ? { searchTypes } : {} }]
}

// 拼装 generationConfig：modalities / 尺寸比例 / thinking
function buildGenerationConfig(args, model) {
  const config = {}

  config.responseModalities = args.responseModalities === 'image' ? ['IMAGE'] : ['TEXT', 'IMAGE']

  const image = {}
  if (args.aspectRatio && args.aspectRatio !== 'auto') image.aspectRatio = args.aspectRatio
  if (args.imageSize && args.imageSize !== 'default' && args.imageSize !== 'auto') image.imageSize = args.imageSize
  if (Object.keys(image).length) config.responseFormat = { image }

  // thinkingConfig 仅 flash-image 系列支持
  if (/flash-image/.test(model)) {
    const thinking = {}
    if (args.thinkingLevel && args.thinkingLevel !== 'auto') thinking.thinkingLevel = args.thinkingLevel
    if (args.includeThoughts) thinking.includeThoughts = true
    if (Object.keys(thinking).length) config.thinkingConfig = thinking
  }

  return config
}

// 统一调用 generateContent
async function callGenerateContent(ctx, args, contents) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 apiKey')
  const baseUrl = getBaseUrl(args)
  const model = args.model || DEFAULT_MODEL

  const body = { contents }
  const tools = buildTools(args, model)
  if (tools) body.tools = tools
  body.generationConfig = buildGenerationConfig(args, model)

  const url = `${baseUrl}/v1/models/${encodeURIComponent(model)}:generateContent`
  ctx.logger.info(`请求: ${model}, 内容轮数: ${contents.length}`)
  const response = await ctx.api.postJson(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body,
    timeout: 600000,
  })
  return { model, response }
}

// 解析 generateContent 响应：图片落盘 → httpPath，收集文本 / 思考 / grounding
async function parseResponse(response, ctx) {
  const candidate = response?.candidates?.[0]
  const parts = candidate?.content?.parts || []
  const images = []
  const thoughts = []
  let text = ''

  for (const part of parts) {
    // thought=true 的 part 属于思考过程，不计入正式输出
    if (part.thought === true) {
      if (part.text) thoughts.push(part.text)
      continue
    }
    // 兼容 snake_case / camelCase
    const inline = part.inline_data || part.inlineData
    if (inline && inline.data) {
      const mimeType = inline.mime_type || inline.mimeType || 'image/png'
      const buffer = Buffer.from(inline.data, 'base64')
      const saved = ctx.api.savePublicFile(buffer, extFromMime(mimeType))
      if (saved?.httpPath) images.push(saved.httpPath)
      continue
    }
    if (part.text) text += part.text
  }

  return {
    images,
    text: text.trim(),
    thoughts: thoughts.join('\n').trim(),
    groundingMetadata: candidate?.groundingMetadata || response?.groundingMetadata || null,
  }
}

module.exports = (t) => [
  {
    name: 'nano_banana_create_image',
    label: t('action.createImage.label', 'Nano Banana Generate Image'),
    category: t('category', 'Nano Banana'),
    icon: 'Image',
    description: t('action.createImage.description', 'Generate images from text using Google Gemini Nano Banana, with grounding and thinking support.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'Google Gemini API Key', required: true },
      { key: 'prompt', type: 'string', description: '图像描述，建议用叙事性段落而非关键词堆砌', required: true },
      { key: 'model', type: 'string', description: '模型：gemini-3.1-flash-image(默认) / gemini-3-pro-image / gemini-2.5-flash-image' },
      { key: 'aspectRatio', type: 'string', description: '宽高比，如 1:1 / 16:9 / 9:16 / 3:4 / 4:3 / 21:9；3.1 Flash 额外支持 1:4/4:1/1:8/8:1' },
      { key: 'imageSize', type: 'string', description: '分辨率：默认1K / 512(仅3.1 Flash) / 1K / 2K / 4K，注意大写 K' },
      { key: 'responseModalities', type: 'string', description: 'auto=文本+图片(默认)，image=仅图片' },
      { key: 'googleSearch', type: 'boolean', description: '启用 Google 搜索 Grounding（基于实时信息生图）' },
      { key: 'imageSearch', type: 'boolean', description: '启用图片搜索（仅 3.1 Flash，不能搜人物）' },
      { key: 'thinkingLevel', type: 'string', description: '思考级别（仅 flash-image）：minimal / high' },
      { key: 'includeThoughts', type: 'boolean', description: '是否返回思考过程' },
      { key: 'baseUrl', type: 'string', description: 'API 基础地址' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'Google Gemini API Key'), default: CONFIG_APIKEY },
      { key: 'prompt', label: t('field.prompt.label', 'Image Description'), type: 'textarea', required: true, tooltip: t('field.prompt.tooltip', 'Describe the scene; narrative descriptions beat keyword lists.') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: DEFAULT_MODEL, options: [
        { label: 'gemini-3.1-flash-image · Nano Banana 2 (默认)', value: 'gemini-3.1-flash-image' },
        { label: 'gemini-3-pro-image · Nano Banana Pro', value: 'gemini-3-pro-image' },
        { label: 'gemini-2.5-flash-image · Nano Banana', value: 'gemini-2.5-flash-image' },
      ] },
      { key: 'responseModalities', label: t('field.responseModalities.label', 'Output Type'), type: 'select', default: 'auto', tooltip: t('field.responseModalities.tooltip', 'Text + Image by default; choose Image Only to suppress text.'), options: [
        { label: t('option.textImage', 'Text + Image (Default)'), value: 'auto' },
        { label: t('option.imageOnly', 'Image Only'), value: 'image' },
      ] },
      { key: 'aspectRatio', label: t('field.aspectRatio.label', 'Aspect Ratio'), type: 'select', default: 'auto', options: [
        { label: t('option.auto', 'Auto'), value: 'auto' },
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '3:2', value: '3:2' },
        { label: '2:3', value: '2:3' },
        { label: '4:5', value: '4:5' },
        { label: '5:4', value: '5:4' },
        { label: '21:9', value: '21:9' },
        { label: '1:4 (3.1 Flash)', value: '1:4' },
        { label: '4:1 (3.1 Flash)', value: '4:1' },
        { label: '1:8 (3.1 Flash)', value: '1:8' },
        { label: '8:1 (3.1 Flash)', value: '8:1' },
      ] },
      { key: 'imageSize', label: t('field.imageSize.label', 'Resolution'), type: 'select', default: 'default', tooltip: t('field.imageSize.tooltip', 'Default 1K; 512 only for 3.1 Flash. Use uppercase K (no K for 512).'), options: [
        { label: t('option.default', 'Default (1K)'), value: 'default' },
        { label: '512 (3.1 Flash)', value: '512' },
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '4K', value: '4K' },
      ] },
      { key: 'googleSearch', label: t('field.googleSearch.label', 'Google Search Grounding'), type: 'checkbox', tooltip: t('field.googleSearch.tooltip', 'Ground generation with real-time Google Search results (weather, news, stocks).') },
      { key: 'imageSearch', label: t('field.imageSearch.label', 'Image Search'), type: 'checkbox', tooltip: t('field.imageSearch.tooltip', 'Only gemini-3.1-flash-image. Use web images as visual context; cannot search for people.') },
      { key: 'thinkingLevel', label: t('field.thinkingLevel.label', 'Thinking Level'), type: 'select', default: 'auto', tooltip: t('field.thinkingLevel.tooltip', 'Only flash-image models. minimal = lowest latency, high = better quality.'), options: [
        { label: t('option.auto', 'Auto'), value: 'auto' },
        { label: 'Minimal', value: 'minimal' },
        { label: 'High', value: 'high' },
      ] },
      { key: 'includeThoughts', label: t('field.includeThoughts.label', 'Include Thoughts'), type: 'checkbox', tooltip: t('field.includeThoughts.tooltip', 'Return the model thinking process in the response.') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: CONFIG_BASEURL, tooltip: t('field.baseUrl.tooltip', 'Gemini API base URL.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'thinking', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'text', type: 'string' },
        { key: 'thoughts', type: 'string' },
        { key: 'model', type: 'string' },
        { key: 'groundingMetadata', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      try {
        const contents = [{ role: 'user', parts: [{ text: args.prompt }] }]
        const { model, response } = await callGenerateContent(ctx, args, contents)
        const parsed = await parseResponse(response, ctx)
        ctx.logger.info(`文生图完成，模型: ${model}, 生成 ${parsed.images.length} 张图片`)
        return {
          success: true,
          message: t('message.generatedImages', 'Generated {count} image(s)').replace('{count}', parsed.images.length),
          thinking: parsed.thoughts,
          data: {
            images: parsed.images,
            text: parsed.text,
            thoughts: parsed.thoughts,
            model,
            groundingMetadata: parsed.groundingMetadata,
          },
        }
      } catch (err) {
        ctx.logger.error(`文生图失败: ${err.message}`)
        return { success: false, message: t('message.failed', 'Request failed: {error}').replace('{error}', err.message), data: {} }
      }
    },
  },

  {
    name: 'nano_banana_edit_image',
    label: t('action.editImage.label', 'Nano Banana Edit Image'),
    category: t('category', 'Nano Banana'),
    icon: 'Wand2',
    description: t('action.editImage.description', 'AI image editing and compositing from reference images, multi-turn history, or video. Up to 14 reference images.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'Google Gemini API Key', required: true },
      { key: 'prompt', type: 'string', description: '编辑描述，例如增删元素、风格转换、局部修改', required: true },
      { key: 'image', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: '参考图（URL/路径/base64 data URI），最多 14 张' },
      { key: 'videoUrl', type: 'string', description: '视频 URL（仅 3.1 Flash），用于视频转图片' },
      { key: 'history', type: 'array', items: { type: 'object' }, description: '多轮编辑历史（Gemini contents 数组）' },
      { key: 'model', type: 'string', description: '模型：gemini-3.1-flash-image(默认) / gemini-3-pro-image / gemini-2.5-flash-image' },
      { key: 'aspectRatio', type: 'string', description: '宽高比' },
      { key: 'imageSize', type: 'string', description: '分辨率：默认1K / 512 / 1K / 2K / 4K' },
      { key: 'responseModalities', type: 'string', description: 'auto=文本+图片(默认)，image=仅图片' },
      { key: 'googleSearch', type: 'boolean', description: '启用 Google 搜索 Grounding' },
      { key: 'imageSearch', type: 'boolean', description: '启用图片搜索（仅 3.1 Flash）' },
      { key: 'thinkingLevel', type: 'string', description: '思考级别（仅 flash-image）：minimal / high' },
      { key: 'includeThoughts', type: 'boolean', description: '是否返回思考过程' },
      { key: 'baseUrl', type: 'string', description: 'API 基础地址' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'Google Gemini API Key'), default: CONFIG_APIKEY },
      { key: 'prompt', label: t('field.promptEdit.label', 'Edit Description'), type: 'textarea', required: true, tooltip: t('field.promptEdit.tooltip', 'Describe the edit intent, e.g. add/remove elements, style transfer, inpainting.') },
      { key: 'image', label: t('field.image.label', 'Reference Images'), type: 'textarea', dataType: 'any', tooltip: t('field.image.tooltip', 'URL / local path / data URI, or JSON array. Up to 14 images (Gemini 3).') },
      { key: 'videoUrl', label: t('field.videoUrl.label', 'Video URL'), type: 'text', tooltip: t('field.videoUrl.tooltip', 'Only gemini-3.1-flash-image. YouTube URL or Files API URI for video-to-image.') },
      { key: 'history', label: t('field.history.label', 'Conversation History'), type: 'textarea', dataType: 'object[]', tooltip: t('field.history.tooltip', 'JSON array of Gemini contents for multi-turn editing, e.g. [{"role":"user","parts":[{"text":"..."}]}].') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: DEFAULT_MODEL, options: [
        { label: 'gemini-3.1-flash-image · Nano Banana 2 (默认)', value: 'gemini-3.1-flash-image' },
        { label: 'gemini-3-pro-image · Nano Banana Pro', value: 'gemini-3-pro-image' },
        { label: 'gemini-2.5-flash-image · Nano Banana', value: 'gemini-2.5-flash-image' },
      ] },
      { key: 'responseModalities', label: t('field.responseModalities.label', 'Output Type'), type: 'select', default: 'auto', tooltip: t('field.responseModalities.tooltip', 'Text + Image by default; choose Image Only to suppress text.'), options: [
        { label: t('option.textImage', 'Text + Image (Default)'), value: 'auto' },
        { label: t('option.imageOnly', 'Image Only'), value: 'image' },
      ] },
      { key: 'aspectRatio', label: t('field.aspectRatio.label', 'Aspect Ratio'), type: 'select', default: 'auto', options: [
        { label: t('option.auto', 'Auto'), value: 'auto' },
        { label: '1:1', value: '1:1' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '3:2', value: '3:2' },
        { label: '2:3', value: '2:3' },
        { label: '4:5', value: '4:5' },
        { label: '5:4', value: '5:4' },
        { label: '21:9', value: '21:9' },
        { label: '1:4 (3.1 Flash)', value: '1:4' },
        { label: '4:1 (3.1 Flash)', value: '4:1' },
        { label: '1:8 (3.1 Flash)', value: '1:8' },
        { label: '8:1 (3.1 Flash)', value: '8:1' },
      ] },
      { key: 'imageSize', label: t('field.imageSize.label', 'Resolution'), type: 'select', default: 'default', tooltip: t('field.imageSize.tooltip', 'Default 1K; 512 only for 3.1 Flash. Use uppercase K (no K for 512).'), options: [
        { label: t('option.default', 'Default (1K)'), value: 'default' },
        { label: '512 (3.1 Flash)', value: '512' },
        { label: '1K', value: '1K' },
        { label: '2K', value: '2K' },
        { label: '4K', value: '4K' },
      ] },
      { key: 'googleSearch', label: t('field.googleSearch.label', 'Google Search Grounding'), type: 'checkbox', tooltip: t('field.googleSearch.tooltip', 'Ground generation with real-time Google Search results (weather, news, stocks).') },
      { key: 'imageSearch', label: t('field.imageSearch.label', 'Image Search'), type: 'checkbox', tooltip: t('field.imageSearch.tooltip', 'Only gemini-3.1-flash-image. Use web images as visual context; cannot search for people.') },
      { key: 'thinkingLevel', label: t('field.thinkingLevel.label', 'Thinking Level'), type: 'select', default: 'auto', tooltip: t('field.thinkingLevel.tooltip', 'Only flash-image models. minimal = lowest latency, high = better quality.'), options: [
        { label: t('option.auto', 'Auto'), value: 'auto' },
        { label: 'Minimal', value: 'minimal' },
        { label: 'High', value: 'high' },
      ] },
      { key: 'includeThoughts', label: t('field.includeThoughts.label', 'Include Thoughts'), type: 'checkbox', tooltip: t('field.includeThoughts.tooltip', 'Return the model thinking process in the response.') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: CONFIG_BASEURL, tooltip: t('field.baseUrl.tooltip', 'Gemini API base URL.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'thinking', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'text', type: 'string' },
        { key: 'thoughts', type: 'string' },
        { key: 'model', type: 'string' },
        { key: 'groundingMetadata', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      try {
        const parts = []

        // 视频上下文（仅 3.1 Flash），作为 file_data 放在最前
        if (args.videoUrl) {
          parts.push({ file_data: { file_uri: args.videoUrl }, video_metadata: { fps: 0.5 } })
        }

        // 参考图（最多 14 张）→ inline_data
        if (args.image != null && args.image !== '') {
          const inlineList = await normalizeImages(args.image)
          for (const img of inlineList) parts.push({ inline_data: img })
        }

        // 编辑指令文本
        if (args.prompt != null && args.prompt !== '') {
          parts.push({ text: args.prompt })
        }

        const currentTurn = { role: 'user', parts }

        // 多轮历史（Gemini contents）
        let contents = []
        if (args.history) {
          let history = args.history
          if (typeof history === 'string') {
            try { history = JSON.parse(history) } catch { history = null }
          }
          if (Array.isArray(history)) contents = history
        }
        contents.push(currentTurn)

        const { model, response } = await callGenerateContent(ctx, args, contents)
        const parsed = await parseResponse(response, ctx)
        ctx.logger.info(`图片编辑完成，模型: ${model}, 生成 ${parsed.images.length} 张图片`)
        return {
          success: true,
          message: t('message.imageEdited', 'Image editing completed, generated {count} image(s)').replace('{count}', parsed.images.length),
          thinking: parsed.thoughts,
          data: {
            images: parsed.images,
            text: parsed.text,
            thoughts: parsed.thoughts,
            model,
            groundingMetadata: parsed.groundingMetadata,
          },
        }
      } catch (err) {
        ctx.logger.error(`图片编辑失败: ${err.message}`)
        return { success: false, message: t('message.failed', 'Request failed: {error}').replace('{error}', err.message), data: {} }
      }
    },
  },

  {
    name: 'nano_banana_models',
    label: t('action.models.label', 'Nano Banana Model List'),
    category: t('category', 'Nano Banana'),
    icon: 'List',
    description: t('action.models.description', 'List available Gemini models.'),
    tool: false,
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'Google Gemini API Key', required: true },
      { key: 'baseUrl', type: 'string', description: 'API 基础地址' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'Google Gemini API Key'), default: CONFIG_APIKEY },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: CONFIG_BASEURL, tooltip: t('field.baseUrl.tooltip', 'Gemini API base URL.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'models', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      try {
        const apiKey = args.apiKey
        if (!apiKey) throw new Error('缺少 apiKey')
        const baseUrl = getBaseUrl(args)
        const url = `${baseUrl}/v1/models?key=${encodeURIComponent(apiKey)}&pageSize=200`
        ctx.logger.info('请求模型列表')
        const resp = await globalThis.fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const result = await resp.json()
        const models = (result.models || []).map((m) => ({
          name: m.name,
          displayName: m.displayName,
          description: m.description,
          supportedGenerationMethods: m.supportedGenerationMethods || [],
        }))
        ctx.logger.info(`模型列表: 共 ${models.length} 个模型`)
        return {
          success: true,
          message: t('message.modelCount', '{count} model(s) found').replace('{count}', models.length),
          data: { models },
        }
      } catch (err) {
        ctx.logger.error(`获取模型列表失败: ${err.message}`)
        return { success: false, message: t('message.failed', 'Request failed: {error}').replace('{error}', err.message), data: {} }
      }
    },
  },
]
