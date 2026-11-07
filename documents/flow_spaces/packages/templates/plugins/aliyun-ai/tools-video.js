const {
  ASYNC_ENDPOINTS,
  executeAsyncTask,
} = require('./shared')

module.exports = {
  tools: [
    {
      name: 'aliyun_image_to_video_v27',
      description: '万相2.7图生视频：支持首帧生视频、首尾帧生视频、视频续写、音频驱动。模型 wan2.7-i2v。',
      input_schema: {
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
    },
    {
      name: 'aliyun_image_to_video_legacy',
      description: '万相图生视频旧版：wan2.6/2.5/2.2/2.1模型，基于首帧图像生成视频，支持音频输入。',
      input_schema: {
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
    },
    {
      name: 'aliyun_first_last_frame_video',
      description: '万相首尾帧生视频：基于首帧和尾帧图像生成平滑过渡视频。模型 wan2.2-kf2v-flash/wanx2.1-kf2v-plus。',
      input_schema: {
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
    },
    {
      name: 'aliyun_reference_video',
      description: '万相2.7参考生视频：将人或物体作为主角生成视频，支持多角色互动和音色参考。模型 wan2.7-r2v。',
      input_schema: {
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
    },
    {
      name: 'aliyun_text_to_video',
      description: '万相2.7文生视频：基于文字描述生成视频，支持多镜头叙事和自动配音。模型 wan2.7-t2v。',
      input_schema: {
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
    },
    {
      name: 'aliyun_video_editing',
      description: '万相2.7视频编辑：支持指令编辑（改风格）和参考图编辑（局部替换）。模型 wan2.7-videoedit。',
      input_schema: {
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
    },
    {
      name: 'aliyun_animate_move',
      description: '万相图生动作：将参考视频的动作/表情迁移到人物图片中。模型 wan2.2-animate-move，支持标准/专业模式。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'API Key' },
          imageUrl: { type: 'string', description: '人物图片URL(正面单人清晰)' },
          videoUrl: { type: 'string', description: '参考动作视频URL(2-30秒)' },
          mode: { type: 'string', description: 'wan-std(标准)或wan-pro(专业)，默认wan-std' },
        },
        required: ['apiKey', 'imageUrl', 'videoUrl'],
      },
    },
    {
      name: 'aliyun_videoretalk',
      description: '声动人像VideoRetalk：基于人物视频和人声音频生成口型匹配的新视频。模型 videoretalk。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'API Key' },
          videoUrl: { type: 'string', description: '人物视频URL(正面镜头)' },
          audioUrl: { type: 'string', description: '人声音频URL(wav/mp3)' },
        },
        required: ['apiKey', 'videoUrl', 'audioUrl'],
      },
    },
  ],

  handler: async (name, args, api) => {
    switch (name) {
      case 'aliyun_image_to_video_v27': {
        const body = {
          model: 'wan2.7-i2v',
          input: { ...(args.prompt && { prompt: args.prompt }), media: args.media },
          parameters: {
            resolution: args.resolution || '720P',
            duration: args.duration || 5,
            prompt_extend: args.promptExtend !== false,
            watermark: args.watermark === true,
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_image_to_video_legacy': {
        const body = {
          model: args.model || 'wan2.6-i2v-flash',
          input: { prompt: args.prompt || '', img_url: args.imageUrl, ...(args.audioUrl && { audio_url: args.audioUrl }) },
          parameters: {
            resolution: args.resolution || '720P',
            duration: args.duration || 5,
            prompt_extend: args.promptExtend !== false,
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_first_last_frame_video': {
        const body = {
          model: args.model || 'wan2.2-kf2v-flash',
          input: { prompt: args.prompt || '', first_frame_url: args.firstFrameUrl, last_frame_url: args.lastFrameUrl },
          parameters: {
            resolution: args.resolution || '720P',
            prompt_extend: args.promptExtend !== false,
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.image2video, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_reference_video': {
        const body = {
          model: 'wan2.7-r2v',
          input: { prompt: args.prompt, media: args.media },
          parameters: {
            resolution: args.resolution || '720P',
            ratio: args.ratio || '16:9',
            duration: args.duration || 5,
            prompt_extend: args.promptExtend !== false,
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_text_to_video': {
        const body = {
          model: 'wan2.7-t2v',
          input: { prompt: args.prompt, ...(args.audioUrl && { audio_url: args.audioUrl }) },
          parameters: {
            resolution: args.resolution || '720P',
            ratio: args.ratio || '16:9',
            duration: args.duration || 5,
            prompt_extend: args.promptExtend !== false,
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_video_editing': {
        const media = [{ type: 'video', url: args.videoUrl }]
        if (args.referenceImages) for (const img of args.referenceImages) media.push({ type: 'reference_image', url: img })
        const body = {
          model: 'wan2.7-videoedit',
          input: { prompt: args.prompt, media },
          parameters: {
            resolution: args.resolution || '720P',
            prompt_extend: args.promptExtend !== false,
            ...(args.duration && { duration: args.duration }),
            ...(args.audioSetting && { audio_setting: args.audioSetting }),
            ...(args.seed != null && { seed: args.seed }),
          },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.videoSynthesis, body, (result) => ({
          success: true, message: '视频编辑完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_animate_move': {
        const body = {
          model: 'wan2.2-animate-move',
          input: { image_url: args.imageUrl, video_url: args.videoUrl },
          parameters: { mode: args.mode || 'wan-std' },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.image2video, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      case 'aliyun_videoretalk': {
        const body = {
          model: 'videoretalk',
          input: { video_url: args.videoUrl, audio_url: args.audioUrl },
        }
        return executeAsyncTask(api, args, ASYNC_ENDPOINTS.image2video, body, (result) => ({
          success: true, message: '视频生成完成', data: { videoUrl: result.output?.video_url, requestId: result.request_id },
        }))
      }

      default:
        return { success: false, message: `??????: ${name}` }
    }
  },
}
