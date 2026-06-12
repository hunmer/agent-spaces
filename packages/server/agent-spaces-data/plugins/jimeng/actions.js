const JIMENG_BASE_URL = 'http://localhost:5100'

function getBaseUrl(args) {
  return args.baseUrl || JIMENG_BASE_URL
}

function getHeaders(args) {
  const token = args.sessionId
  if (!token) throw new Error('缺少 sessionId')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }
}

module.exports = (t) => [
  {
    name: 'jimeng_text_to_image',
    label: t('action.textToImage.label', 'AI Text to Image'),
    category: t('category', 'Jimeng AI'),
    icon: 'Image',
    description: t('action.textToImage.description', 'Generate images from text descriptions using Jimeng AI.'),
    properties: [
      { key: 'sessionId', label: t('field.sessionId.label', 'Session Token'), type: 'text', required: true, tooltip: t('field.sessionId.tooltip', 'Jimeng session ID (add prefix us-/hk-/jp-/sg- for international sites)'), default: '{{ __config__["workflow.jimeng"]["sessionId"] }}' },
      { key: 'prompt', label: t('field.prompt.label', 'Image Description'), type: 'textarea', required: true, tooltip: t('field.prompt.tooltip', 'Describe the image you want to generate.') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'jimeng-4.5', options: [
        { label: 'jimeng-4.5 (默认)', value: 'jimeng-4.5' },
        { label: 'jimeng-5.0', value: 'jimeng-5.0' },
        { label: 'jimeng-4.6', value: 'jimeng-4.6' },
        { label: 'jimeng-4.1', value: 'jimeng-4.1' },
        { label: 'jimeng-4.0', value: 'jimeng-4.0' },
        { label: 'jimeng-3.1 (仅中国站)', value: 'jimeng-3.1' },
        { label: 'jimeng-3.0', value: 'jimeng-3.0' },
      ] },
      { key: 'ratio', label: t('field.ratio.label', 'Aspect Ratio'), type: 'select', default: '1:1', options: [
        { label: '1:1', value: '1:1' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '3:2', value: '3:2' },
        { label: '2:3', value: '2:3' },
        { label: '21:9', value: '21:9' },
      ] },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '2k', options: [
        { label: '1K', value: '1k' },
        { label: '2K (默认)', value: '2k' },
        { label: '4K', value: '4k' },
      ] },
      { key: 'negativePrompt', label: t('field.negativePrompt.label', 'Negative Prompt'), type: 'textarea', tooltip: t('field.negativePrompt.tooltip', 'Content to exclude from generation.') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API Address'), type: 'text', default: '{{ __config__["workflow.jimeng"]["baseUrl"] }}', tooltip: t('field.baseUrl.tooltip', 'Jimeng API service address.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'created', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const body = {
        model: args.model || 'jimeng-4.5',
        prompt: args.prompt,
        ratio: args.ratio || '1:1',
        resolution: args.resolution || '2k',
        ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
      }
      ctx.logger.info(`请求地址: ${baseUrl}/v1/images/generations`)
      ctx.logger.info(`模型: ${body.model}, 比例: ${body.ratio}, 分辨率: ${body.resolution}`)
      ctx.logger.info(`提示词: ${body.prompt}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/images/generations`, { headers, body, timeout: 600000 })
      const urls = result.data?.map(d => d.url) || []
      ctx.logger.info(`生成完成，共 ${urls.length} 张图片`)
      return { success: true, message: t('message.generatedImages', 'Generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, created: result.created } }
    },
  },
  {
    name: 'jimeng_image_to_image',
    label: t('action.imageToImage.label', 'AI Image to Image'),
    category: t('category', 'Jimeng AI'),
    icon: 'Wand2',
    description: t('action.imageToImage.description', 'Generate new images from input images and text (style transfer, image fusion, etc.).'),
    properties: [
      { key: 'sessionId', label: t('field.sessionId.label', 'Session Token'), type: 'text', required: true, tooltip: t('field.sessionId.tooltip', 'Jimeng session ID (add prefix us-/hk-/jp-/sg- for international sites)'), default: '{{ __config__["workflow.jimeng"]["sessionId"] }}' },
      { key: 'prompt', label: t('field.promptDirection.label', 'Image Description'), type: 'textarea', required: true, tooltip: t('field.promptDirection.tooltip', 'Describe the generation direction.') },
      { key: 'images', label: t('field.images.label', 'Image URLs'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.images.tooltip', 'Array of input image URLs, e.g. ["https://..."]') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'jimeng-4.5', options: [
        { label: 'jimeng-4.5 (默认)', value: 'jimeng-4.5' },
        { label: 'jimeng-5.0', value: 'jimeng-5.0' },
        { label: 'jimeng-4.6', value: 'jimeng-4.6' },
        { label: 'jimeng-4.1', value: 'jimeng-4.1' },
        { label: 'jimeng-4.0', value: 'jimeng-4.0' },
      ] },
      { key: 'ratio', label: t('field.ratio.label', 'Aspect Ratio'), type: 'select', default: '1:1', options: [
        { label: '1:1', value: '1:1' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
      ] },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '2k', options: [
        { label: '1K', value: '1k' },
        { label: '2K', value: '2k' },
        { label: '4K', value: '4k' },
      ] },
      { key: 'sampleStrength', label: t('field.sampleStrength.label', 'Sample Strength'), type: 'number', default: 0.7, tooltip: t('field.sampleStrength.tooltip', '0.0-1.0') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API Address'), type: 'text', default: '{{ __config__["workflow.jimeng"]["baseUrl"] }}', tooltip: t('field.baseUrl.tooltip', 'Jimeng API service address.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'created', type: 'number' },
        { key: 'inputImages', type: 'image[]' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const images = Array.isArray(args.images) ? args.images : JSON.parse(args.images)
      const body = {
        model: args.model || 'jimeng-4.5',
        prompt: args.prompt,
        images,
        ratio: args.ratio || '1:1',
        resolution: args.resolution || '2k',
        ...(args.sampleStrength != null && { sample_strength: args.sampleStrength }),
      }
      ctx.logger.info(`请求地址: ${baseUrl}/v1/images/compositions`)
      ctx.logger.info(`模型: ${body.model}, 比例: ${body.ratio}, 分辨率: ${body.resolution}`)
      ctx.logger.info(`输入图片: ${images.length} 张, 采样强度: ${body.sample_strength ?? '默认'}`)
      ctx.logger.info(`提示词: ${body.prompt}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/images/compositions`, { headers, body, timeout: 600000 })
      const urls = result.data?.map(d => d.url) || []
      ctx.logger.info(`图生图完成，共 ${urls.length} 张图片`)
      return { success: true, message: t('message.imageToImageCompleted', 'Image-to-image completed, generated {count} image(s)').replace('{count}', urls.length), data: { images: urls, created: result.created, inputImages: result.input_images } }
    },
  },
  {
    name: 'jimeng_text_to_video',
    label: t('action.textToVideo.label', 'AI Video Generation'),
    category: t('category', 'Jimeng AI'),
    icon: 'Video',
    description: t('action.textToVideo.description', 'Generate videos from text or images (text-to-video / image-to-video / first-last frame).'),
    properties: [
      { key: 'sessionId', label: t('field.sessionId.label', 'Session Token'), type: 'text', required: true, tooltip: t('field.sessionId.tooltip', 'Jimeng session ID (add prefix us-/hk-/jp-/sg- for international sites)'), default: '{{ __config__["workflow.jimeng"]["sessionId"] }}' },
      { key: 'prompt', label: t('field.promptVideo.label', 'Video Description'), type: 'textarea', required: true, tooltip: t('field.promptVideo.tooltip', 'Describe the video content.') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'jimeng-video-3.5-pro', options: [
        { label: 'jimeng-video-3.5-pro (默认)', value: 'jimeng-video-3.5-pro' },
        { label: 'jimeng-video-3.0', value: 'jimeng-video-3.0' },
        { label: 'jimeng-video-3.0-pro', value: 'jimeng-video-3.0-pro' },
        { label: 'jimeng-video-3.0-fast', value: 'jimeng-video-3.0-fast' },
        { label: 'jimeng-video-2.0', value: 'jimeng-video-2.0' },
        { label: 'jimeng-video-2.0-pro', value: 'jimeng-video-2.0-pro' },
      ] },
      { key: 'ratio', label: t('field.ratio.label', 'Aspect Ratio'), type: 'select', default: '1:1', options: [
        { label: '1:1', value: '1:1' },
        { label: '4:3', value: '4:3' },
        { label: '3:4', value: '3:4' },
        { label: '16:9', value: '16:9' },
        { label: '9:16', value: '9:16' },
        { label: '21:9', value: '21:9' },
      ] },
      { key: 'duration', label: t('field.duration.label', 'Duration (seconds)'), type: 'number', default: 5, tooltip: t('field.duration.tooltip', '5 or 10 seconds') },
      { key: 'filePaths', label: t('field.filePaths.label', 'Image URLs'), type: 'textarea', dataType: 'string[]', tooltip: t('field.filePaths.tooltip', 'Array of image URLs. 1 image = image-to-video, 2 images = first-last frame.') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API Address'), type: 'text', default: '{{ __config__["workflow.jimeng"]["baseUrl"] }}', tooltip: t('field.baseUrl.tooltip', 'Jimeng API service address.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'videos', type: 'video[]' },
        { key: 'created', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const body = {
        model: args.model || 'jimeng-video-3.5-pro',
        prompt: args.prompt,
        ratio: args.ratio || '1:1',
        duration: args.duration || 5,
        ...(args.filePaths && { filePaths: Array.isArray(args.filePaths) ? args.filePaths : JSON.parse(args.filePaths) }),
      }
      ctx.logger.info(`请求地址: ${baseUrl}/v1/videos/generations`)
      ctx.logger.info(`模型: ${body.model}, 比例: ${body.ratio}, 时长: ${body.duration}s`)
      ctx.logger.info(`提示词: ${body.prompt}`)
      if (body.filePaths) ctx.logger.info(`输入图片: ${body.filePaths.length} 张`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/videos/generations`, { headers, body, timeout: 600000 })
      const urls = result.data?.map(d => d.url) || []
      ctx.logger.info(`视频生成完成，共 ${urls.length} 个视频`)
      return { success: true, message: t('message.videoGenerated', 'Video generation completed'), data: { videos: urls, created: result.created } }
    },
  },
]
