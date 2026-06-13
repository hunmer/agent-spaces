export default [
  {
    name: 'get_generation_history',
    description: '读取用户生成历史（图片/视频，按时间倒序）。用户问「我之前生成过什么」「最近一张图」「找一张猫的图」时调用。返回的 items[].id 可作为 use_as_source 的 sourceId，items[].url 可作为 sourceUrl。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '按模式过滤。可选值：text_to_image / image_to_image / image_edit / image_to_video / image_outpainting / video_editing / video_retalk',
          enum: ['text_to_image', 'image_to_image', 'image_edit', 'image_to_video', 'image_outpainting', 'video_editing', 'video_retalk'],
        },
        provider: {
          type: 'string',
          description: '按提供商过滤。可选值：minimax / jimeng / aliyun / openai',
          enum: ['minimax', 'jimeng', 'aliyun', 'openai'],
        },
        limit: {
          type: 'number',
          description: '返回条数上限，默认 20，最大 100。',
        },
      },
    },
  },
  {
    name: 'get_capabilities',
    description: '查询项目支持的创作模式与对应提供商。switch_mode / set_form 前应先调用，避免选择不支持的模式×提供商组合。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'switch_mode',
    description: '切换左侧面板的创作模式。切换后前端会自动联动可用提供商并重置默认模型。注意：图生图/图片编辑/图生视频/扩图需要图片输入，视频编辑/数字人需要视频输入，切换到这些模式后必须再用 use_as_source 预填输入源。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '目标模式 id',
          enum: ['text_to_image', 'image_to_image', 'image_edit', 'image_to_video', 'image_outpainting', 'video_editing', 'video_retalk'],
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'set_form',
    description: '设置左侧表单字段（不立即提交）。文生图模式至少要设 prompt；图生图/图片编辑/视频编辑还需先 use_as_source 提供输入源。切换 provider 后前端会自动重置 model，建议先 set_form({ provider }) 再 set_form({ model })。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '正向提示词。文生图/图生图/图片编辑/视频编辑必填。' },
        negativePrompt: { type: 'string', description: '反向提示词，排除不想出现的内容。' },
        provider: {
          type: 'string',
          description: '提供商 id',
          enum: ['minimax', 'jimeng', 'aliyun', 'openai'],
        },
        model: {
          type: 'string',
          description: '模型 id，不同 provider×mode 组合支持不同模型。可用 get_capabilities 查询或交由前端默认值。',
        },
        size: { type: 'string', description: '尺寸。aliyun/openai 使用，如 1024*1024、1024x1024、1536x1024。' },
        ratio: { type: 'string', description: '比例。jimeng 使用，如 1:1、16:9、9:16。' },
        resolution: { type: 'string', description: '分辨率。jimeng 文生图使用 1k/2k/4k；视频使用 720P/1080P。' },
        duration: { type: 'number', description: '视频时长（秒）。视频模式使用，常用 5/6/10。' },
        n: { type: 'number', description: '生成数量，1-10。' },
        quality: {
          type: 'string',
          description: 'OpenAI 质量',
          enum: ['auto', 'low', 'medium', 'high'],
        },
        outputFormat: {
          type: 'string',
          description: 'OpenAI 输出格式',
          enum: ['png', 'jpeg', 'webp'],
        },
        sampleStrength: { type: 'number', description: '采样强度 0-1，jimeng 图生图使用，默认 0.7。' },
        expandMode: {
          type: 'string',
          description: '扩图方式',
          enum: ['ratio', 'scale', 'offset'],
        },
        outputRatio: {
          type: 'string',
          description: '扩图目标比例（expandMode=ratio 时使用）',
          enum: ['1:1', '3:4', '4:3', '9:16', '16:9'],
        },
        xScale: { type: 'number', description: '扩图水平倍率（expandMode=scale）。' },
        yScale: { type: 'number', description: '扩图垂直倍率（expandMode=scale）。' },
      },
    },
  },
  {
    name: 'trigger_generate',
    description: '触发左侧表单提交，前端会走完整任务流程（callPluginTool → 任务队列 → 自动落库 + 多端同步）。无参数。提交后用户可在右侧结果区看到生成进度。生成完成后结果会自动加入历史，可调用 get_generation_history 查询。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'use_as_source',
    description: '把历史结果或远程 URL 作为输入源，自动切换到目标模式并预填到左侧表单。用于「把这张图改成 X」「把这张图变成视频」「用这张图扩图」等二次创作场景。预填完成后通常需要继续 set_form 补充 prompt，再 trigger_generate。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '目标模式（源类型必须匹配：图片→image_to_image/image_edit/image_to_video/image_outpainting；视频→video_editing/video_retalk）',
          enum: ['image_to_image', 'image_edit', 'image_to_video', 'image_outpainting', 'video_editing', 'video_retalk'],
        },
        sourceId: {
          type: 'string',
          description: '历史结果 id（来自 get_generation_history 返回的 items[].id）。优先使用。',
        },
        sourceUrl: {
          type: 'string',
          description: '直接指定公网 URL（http/https）。sourceId 为空时使用。',
        },
        type: {
          type: 'string',
          description: 'sourceUrl 模式下的资源类型',
          enum: ['image', 'video'],
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'delete_result',
    description: '删除单条历史结果。前端走服务端 services，删除后所有客户端同步。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '历史结果 id（来自 get_generation_history 返回的 items[].id）。' },
      },
      required: ['id'],
    },
  },
  {
    name: 'clear_history',
    description: '清空所有历史结果。前端走服务端 services，清空后所有客户端同步。无参数。',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
