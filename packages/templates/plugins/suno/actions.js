// ============================================================
// Suno AI 音乐生成插件 - 统一 Actions
// 文档：https://docs.sunoapi.org  Base: https://api.sunoapi.org/api/v1
// ============================================================

const shared = require('./shared')

const {
  postJson,
  getJson,
  queryRecordInfo,
  buildAuthHeader,
  resolveBaseUrl,
  resolveProxy,
  resolveCallBackUrl,
  resolveDefaultModel,
  maybeWait,
} = shared

const CONFIG_PREFIX = '{{ __config__["workflow.suno"]'

// 公共配置字段（apiKey / baseUrl / proxy），可从插件配置继承
function baseProperties(t) {
  return [
    {
      key: 'apiKey',
      label: t('field.apiKey.label', 'API Key'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.apiKey.tooltip', 'Suno API Key (read from plugin config by default)'),
      default: `${CONFIG_PREFIX}["apiKey"]}}`,
    },
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'API URL'),
      type: 'text',
      dataType: 'string',
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
      tooltip: t('field.baseUrl.tooltip', 'Suno API base URL'),
    },
    {
      key: 'proxy',
      label: t('field.proxy.label', 'HTTP Proxy'),
      type: 'text',
      dataType: 'string',
      tooltip: t('field.proxy.tooltip', 'HTTP proxy address, read from plugin config by default'),
      default: `${CONFIG_PREFIX}["httpProxy"]}}`,
      placeholder: 'http://127.0.0.1:7890',
    },
  ]
}

// 异步任务公共字段（callBackUrl / wait / 轮询参数）
function waitProperties(t) {
  return [
    {
      key: 'callBackUrl',
      label: t('field.callBackUrl.label', 'Callback URL'),
      type: 'text',
      dataType: 'string',
      tooltip: t('field.callBackUrl.tooltip', 'Optional webhook URL; leave empty to use polling'),
      default: `${CONFIG_PREFIX}["callBackUrl"]}}`,
      placeholder: 'https://your-server.com/callback',
    },
    {
      key: 'wait',
      label: t('field.wait.label', 'Wait for completion'),
      type: 'checkbox',
      dataType: 'boolean',
      default: false,
      tooltip: t('field.wait.tooltip', 'If checked, poll until SUCCESS/FAILED; otherwise return taskId immediately'),
    },
    {
      key: 'pollInterval',
      label: t('field.pollInterval.label', 'Poll interval (s)'),
      type: 'number',
      dataType: 'number',
      default: 15,
      tooltip: t('field.pollInterval.tooltip', 'Seconds between status checks (only used when wait is on)'),
    },
    {
      key: 'maxWait',
      label: t('field.maxWait.label', 'Max wait (s)'),
      type: 'number',
      dataType: 'number',
      default: 600,
      tooltip: t('field.maxWait.tooltip', 'Maximum total seconds to wait before giving up'),
    },
  ]
}

// tool 入参里的公共字段描述
function baseToolProps() {
  return {
    apiKey: { type: 'string', description: 'Suno API Key（也可在插件配置中全局设置）' },
    baseUrl: { type: 'string', description: 'API 地址，默认 https://api.sunoapi.org' },
    proxy: { type: 'string', description: 'HTTP 代理地址，如 http://127.0.0.1:7890（也可在插件配置中全局设置）' },
  }
}

