const {
  SYNC_ENDPOINT,
  ASYNC_ENDPOINTS,
  getHeaders,
  extractImageUrls,
  extractLegacyImageUrls,
  executeAsyncTask,
} = require('./shared')

module.exports = {
  tools: [
    {
      name: 'aliyun_text_to_image',
      description: '阿里云百炼AI文生图：千问/万相模型同步生成图片。支持 qwen-image-2.0-pro/qwen-image-2.0/qwen-image-max/wan2.7-image-pro/wan2.7-image/wan2.6-t2i。',
      input_schema: {
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
    },
    {
      name: 'aliyun_image_edit',
      description: '阿里云百炼AI图像编辑：基于图片和文字描述进行风格迁移、物体增删、局部修改。支持千问和万相2.7模型。',
      input_schema: {
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
    },
    {
      name: 'aliyun_wan_text_to_image_legacy',
      description: '万相2.5及以下版本文生图(异步)：支持 wan2.5-t2i-preview/wan2.2-t2i-flash/wan2.2-t2i-plus 等旧版万相模型。',
      input_schema: {
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
    },
    {
      name: 'aliyun_image_out_painting',
      description: '图像画面扩展/扩图：按宽高比、按比例或按方向像素扩展图像，支持旋转。模型：image-out-painting。',
      input_schema: {
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
    },
    {
      name: 'aliyun_kling_image_generation',
      description: '可灵AI图像生成：文生图和参考图生图。支持 kling-v3-image-generation/kling-v3-omni-image-generation 模型，单图和组图模式。',
      input_schema: {
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
    },
  ],

  handler: async (name, args, api) => {
    switch (name) {
      case 'aliyun_text_to_image': {
        const headers = getHeaders(args)
        const body = {
          model: args.model || 'qwen-image-2.0-pro',
          input: { messages: [{ role: 'user', content: [{ text: args.prompt }] }] },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            ...(args.seed != null && { seed: args.seed }),
            ...(args.promptExtend != null ? { prompt_extend: args.promptExtend } : { prompt_extend: true }),
          },
        }
        const result = await api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        const urls = extractImageUrls(result)
        return { success: true, message: `生成 ${urls.length} 张图片`, data: { images: urls, requestId: result.request_id } }
      }

      case 'aliyun_image_edit': {
        if (!args.images?.length) return { success: false, message: '需要至少1张输入图片' }
        const headers = getHeaders(args)
        const content = args.images.map(img => ({ image: img }))
        content.push({ text: args.prompt })
        const body = {
          model: args.model || 'qwen-image-2.0-pro',
          input: { messages: [{ role: 'user', content }] },
          parameters: {
            size: args.size || '2048*2048',
            ...(args.n && { n: args.n }),
            ...(args.negativePrompt && { negative_prompt: args.negativePrompt }),
            ...(args.promptExtend != null ? { prompt_extend: args.promptExtend } : { prompt_extend: true }),
          },
        }
        const result = await api.postJson(SYNC_ENDPOINT, { headers, body, timeout: 600000 })
        if (result.code || result.message) return { success: false, message: `API错误: ${result.code} - ${result.message}` }
        const urls = extractImageUrls(result)
        return { success: true, message: `图像编辑完成，${urls.length} 张`, data: { images: urls, requestId: result.request_id } }
      }

      case 'aliyun_wan_text_to_image_legacy': {
        const body = {
          model: args.model || 'wan2.5-t2i-preview',
          input: { prompt: args.prompt, ...(args.negativePrompt && { negative_prompt: args.negativePrompt }) },
          parameters: {
            size: args.size || '1280*1280',
            ...(args.n && { n: args.n }),
            ...(args.seed != null && { seed: args.seed }),
            prompt_extend: args.promptExtend !== false,
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.wanText2Image, body, (result) => {
          const urls = extractLegacyImageUrls(result)
          return { success: true, message: `生成 ${urls.length} 张图片`, data: { images: urls, requestId: result.request_id } }
        })
      }

      case 'aliyun_image_out_painting': {
        const body = {
          model: 'image-out-painting',
          input: { image_url: args.imageUrl },
          parameters: {
            ...(args.angle && { angle: args.angle }),
            ...(args.outputRatio && { output_ratio: args.outputRatio }),
            ...(args.xScale && { x_scale: args.xScale }),
            ...(args.yScale && { y_scale: args.yScale }),
            ...(args.leftOffset && { left_offset: args.leftOffset }),
            ...(args.rightOffset && { right_offset: args.rightOffset }),
            ...(args.topOffset && { top_offset: args.topOffset }),
            ...(args.bottomOffset && { bottom_offset: args.bottomOffset }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.outPainting, body, (result) => ({
          success: true, message: '图像扩图完成', data: { imageUrl: result.output?.output_image_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_kling_image_generation': {
        const content = [{ text: args.prompt }]
        if (args.images) for (const img of args.images) content.push({ image: img })
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
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.klingImage, body, (result) => {
          const urls = extractImageUrls(result)
          return { success: true, message: `生成 ${urls.length} 张图片`, data: { images: urls, requestId: result.request_id } }
        })
      }

      default:
        return { success: false, message: `??????: ${name}` }
    }
  },
}
