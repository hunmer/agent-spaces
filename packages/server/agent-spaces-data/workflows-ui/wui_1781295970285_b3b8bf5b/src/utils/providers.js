/**
 * AI 绘图提供商配置
 * 定义各提供商支持的模式、工具映射、表单字段
 */

// ====== 模式定义 ======
export const MODES = [
  { id: 'text_to_image', label: '文生图', icon: '🖼' },
  { id: 'image_to_image', label: '图生图', icon: '🎨' },
  { id: 'image_edit', label: '图片编辑', icon: '✏️' },
  { id: 'image_to_video', label: '图生视频', icon: '🎬' },
  { id: 'image_outpainting', label: '扩图', icon: '🔲' },
  { id: 'video_editing', label: '视频编辑', icon: '🎞' },
  { id: 'video_retalk', label: '数字人', icon: '🗣' },
];

// ====== 提供商定义 ======
export const PROVIDERS = [
  {
    id: 'minimax',
    name: 'MiniMax',
    pluginId: 'workflow.minimax',
    supportedModes: ['image_to_video'],
  },
  {
    id: 'jimeng',
    name: '即梦',
    pluginId: 'workflow.jimeng',
    supportedModes: ['text_to_image', 'image_to_image', 'image_to_video'],
  },
  {
    id: 'aliyun',
    name: '阿里云',
    pluginId: 'workflow.aliyun-ai',
    supportedModes: ['text_to_image', 'image_to_image', 'image_edit', 'image_to_video', 'image_outpainting', 'video_editing', 'video_retalk'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    pluginId: 'workflow.openai',
    supportedModes: ['text_to_image', 'image_to_image', 'image_edit'],
  },
];

// ====== 尺寸选项 ======
export const SIZE_OPTIONS = {
  jimeng: {
    text_to_image: [
      { value: '1:1', label: '1:1' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '3:2', label: '3:2' },
      { value: '2:3', label: '2:3' },
      { value: '21:9', label: '21:9' },
    ],
    image_to_image: [
      { value: '1:1', label: '1:1' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
    ],
    image_to_video: [
      { value: '1:1', label: '1:1' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
      { value: '21:9', label: '21:9' },
    ],
  },
  aliyun: {
    text_to_image: [
      { value: '1024*1024', label: '1024×1024' },
      { value: '2048*2048', label: '2048×2048' },
      { value: '1280*720', label: '1280×720' },
      { value: '720*1280', label: '720×1280' },
    ],
    image_to_image: [
      { value: '1024*1024', label: '1024×1024' },
      { value: '2048*2048', label: '2048×2048' },
    ],
    image_edit: [
      { value: '1024*1024', label: '1024×1024' },
      { value: '2048*2048', label: '2048×2048' },
      { value: '1280*720', label: '1280×720' },
      { value: '720*1280', label: '720×1280' },
    ],
    image_to_video: [
      { value: '720P', label: '720P' },
      { value: '1080P', label: '1080P' },
    ],
    video_editing: [
      { value: '720P', label: '720P' },
      { value: '1080P', label: '1080P' },
    ],
  },
  minimax: {
    image_to_video: [
      { value: '720P', label: '720P' },
      { value: '768P', label: '768P' },
      { value: '1080P', label: '1080P' },
    ],
  },
  openai: {
    text_to_image: [
      { value: 'auto', label: '自动' },
      { value: '1024x1024', label: '1024×1024' },
      { value: '1536x1024', label: '1536×1024 (3:2)' },
      { value: '1024x1536', label: '1024×1536 (2:3)' },
    ],
    image_to_image: [
      { value: 'auto', label: '自动' },
      { value: '1024x1024', label: '1024×1024' },
      { value: '1536x1024', label: '1536×1024 (3:2)' },
      { value: '1024x1536', label: '1024×1536 (2:3)' },
    ],
    image_edit: [
      { value: 'auto', label: '自动' },
      { value: '1024x1024', label: '1024×1024' },
      { value: '1536x1024', label: '1536×1024 (3:2)' },
      { value: '1024x1536', label: '1024×1536 (2:3)' },
    ],
  },
};

// ====== 分辨率选项（即梦文生图） ======
export const RESOLUTION_OPTIONS = {
  jimeng: {
    text_to_image: [
      { value: '1k', label: '1K' },
      { value: '2k', label: '2K (默认)' },
      { value: '4k', label: '4K' },
    ],
  },
};

// ====== 时长选项 ======
export const DURATION_OPTIONS = {
  minimax: [
    { value: 6, label: '6 秒' },
    { value: 10, label: '10 秒' },
  ],
  jimeng: [
    { value: 5, label: '5 秒' },
    { value: 10, label: '10 秒' },
  ],
  aliyun: [
    { value: 5, label: '5 秒' },
    { value: 10, label: '10 秒' },
  ],
};

// ====== OpenAI 质量选项 ======
export const QUALITY_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

// ====== OpenAI 输出格式选项 ======
export const OUTPUT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
];

// ====== 模型选项（按提供商 × 模式映射） ======
export const MODEL_OPTIONS = {
  openai: {
    text_to_image: [
      { value: 'gpt-image-2', label: 'GPT Image 2' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (默认)' },
      { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
      { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
      { value: 'dall-e-3', label: 'DALL·E 3' },
      { value: 'dall-e-2', label: 'DALL·E 2' },
    ],
    image_to_image: [
      { value: 'gpt-image-2', label: 'GPT Image 2' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (默认)' },
      { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
      { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
      { value: 'dall-e-3', label: 'DALL·E 3' },
      { value: 'dall-e-2', label: 'DALL·E 2' },
    ],
    image_edit: [
      { value: 'gpt-image-2', label: 'GPT Image 2' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (默认)' },
      { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
      { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
      { value: 'dall-e-3', label: 'DALL·E 3' },
      { value: 'dall-e-2', label: 'DALL·E 2' },
    ],
  },
  jimeng: {
    text_to_image: [
      { value: 'jimeng-4.5', label: '即梦 4.5 (默认)' },
      { value: 'jimeng-5.0', label: '即梦 5.0' },
      { value: 'jimeng-4.6', label: '即梦 4.6' },
      { value: 'jimeng-4.1', label: '即梦 4.1' },
      { value: 'jimeng-4.0', label: '即梦 4.0' },
      { value: 'jimeng-3.1', label: '即梦 3.1' },
      { value: 'jimeng-3.0', label: '即梦 3.0' },
    ],
    image_to_image: [
      { value: 'jimeng-4.5', label: '即梦 4.5 (默认)' },
      { value: 'jimeng-5.0', label: '即梦 5.0' },
      { value: 'jimeng-4.6', label: '即梦 4.6' },
      { value: 'jimeng-4.1', label: '即梦 4.1' },
      { value: 'jimeng-4.0', label: '即梦 4.0' },
    ],
    image_to_video: [
      { value: 'jimeng-video-3.5-pro', label: '即梦视频 3.5 Pro (默认)' },
      { value: 'jimeng-video-3.0-pro', label: '即梦视频 3.0 Pro' },
      { value: 'jimeng-video-3.0', label: '即梦视频 3.0' },
      { value: 'jimeng-video-3.0-fast', label: '即梦视频 3.0 Fast' },
      { value: 'jimeng-video-2.0-pro', label: '即梦视频 2.0 Pro' },
      { value: 'jimeng-video-2.0', label: '即梦视频 2.0' },
    ],
  },
  aliyun: {
    text_to_image: [
      { value: 'qwen-image-2.0-pro', label: '千问图像 2.0 Pro' },
      { value: 'qwen-image-2.0', label: '千问图像 2.0' },
      { value: 'wanx2.1-t2i-turbo', label: '万相 2.1 Turbo' },
    ],
    image_to_image: [
      { value: 'qwen-image-2.0-pro', label: '千问图像 2.0 Pro' },
      { value: 'qwen-image-2.0', label: '千问图像 2.0' },
    ],
    image_edit: [
      { value: 'qwen-image-2.0-pro', label: '千问图像 2.0 Pro' },
      { value: 'qwen-image-2.0', label: '千问图像 2.0' },
    ],
  },
  minimax: {
    image_to_video: [
      { value: 'MiniMax-Hailuo-2.3', label: 'Hailuo 2.3' },
      { value: 'I2V-01-Director', label: 'I2V-01 Director' },
      { value: 'I2V-01-live', label: 'I2V-01 Live' },
      { value: 'I2V-01', label: 'I2V-01' },
    ],
  },
};

// ====== 辅助函数 ======

/** 获取指定模式下可用的提供商列表 */
export function getAvailableProviders(modeId) {
  return PROVIDERS.filter((p) => !p.disabled && p.supportedModes.includes(modeId));
}

/** 获取提供商+模式对应的模型选项列表 */
export function getModelOptions(providerId, modeId) {
  return MODEL_OPTIONS[providerId]?.[modeId] || [];
}

/** 获取提供商+模式的默认模型值 */
export function getDefaultModel(providerId, modeId) {
  const options = getModelOptions(providerId, modeId);
  return options[0]?.value || '';
}

/** 根据提供商+模式构建插件工具调用参数（callPluginTool 使用默认配置） */
export function buildToolCall(providerId, modeId, formData) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider || provider.disabled) return null;

  switch (modeId) {
    // ---------- 文生图 ----------
    case 'text_to_image': {
      if (providerId === 'jimeng') {
        return {
          pluginId: provider.pluginId,
          toolName: 'jimeng_text_to_image',
          args: {
            prompt: formData.prompt,
            ...(formData.model && { model: formData.model }),
            ...(formData.negativePrompt && { negativePrompt: formData.negativePrompt }),
            ...(formData.ratio && { ratio: formData.ratio }),
            ...(formData.resolution && { resolution: formData.resolution }),
          },
        };
      }
      if (providerId === 'aliyun') {
        return {
          pluginId: provider.pluginId,
          toolName: 'aliyun_text_to_image',
          args: {
            prompt: formData.prompt,
            ...(formData.model && { model: formData.model }),
            ...(formData.negativePrompt && { negativePrompt: formData.negativePrompt }),
            ...(formData.size && { size: formData.size }),
            ...(formData.n && { n: formData.n }),
          },
        };
      }
      if (providerId === 'openai') {
        return {
          pluginId: provider.pluginId,
          toolName: 'openai_create_image',
          args: {
            prompt: formData.prompt,
            ...(formData.model && { model: formData.model }),
            ...(formData.size && formData.size !== 'auto' && { size: formData.size }),
            ...(formData.quality && formData.quality !== 'auto' && { quality: formData.quality }),
            ...(formData.n && formData.n > 1 && { n: formData.n }),
            ...(formData.outputFormat && formData.outputFormat !== 'png' && { output_format: formData.outputFormat }),
          },
        };
      }
      return null;
    }

    // ---------- 图生图 ----------
    case 'image_to_image': {
      const images = formData.imageUrls.filter(Boolean);
      if (providerId === 'jimeng') {
        return {
          pluginId: provider.pluginId,
          toolName: 'jimeng_image_to_image',
          args: {
            prompt: formData.prompt,
            images,
            ...(formData.model && { model: formData.model }),
            ...(formData.negativePrompt && { negativePrompt: formData.negativePrompt }),
            ...(formData.ratio && { ratio: formData.ratio }),
            ...(formData.sampleStrength != null && { sampleStrength: formData.sampleStrength }),
          },
        };
      }
      if (providerId === 'aliyun') {
        return {
          pluginId: provider.pluginId,
          toolName: 'aliyun_image_edit',
          args: {
            prompt: formData.prompt,
            images,
            ...(formData.model && { model: formData.model }),
            ...(formData.negativePrompt && { negativePrompt: formData.negativePrompt }),
            ...(formData.size && { size: formData.size }),
          },
        };
      }
      if (providerId === 'openai') {
        return {
          pluginId: provider.pluginId,
          toolName: 'openai_edit_image',
          args: {
            prompt: formData.prompt,
            images: images.map((url) => ({ image_url: url })),
            ...(formData.model && { model: formData.model }),
            ...(formData.size && formData.size !== 'auto' && { size: formData.size }),
            ...(formData.quality && formData.quality !== 'auto' && { quality: formData.quality }),
            ...(formData.n && formData.n > 1 && { n: formData.n }),
          },
        };
      }
      return null;
    }

    // ---------- 图片编辑 ----------
    case 'image_edit': {
      const editImages = formData.imageUrls.filter(Boolean);
      if (providerId === 'aliyun') {
        return {
          pluginId: provider.pluginId,
          toolName: 'aliyun_image_edit',
          args: {
            prompt: formData.prompt,
            images: editImages,
            ...(formData.model && { model: formData.model }),
            ...(formData.negativePrompt && { negativePrompt: formData.negativePrompt }),
            ...(formData.size && { size: formData.size }),
            ...(formData.n && formData.n > 1 && { n: formData.n }),
          },
        };
      }
      if (providerId === 'openai') {
        return {
          pluginId: provider.pluginId,
          toolName: 'openai_edit_image',
          args: {
            prompt: formData.prompt,
            images: editImages.map((url) => ({ image_url: url })),
            ...(formData.model && { model: formData.model }),
            ...(formData.size && formData.size !== 'auto' && { size: formData.size }),
            ...(formData.quality && formData.quality !== 'auto' && { quality: formData.quality }),
            ...(formData.n && formData.n > 1 && { n: formData.n }),
          },
        };
      }
      return null;
    }

    // ---------- 图生视频 ----------
    case 'image_to_video': {
      const imageUrl = formData.imageUrl;
      if (providerId === 'minimax') {
        return {
          pluginId: provider.pluginId,
          toolName: 'minimax_image_to_video',
          args: {
            firstFrameImage: imageUrl,
            ...(formData.model && { model: formData.model }),
            ...(formData.prompt && { prompt: formData.prompt }),
            ...(formData.duration && { duration: formData.duration }),
            ...(formData.resolution && { resolution: formData.resolution }),
          },
          // MiniMax 视频是异步任务，需要后续轮询
          asyncVideo: true,
        };
      }
      if (providerId === 'jimeng') {
        return {
          pluginId: provider.pluginId,
          toolName: 'jimeng_text_to_video',
          args: {
            prompt: formData.prompt,
            ...(formData.model && { model: formData.model }),
            filePaths: imageUrl ? [imageUrl] : undefined,
            ...(formData.duration && { duration: formData.duration }),
            ...(formData.ratio && { ratio: formData.ratio }),
          },
        };
      }
      if (providerId === 'aliyun') {
        return {
          pluginId: provider.pluginId,
          toolName: 'aliyun_image_to_video_v27',
          args: {
            media: [{ type: 'first_frame', url: imageUrl }],
            ...(formData.prompt && { prompt: formData.prompt }),
            ...(formData.duration && { duration: formData.duration }),
            ...(formData.resolution && { resolution: formData.resolution }),
          },
        };
      }
      return null;
    }

    // ---------- 扩图 ----------
    case 'image_outpainting': {
      if (providerId !== 'aliyun') return null;
      return {
        pluginId: provider.pluginId,
        toolName: 'aliyun_image_out_painting',
        args: {
          imageUrl: formData.imageUrl,
          expandMode: formData.expandMode || 'ratio',
          ...(formData.expandMode === 'ratio' && formData.outputRatio && { outputRatio: formData.outputRatio }),
          ...(formData.expandMode === 'scale' && {
            ...(formData.xScale && { xScale: formData.xScale }),
            ...(formData.yScale && { yScale: formData.yScale }),
          }),
          ...(formData.expandMode === 'offset' && {
            ...(formData.leftOffset && { leftOffset: formData.leftOffset }),
            ...(formData.rightOffset && { rightOffset: formData.rightOffset }),
            ...(formData.topOffset && { topOffset: formData.topOffset }),
            ...(formData.bottomOffset && { bottomOffset: formData.bottomOffset }),
          }),
          ...(formData.angle && { angle: formData.angle }),
        },
      };
    }

    // ---------- 视频编辑 ----------
    case 'video_editing': {
      if (providerId !== 'aliyun') return null;
      const referenceImages = (formData.referenceImageUrls || []).filter(Boolean);
      return {
        pluginId: provider.pluginId,
        toolName: 'aliyun_video_editing',
        args: {
          prompt: formData.prompt,
          videoUrl: formData.videoUrl,
          ...(referenceImages.length > 0 && { referenceImages }),
          ...(formData.resolution && { resolution: formData.resolution }),
          ...(formData.duration && { duration: formData.duration }),
        },
      };
    }

    // ---------- 数字人 ----------
    case 'video_retalk': {
      if (providerId !== 'aliyun') return null;
      return {
        pluginId: provider.pluginId,
        toolName: 'aliyun_videoretalk',
        args: {
          videoUrl: formData.videoUrl,
          audioUrl: formData.audioUrl,
        },
      };
    }

    default:
      return null;
  }
}

/**
 * 检查插件返回是否有错误
 *
 * 所有插件统一返回 { success: boolean, message: string, data: {...} }
 * @param {object} result - callPluginTool 返回值
 * @returns {string|null} 错误信息，无错误返回 null
 */
export function checkResultError(result) {
  if (!result) return '生成返回为空';
  if (result.success === false) {
    return result.message || '生成失败';
  }
  return null;
}

/**
 * 从插件返回结果中提取媒体 URL 列表
 *
 * 基于 get_plugin_tool_detail outputs 定义，所有插件统一返回：
 *   { success: boolean, message: string, data: { ... } }
 *
 * 图片类 tool data 结构：
 *   - openai_create_image / openai_edit_image → { images: string[], created, usage }
 *   - aliyun_text_to_image / aliyun_image_edit → { images: string[], requestId }
 *   - jimeng_text_to_image / jimeng_image_to_image → { images: string[], created }
 *
 * 视频类 tool data 结构：
 *   - minimax_image_to_video → { taskId } (异步，需轮询)
 *   - minimax_video_async_wait → { downloadUrl, fileId, ... }
 *   - aliyun_image_to_video_v27 → { videoUrl, taskId, requestId }
 *   - jimeng_text_to_video → { videos: string[], created }
 */
export function extractMediaUrls(result, modeId) {
  if (!result) return [];
  const data = result.data || result;

  if (modeId === 'image_to_video' || modeId === 'video_editing' || modeId === 'video_retalk') {
    // MiniMax 轮询结果: data.downloadUrl
    // 阿里云视频: data.videoUrl
    const url = data.downloadUrl || data.videoUrl;
    if (url) return [{ type: 'video', url }];

    // 即梦视频: data.videos 数组
    if (Array.isArray(data.videos)) {
      return data.videos
        .map((v) => ({ type: 'video', url: typeof v === 'string' ? v : (v.url || '') }))
        .filter((v) => v.url);
    }

    return [];
  }

  if (modeId === 'image_outpainting' && data.imageUrl) {
    return [{ type: 'image', url: data.imageUrl }];
  }

  // 图片结果: 所有提供商统一 data.images (string[])
  if (Array.isArray(data.images)) {
    return data.images
      .map((img) => ({ type: 'image', url: typeof img === 'string' ? img.trim() : (img.url || '') }))
      .filter((item) => item.url);
  }

  return [];
}