module.exports = (t) => [
  // ─── 生成音乐 ─────────────────────────
  {
    name: 'suno_generate',
    label: t('action.generate.label', 'Generate Music'),
    category: t('category', 'Suno'),
    icon: 'Music',
    description: t('action.generate.description', 'Generate songs from a text prompt (Suno /generate)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Prompt'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.prompt.tooltip', 'Music description (V4 max 3000 chars, others max 5000)'),
      },
      {
        key: 'customMode',
        label: t('field.customMode.label', 'Custom Mode'),
        type: 'checkbox',
        dataType: 'boolean',
        default: false,
        tooltip: t('field.customMode.tooltip', 'When on, requires style and title'),
      },
      {
        key: 'style',
        label: t('field.style.label', 'Style'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.style.tooltip', 'Music style/genre, required in custom mode'),
      },
      {
        key: 'title',
        label: t('field.title.label', 'Title'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.title.tooltip', 'Song title, required in custom mode'),
      },
      {
        key: 'instrumental',
        label: t('field.instrumental.label', 'Instrumental'),
        type: 'checkbox',
        dataType: 'boolean',
        default: false,
        tooltip: t('field.instrumental.tooltip', 'Generate instrumental-only music without vocals'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["defaultModel"]}}`,
        options: [
          { label: 'V4（最高音质，4 分钟）', value: 'V4' },
          { label: 'V4_5（进阶，8 分钟）', value: 'V4_5' },
          { label: 'V4_5PLUS（更丰富音色）', value: 'V4_5PLUS' },
          { label: 'V4_5ALL（更强结构）', value: 'V4_5ALL' },
          { label: 'V5（更快更好）', value: 'V5' },
          { label: 'V5_5（自定义音色）', value: 'V5_5' },
        ],
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '音乐描述（V4 最长 3000 字符，其它最长 5000）' },
        customMode: { type: 'boolean', description: '自定义模式，启用后需提供 style 和 title' },
        style: { type: 'string', description: '音乐风格/流派，自定义模式下必填' },
        title: { type: 'string', description: '歌曲标题，自定义模式下必填' },
        instrumental: { type: 'boolean', description: '是否仅生成纯音乐（无人声），默认 false' },
        model: { type: 'string', description: '模型：V4 / V4_5 / V4_5PLUS / V4_5ALL / V5 / V5_5，默认 V4_5' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待生成完成，默认 false（直接返回 taskId）' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['prompt'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const body = {
        prompt: args.prompt,
        customMode: args.customMode === true || args.customMode === 'true',
        instrumental: args.instrumental === true || args.instrumental === 'true',
        model: resolveDefaultModel(args),
      }
      if (args.style) body.style = args.style
      if (args.title) body.title = args.title
      const cb = resolveCallBackUrl(args)
      if (cb) body.callBackUrl = cb

      ctx.logger.info(`Generate music: model=${body.model} customMode=${body.customMode} instrumental=${body.instrumental}`)
      const resp = await postJson(`${baseUrl}/api/v1/generate`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `生成失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Generate submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'generate', args, logger: ctx.logger, t })
    },
  },

  // ─── 生成歌词 ─────────────────────────
  {
    name: 'suno_lyrics',
    label: t('action.lyrics.label', 'Generate Lyrics'),
    category: t('category', 'Suno'),
    icon: 'PenSquare',
    description: t('action.lyrics.description', 'Generate AI lyrics from a prompt (Suno /lyrics)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Prompt'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.lyrics.prompt.tooltip', 'Theme / story description for the lyrics'),
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '歌词主题/故事描述' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待生成完成，默认 false' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['prompt'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const body = { prompt: args.prompt }
      const cb = resolveCallBackUrl(args)
      if (cb) body.callBackUrl = cb

      ctx.logger.info('Generate lyrics')
      const resp = await postJson(`${baseUrl}/api/v1/lyrics`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `生成失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Lyrics submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'lyrics', args, logger: ctx.logger, t })
    },
  },

  // ─── 扩展音乐 ─────────────────────────
  {
    name: 'suno_extend',
    label: t('action.extend.label', 'Extend Music'),
    category: t('category', 'Suno'),
    icon: 'ArrowRightLeft',
    description: t('action.extend.description', 'Extend an existing audio track (Suno /generate/extend)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'audioId',
        label: t('field.audioId.label', 'Audio ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.audioId.tooltip', 'The id of the audio to extend'),
      },
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Prompt'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.extend.prompt.tooltip', 'Description of the extension content'),
      },
      {
        key: 'continueAt',
        label: t('field.continueAt.label', 'Continue At (s)'),
        type: 'number',
        dataType: 'number',
        tooltip: t('field.continueAt.tooltip', 'Seconds offset to continue from (e.g. 120)'),
      },
      {
        key: 'defaultParamFlag',
        label: t('field.defaultParamFlag.label', 'Use default params'),
        type: 'checkbox',
        dataType: 'boolean',
        default: true,
        tooltip: t('field.defaultParamFlag.tooltip', 'Reuse the original track params'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["defaultModel"]}}`,
        options: [
          { label: 'V4', value: 'V4' },
          { label: 'V4_5', value: 'V4_5' },
          { label: 'V4_5PLUS', value: 'V4_5PLUS' },
          { label: 'V4_5ALL', value: 'V4_5ALL' },
          { label: 'V5', value: 'V5' },
          { label: 'V5_5', value: 'V5_5' },
        ],
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        audioId: { type: 'string', description: '要扩展的音频 ID' },
        prompt: { type: 'string', description: '扩展内容描述' },
        continueAt: { type: 'number', description: '从第几秒继续扩展' },
        defaultParamFlag: { type: 'boolean', description: '是否沿用原音频参数，默认 true' },
        model: { type: 'string', description: '模型，默认 V4_5' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待生成完成，默认 false' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['audioId', 'prompt'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const body = {
        audioId: args.audioId,
        prompt: args.prompt,
        model: resolveDefaultModel(args),
        defaultParamFlag: args.defaultParamFlag !== false,
      }
      if (args.continueAt !== undefined && args.continueAt !== '') body.continueAt = Number(args.continueAt)
      const cb = resolveCallBackUrl(args)
      if (cb) body.callBackUrl = cb

      ctx.logger.info(`Extend audioId=${args.audioId} continueAt=${body.continueAt}`)
      const resp = await postJson(`${baseUrl}/api/v1/generate/extend`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `扩展失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Extend submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'generate', args, logger: ctx.logger, t })
    },
  },

  // ─── 上传并翻唱 ─────────────────────────
  {
    name: 'suno_upload_cover',
    label: t('action.uploadCover.label', 'Upload & Cover'),
    category: t('category', 'Suno'),
    icon: 'Upload',
    description: t('action.uploadCover.description', 'Upload audio URL and transform into a new style (Suno /generate/upload-cover)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'uploadUrl',
        label: t('field.uploadUrl.label', 'Upload URL'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.uploadUrl.tooltip', 'Public URL of the original audio file'),
      },
      {
        key: 'customMode',
        label: t('field.customMode.label', 'Custom Mode'),
        type: 'checkbox',
        dataType: 'boolean',
        default: true,
        tooltip: t('field.customMode.tooltip', 'When on, requires style and title'),
      },
      {
        key: 'instrumental',
        label: t('field.instrumental.label', 'Instrumental'),
        type: 'checkbox',
        dataType: 'boolean',
        default: false,
        tooltip: t('field.instrumental.tooltip', 'Instrumental-only (no vocals). When off in custom mode, prompt is required as lyrics'),
      },
      {
        key: 'style',
        label: t('field.style.label', 'Style'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.style.tooltip', 'Target style/genre for the cover'),
      },
      {
        key: 'title',
        label: t('field.title.label', 'Title'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.title.tooltip', 'Title for the cover'),
      },
      {
        key: 'prompt',
        label: t('field.prompt.label', 'Prompt'),
        type: 'textarea',
        dataType: 'string',
        tooltip: t('field.uploadCover.prompt.tooltip', 'Optional transformation description'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["defaultModel"]}}`,
        options: [
          { label: 'V4', value: 'V4' },
          { label: 'V4_5', value: 'V4_5' },
          { label: 'V4_5PLUS', value: 'V4_5PLUS' },
          { label: 'V4_5ALL', value: 'V4_5ALL' },
          { label: 'V5', value: 'V5' },
          { label: 'V5_5', value: 'V5_5' },
        ],
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        uploadUrl: { type: 'string', description: '原始音频的公开 URL' },
        customMode: { type: 'boolean', description: '自定义模式，启用后需提供 style 和 title' },
        instrumental: { type: 'boolean', description: '是否纯音乐（无人声）；自定义模式下为 false 时 prompt 作为歌词必填' },
        style: { type: 'string', description: '目标翻唱风格' },
        title: { type: 'string', description: '翻唱标题' },
        prompt: { type: 'string', description: '变换描述；自定义模式 instrumental=false 时作为歌词' },
        model: { type: 'string', description: '模型，默认 V4_5' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待生成完成，默认 false' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['uploadUrl'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const customMode = args.customMode !== false
      const instrumental = args.instrumental === true || args.instrumental === 'true'

      const body = {
        uploadUrl: args.uploadUrl,
        customMode,
        instrumental,
        model: resolveDefaultModel(args),
        // callBackUrl 是该接口必填字段；未配置时传空串走轮询
        callBackUrl: resolveCallBackUrl(args) || '',
      }
      if (args.style) body.style = args.style
      if (args.title) body.title = args.title
      if (args.prompt) body.prompt = args.prompt

      ctx.logger.info(`Upload & cover: ${args.uploadUrl} customMode=${customMode} instrumental=${instrumental}`)
      const resp = await postJson(`${baseUrl}/api/v1/generate/upload-cover`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `翻唱失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Upload cover submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'generate', args, logger: ctx.logger, t })
    },
  },

  // ─── 人声分离 ─────────────────────────
  {
    name: 'suno_vocal_removal',
    label: t('action.vocalRemoval.label', 'Separate Vocals'),
    category: t('category', 'Suno'),
    icon: 'Scissors',
    description: t('action.vocalRemoval.description', 'Separate vocals from instrumental (Suno /vocal-removal/generate)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'taskId',
        label: t('field.taskId.label', 'Source Task ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.taskId.tooltip', 'The taskId that produced the source audio'),
      },
      {
        key: 'audioId',
        label: t('field.audioId.label', 'Audio ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.audioId.tooltip', 'The id of the audio to separate'),
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '产生源音频的 taskId' },
        audioId: { type: 'string', description: '要分离的音频 ID' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待完成，默认 false（建议开启，分离结果在 response 内）' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['taskId', 'audioId'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const body = { taskId: args.taskId, audioId: args.audioId }
      const cb = resolveCallBackUrl(args)
      if (cb) body.callBackUrl = cb

      ctx.logger.info(`Vocal removal taskId=${args.taskId} audioId=${args.audioId}`)
      const resp = await postJson(`${baseUrl}/api/v1/vocal-removal/generate`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `人声分离失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Vocal removal submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'vocal_removal', args, logger: ctx.logger, t })
    },
  },

  // ─── 生成音乐视频 ─────────────────────────
  {
    name: 'suno_music_video',
    label: t('action.musicVideo.label', 'Create Music Video'),
    category: t('category', 'Suno'),
    icon: 'Video',
    description: t('action.musicVideo.description', 'Generate a visual music video from an audio track (Suno /mv/generate)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'taskId',
        label: t('field.taskId.label', 'Source Task ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.taskId.tooltip', 'The taskId that produced the source audio'),
      },
      {
        key: 'audioId',
        label: t('field.audioId.label', 'Audio ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.audioId.tooltip', 'The id of the audio to visualize'),
      },
      {
        key: 'author',
        label: t('field.author.label', 'Author'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.author.tooltip', 'Artist name shown in the video'),
      },
      {
        key: 'domainName',
        label: t('field.domainName.label', 'Domain Name'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.domainName.tooltip', 'Your brand domain, e.g. your-brand.com'),
      },
      ...waitProperties(t),
    ],
    toolProperties: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: '产生源音频的 taskId' },
        audioId: { type: 'string', description: '要可视化的音频 ID' },
        author: { type: 'string', description: '视频里显示的作者名' },
        domainName: { type: 'string', description: '品牌域名，如 your-brand.com' },
        callBackUrl: { type: 'string', description: '回调地址，留空则使用轮询' },
        wait: { type: 'boolean', description: '是否等待完成，默认 false' },
        pollInterval: { type: 'number', description: '轮询间隔秒数，默认 15' },
        maxWait: { type: 'number', description: '最长等待秒数，默认 600' },
        ...baseToolProps(),
      },
      required: ['taskId', 'audioId'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'taskId', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const body = { taskId: args.taskId, audioId: args.audioId }
      if (args.author) body.author = args.author
      if (args.domainName) body.domainName = args.domainName
      const cb = resolveCallBackUrl(args)
      if (cb) body.callBackUrl = cb

      ctx.logger.info(`Music video taskId=${args.taskId} audioId=${args.audioId}`)
      const resp = await postJson(`${baseUrl}/api/v1/mv/generate`, { headers, body, proxy, timeout: 60000 })
      if (resp.code !== 200) {
        return { success: false, message: `MV 生成失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const taskId = resp.data?.taskId
      ctx.logger.info(`Music video submitted taskId=${taskId}`)
      return maybeWait({ baseUrl, apiKey: args.apiKey, proxy, taskId, type: 'music_video', args, logger: ctx.logger, t })
    },
  },

  // ─── 查询任务状态 ─────────────────────────
  {
    name: 'suno_record_info',
    label: t('action.recordInfo.label', 'Query Task Status'),
    category: t('category', 'Suno'),
    icon: 'Search',
    description: t('action.recordInfo.description', 'Query a Suno task by taskId (Suno /generate/record-info)'),
    properties: [
      ...baseProperties(t),
      {
        key: 'type',
        label: t('field.recordType.label', 'Task Type'),
        type: 'select',
        dataType: 'string',
        default: 'generate',
        required: true,
        tooltip: t('field.recordType.tooltip', 'Which record-info endpoint to query'),
        options: [
          { label: t('field.recordType.generate', 'Music / Extend'), value: 'generate' },
          { label: t('field.recordType.lyrics', 'Lyrics'), value: 'lyrics' },
          { label: t('field.recordType.vocalRemoval', 'Vocal Removal'), value: 'vocal_removal' },
          { label: t('field.recordType.musicVideo', 'Music Video'), value: 'music_video' },
          { label: t('field.recordType.cover', 'Cover'), value: 'cover' },
        ],
      },
      {
        key: 'taskId',
        label: t('field.taskId.label', 'Task ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.query.taskId.tooltip', 'The taskId returned by the corresponding generate action'),
      },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '任务类型：generate(音乐/扩展) / lyrics(歌词) / vocal_removal(人声分离) / music_video(MV) / cover(封面)，决定查询接口' },
        taskId: { type: 'string', description: '任务 ID' },
        ...baseToolProps(),
      },
      required: ['taskId', 'type'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'status', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const type = args.type || 'generate'

      ctx.logger.info(`Query task taskId=${args.taskId} type=${type}`)
      const resp = await queryRecordInfo(baseUrl, args.apiKey, args.taskId, proxy, type)
      if (resp.code !== 200) {
        return { success: false, message: `查询失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      const data = resp.data || {}
      const status = data.status || data.successFlag
      return {
        success: true,
        status,
        message: t('message.taskStatus', 'Task status: {status}').replace('{status}', status || 'UNKNOWN'),
        data,
      }
    },
  },

  // ─── 查询剩余额度 ─────────────────────────
  {
    name: 'suno_credits',
    label: t('action.credits.label', 'Query Credits'),
    category: t('category', 'Suno'),
    icon: 'Coins',
    description: t('action.credits.description', 'Query remaining Suno credits (Suno /generate/credit)'),
    properties: [...baseProperties(t)],
    toolProperties: {
      type: 'object',
      properties: {
        ...baseToolProps(),
      },
      required: [],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'credits', type: 'number', dataType: 'number' },
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      ctx.logger.info('Query credits')
      const resp = await getJson(`${baseUrl}/api/v1/generate/credit`, { headers, proxy, timeout: 30000 })
      if (resp.code !== 200) {
        return { success: false, message: `查询失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}` }
      }
      // /generate/credit 返回 data 为整数
      const credits = typeof resp.data === 'number'
        ? resp.data
        : resp.data?.credits ?? resp.data?.totalCreditsLeft ?? null
      return {
        success: true,
        credits,
        message: t('message.credits', 'Remaining credits: {credits}').replace('{credits}', credits ?? 'N/A'),
        data: resp.data,
      }
    },
  },
]
