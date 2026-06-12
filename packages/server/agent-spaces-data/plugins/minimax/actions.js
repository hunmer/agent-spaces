const MINIMAX_BASE_URL = 'https://api.minimaxi.com'

function getBaseUrl(args) {
  return args.baseUrl || MINIMAX_BASE_URL
}

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('Missing MiniMax API Key')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

const HER_MESSAGE_NAMES = {
  system: 'AI',
  user_system: 'User',
  group: 'Scene',
  sample_message_user: 'Sample User',
  sample_message_ai: 'Sample AI',
  user: 'User',
  assistant: 'AI',
}

const HER_MESSAGE_ROLES = new Set(Object.keys(HER_MESSAGE_NAMES))

function cleanHerMessages(raw, defaultRole = 'user') {
  const items = Array.isArray(raw)
    ? raw
    : (raw != null ? [{ role: defaultRole, content: raw }] : [])

  return items
    .filter(m => m != null)
    .map(m => {
      const role = HER_MESSAGE_ROLES.has(m.role) ? m.role : defaultRole
      const content = typeof m.content === 'string' ? m.content : String(m.content ?? '')
      const message = { role, content }
      if (m.name) message.name = String(m.name)
      else if (HER_MESSAGE_NAMES[role]) message.name = HER_MESSAGE_NAMES[role]
      return message
    })
    .filter(m => m.content.trim())
}

module.exports = (t) => {
  // --- TTS ---
  const TTS_MODELS = [
    { label: t('option.tts.speech28hd', 'speech-2.8-hd (Recommended)'), value: 'speech-2.8-hd' },
    { label: 'speech-2.8-turbo', value: 'speech-2.8-turbo' },
    { label: 'speech-2.6-hd', value: 'speech-2.6-hd' },
    { label: 'speech-2.6-turbo', value: 'speech-2.6-turbo' },
    { label: 'speech-02-hd', value: 'speech-02-hd' },
    { label: 'speech-02-turbo', value: 'speech-02-turbo' },
  ]

  const AUDIO_FORMATS = [
    { label: t('option.audio.mp3.default', 'mp3 (default)'), value: 'mp3' },
    { label: 'wav', value: 'wav' },
    { label: 'flac', value: 'flac' },
    { label: 'pcm', value: 'pcm' },
  ]

  const EMOTIONS = [
    { label: t('field.emotion.auto.label', 'Auto'), value: '' },
    { label: t('field.emotion.happy.label', 'Happy'), value: 'happy' },
    { label: t('field.emotion.sad.label', 'Sad'), value: 'sad' },
    { label: t('field.emotion.angry.label', 'Angry'), value: 'angry' },
    { label: t('field.emotion.fearful.label', 'Fearful'), value: 'fearful' },
    { label: t('field.emotion.disgusted.label', 'Disgusted'), value: 'disgusted' },
    { label: t('field.emotion.surprised.label', 'Surprised'), value: 'surprised' },
    { label: t('field.emotion.calm.label', 'Neutral'), value: 'calm' },
    { label: t('field.emotion.fluent.label', 'Vivid'), value: 'fluent' },
    { label: t('field.emotion.whisper.label', 'Whisper'), value: 'whisper' },
  ]

  // --- Video models ---
  const T2V_MODELS = [
    { label: t('option.t2v.hailuo23', 'MiniMax-Hailuo-2.3 (Recommended)'), value: 'MiniMax-Hailuo-2.3' },
    { label: 'MiniMax-Hailuo-02', value: 'MiniMax-Hailuo-02' },
    { label: 'T2V-01-Director', value: 'T2V-01-Director' },
    { label: 'T2V-01', value: 'T2V-01' },
  ]

  const I2V_MODELS = [
    { label: t('option.i2v.hailuo23', 'MiniMax-Hailuo-2.3 (Recommended)'), value: 'MiniMax-Hailuo-2.3' },
    { label: 'MiniMax-Hailuo-2.3-Fast', value: 'MiniMax-Hailuo-2.3-Fast' },
    { label: 'MiniMax-Hailuo-02', value: 'MiniMax-Hailuo-02' },
    { label: 'I2V-01-Director', value: 'I2V-01-Director' },
    { label: 'I2V-01-live', value: 'I2V-01-live' },
    { label: 'I2V-01', value: 'I2V-01' },
  ]

  const VIDEO_RESOLUTIONS = [
    { label: '720P', value: '720P' },
    { label: t('option.resolution.768p.default', '768P (default)'), value: '768P' },
    { label: '1080P', value: '1080P' },
  ]

  const VIDEO_DURATIONS = [
    { label: t('option.duration.6s', '6s (default)'), value: 6 },
    { label: t('option.duration.10s', '10s'), value: 10 },
  ]

  // --- Chat models ---
  const CHAT_MODELS = [
    { label: t('option.chat.m27', 'MiniMax-M2.7 (Recommended)'), value: 'MiniMax-M2.7' },
    { label: t('option.chat.m27hs', 'MiniMax-M2.7-highspeed (Fast)'), value: 'MiniMax-M2.7-highspeed' },
    { label: 'MiniMax-M2.5', value: 'MiniMax-M2.5' },
    { label: t('option.chat.m25hs', 'MiniMax-M2.5-highspeed (Fast)'), value: 'MiniMax-M2.5-highspeed' },
    { label: 'MiniMax-M2.1', value: 'MiniMax-M2.1' },
    { label: t('option.chat.m21hs', 'MiniMax-M2.1-highspeed (Fast)'), value: 'MiniMax-M2.1-highspeed' },
    { label: 'MiniMax-M2', value: 'MiniMax-M2' },
  ]

  // --- Music models ---
  const MUSIC_MODELS = [
    { label: t('option.music.music26', 'music-2.6 (Recommended)'), value: 'music-2.6' },
    { label: t('option.music.cover', 'music-cover (Cover)'), value: 'music-cover' },
    { label: t('option.music.free', 'music-2.6-free (Free)'), value: 'music-2.6-free' },
    { label: t('option.music.freeCover', 'music-cover-free (Free Cover)'), value: 'music-cover-free' },
  ]

  const MUSIC_FORMATS = [
    { label: t('option.musicFormat.url', 'url (get download link)'), value: 'url' },
    { label: t('option.musicFormat.hex', 'hex (default)'), value: 'hex' },
  ]

  return [
  // ============================
  // 文本合成（Chat Completion）
  // ============================
  {
    name: 'minimax_chat',
    label: t('action.chat.label', 'Text Completion'),
    category: t('category', 'MiniMax AI'),
    icon: 'MessageSquare',
    description: t('action.chat.description', 'MiniMax text completion: multi-turn chat, function calling, image understanding, chain-of-thought reasoning'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'model', type: 'string', description: '模型: MiniMax-M2.7(默认)/MiniMax-M2.7-highspeed/MiniMax-M2.5/MiniMax-M2.5-highspeed/MiniMax-M2.1/MiniMax-M2.1-highspeed/MiniMax-M2' },
      { key: 'systemPrompt', type: 'string', description: '系统提示词，定义 AI 的角色和行为约束' },
      { key: 'messages', type: 'string', description: 'JSON 数组格式的消息列表，如 [{"role":"user","content":"你好"}]。role: system/user/assistant/tool；content 支持文本和图片(image_url)', required: true },
      { key: 'temperature', type: 'number', description: '温度 0-1，控制随机性，默认 0.7' },
      { key: 'topP', type: 'number', description: 'Top P 0-1，核采样参数，默认 0.95' },
      { key: 'maxCompletionTokens', type: 'number', description: '最大输出 token 数' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'MiniMax-M2.7', options: CHAT_MODELS },
      { key: 'systemPrompt', label: t('field.systemPrompt.label', 'System Prompt'), type: 'textarea', tooltip: t('field.systemPrompt.tooltip', 'System behavior instructions, defining the AI role and constraints') },
      { key: 'messages', label: t('field.messages.label', 'Messages'), type: 'array', required: true, tooltip: t('field.messages.tooltip', 'Conversation message list'), fields: [
        { key: 'role', label: t('field.role.label', 'Role'), type: 'select', options: [
          { label: t('field.role.user.label', 'User'), value: 'user' },
          { label: t('field.role.assistant.label', 'Assistant'), value: 'assistant' },
          { label: t('field.role.system.label', 'System'), value: 'system' },
          { label: t('field.role.developer.label', 'Developer'), value: 'developer' },
        ], default: 'user' },
        { key: 'content', label: t('field.content.label', 'Content'), type: 'text', placeholder: t('field.content.placeholder', 'Message content') },
      ] },
      { key: 'temperature', label: t('field.temperature.label', 'Temperature'), type: 'number', default: 0.7, tooltip: t('field.temperature.chat.tooltip', '0-1, controls randomness. Higher is more random. Recommended: 0.7-1.0') },
      { key: 'topP', label: t('field.topP.label', 'Top P'), type: 'number', default: 0.95, tooltip: t('field.topP.tooltip', '0-1, nucleus sampling parameter') },
      { key: 'maxCompletionTokens', label: t('field.maxCompletionTokens.label', 'Max Output Tokens'), type: 'number', tooltip: t('field.maxCompletionTokens.chat.tooltip', 'Maximum number of tokens to generate') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'content', type: 'string' },
        { key: 'reasoningContent', type: 'string' },
        { key: 'toolCalls', type: 'string' },
        { key: 'totalTokens', type: 'number' },
        { key: 'id', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      let messages
      try {
        messages = typeof args.messages === 'string' ? JSON.parse(args.messages) : args.messages
      } catch {
        messages = [{ role: 'user', content: args.messages }]
      }

      // workflow array mode: clean up frontend id, fill role defaults
      if (Array.isArray(messages) && messages.length > 0 && typeof messages[0] === 'object' && messages[0].content !== undefined) {
        messages = messages.map(m => ({ role: m.role || 'user', content: m.content ?? '' }))
      }

      if (args.systemPrompt) {
        messages = [{ role: 'system', content: args.systemPrompt }, ...messages]
      }

      const body = {
        model: args.model || 'MiniMax-M2.7',
        messages,
        ...(args.temperature != null && { temperature: Number(args.temperature) }),
        ...(args.topP != null && { top_p: Number(args.topP) }),
        ...(args.maxCompletionTokens && { max_completion_tokens: Number(args.maxCompletionTokens) }),
      }

      ctx.logger.info(`文本合成: 模型=${body.model}, 消息数=${messages.length}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/text/chatcompletion_v2`, { headers, body, timeout: 120000 })

      const choice = result.choices?.[0]
      if (!choice) {
        const errMsg = result.error?.message || result.base_resp?.status_msg || JSON.stringify(result).slice(0, 200)
        return { success: false, message: t('message.chatFailed', 'Text completion failed: {error}').replace('{error}', errMsg) }
      }

      ctx.logger.info(`文本合成完成: tokens=${result.usage?.total_tokens}, id=${result.id}`)
      return {
        success: true,
        message: t('message.chatComplete', 'Text completion finished'),
        data: {
          content: choice.message?.content || '',
          reasoningContent: choice.message?.reasoning_content || '',
          toolCalls: choice.message?.tool_calls || null,
          totalTokens: result.usage?.total_tokens,
          id: result.id,
        },
      }
    },
  },

  // ============================
  // 角色对话（M2-her）
  // ============================
  {
    name: 'minimax_chat_her',
    label: t('action.chatHer.label', 'Roleplay Chat'),
    category: t('category', 'MiniMax AI'),
    icon: 'User',
    description: t('action.chatHer.description', 'MiniMax roleplay chat (M2-her): supports character roleplay, multi-turn conversation, customizable persona and worldview'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'systemPrompt', type: 'string', description: '角色人设：定义 AI 的性格、背景、说话风格' },
      { key: 'userSystem', type: 'string', description: '用户角色设定（user_system role）' },
      { key: 'group', type: 'string', description: '世界观/场景设定（group role）' },
      { key: 'sampleMessages', type: 'string', description: 'JSON 数组格式的示例对话，使用 sample_message_user / sample_message_ai 角色' },
      { key: 'messages', type: 'string', description: 'JSON 数组格式的 user/assistant 消息列表', required: true },
      { key: 'temperature', type: 'number', description: '温度 0-1，默认 1.0' },
      { key: 'topP', type: 'number', description: 'Top P 0-1，默认 0.95' },
      { key: 'maxCompletionTokens', type: 'number', description: '最大输出 token（上限 2048）' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'systemPrompt', label: t('field.herSystemPrompt.label', 'Character Persona'), type: 'textarea', tooltip: t('field.herSystemPrompt.tooltip', 'Character system settings, defining AI personality, background, and speaking style') },
      { key: 'userSystem', label: t('field.userSystem.label', 'User Settings'), type: 'textarea', tooltip: t('field.userSystem.tooltip', 'User role system settings (user_system role)') },
      { key: 'group', label: t('field.group.label', 'Group Settings'), type: 'textarea', tooltip: t('field.group.tooltip', 'Worldview/scene settings (group role)') },
      { key: 'sampleMessages', label: t('field.sampleMessages.label', 'Sample Dialogue'), type: 'array', tooltip: t('field.sampleMessages.tooltip', 'Provide dialogue examples using sample_message_user / sample_message_ai roles'), fields: [
        { key: 'role', label: t('field.role.label', 'Role'), type: 'select', options: [
          { label: t('field.role.sampleUser.label', 'Sample User'), value: 'sample_message_user' },
          { label: t('field.role.sampleAi.label', 'Sample AI'), value: 'sample_message_ai' },
        ], default: 'sample_message_user' },
        { key: 'content', label: t('field.content.label', 'Content'), type: 'text', placeholder: t('field.sampleContent.placeholder', 'Sample message content') },
      ] },
      { key: 'messages', label: t('field.messages.label', 'Messages'), type: 'array', required: true, tooltip: t('field.messages.tooltip', 'Conversation message list'), fields: [
        { key: 'role', label: t('field.role.label', 'Role'), type: 'select', options: [
          { label: t('field.role.user.label', 'User'), value: 'user' },
          { label: t('field.role.assistant.label', 'Assistant'), value: 'assistant' },
          { label: t('field.role.system.label', 'System'), value: 'system' },
        ], default: 'user' },
        { key: 'content', label: t('field.content.label', 'Content'), type: 'text', placeholder: t('field.content.placeholder', 'Message content') },
      ] },
      { key: 'temperature', label: t('field.temperature.label', 'Temperature'), type: 'number', default: 1.0, tooltip: t('field.temperature.her.tooltip', '0-1, controls randomness. Default: 1.0') },
      { key: 'topP', label: t('field.topP.label', 'Top P'), type: 'number', default: 0.95, tooltip: t('field.topP.tooltip', '0-1, nucleus sampling parameter') },
      { key: 'maxCompletionTokens', label: t('field.maxCompletionTokens.label', 'Max Output Tokens'), type: 'number', tooltip: t('field.maxCompletionTokens.her.tooltip', 'Maximum 2048') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'content', type: 'string' },
        { key: 'totalTokens', type: 'number' },
        { key: 'id', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      let messages = []
      try {
        messages = typeof args.messages === 'string' ? JSON.parse(args.messages) : (args.messages || [])
      } catch {
        messages = [{ role: 'user', content: args.messages }]
      }
      messages = cleanHerMessages(messages)

      const builtMessages = []
      if (args.systemPrompt) builtMessages.push(...cleanHerMessages([{ role: 'system', content: args.systemPrompt }]))
      if (args.userSystem) builtMessages.push(...cleanHerMessages([{ role: 'user_system', content: args.userSystem }]))
      if (args.group) builtMessages.push(...cleanHerMessages([{ role: 'group', content: args.group }]))

      // sample messages from workflow (array) or tool (string JSON)
      if (args.sampleMessages) {
        try {
          const samples = typeof args.sampleMessages === 'string'
            ? JSON.parse(args.sampleMessages)
            : args.sampleMessages
          if (Array.isArray(samples) && samples.length > 0) {
            builtMessages.push(...cleanHerMessages(samples, 'sample_message_user'))
          }
        } catch { /* skip invalid samples */ }
      }

      builtMessages.push(...messages)

      const body = {
        model: 'M2-her',
        messages: builtMessages,
        ...(args.temperature != null && { temperature: Number(args.temperature) }),
        ...(args.topP != null && { top_p: Number(args.topP) }),
        ...(args.maxCompletionTokens && { max_completion_tokens: Number(args.maxCompletionTokens) }),
      }

      ctx.logger.info(`角色对话: 消息数=${builtMessages.length}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/chat/completions`, { headers, body, timeout: 120000 })

      const choice = result.choices?.[0]
      if (!choice) {
        const errMsg = result.error?.message || result.base_resp?.status_msg || JSON.stringify(result).slice(0, 200)
        return { success: false, message: t('message.herFailed', 'Roleplay chat failed: {error}').replace('{error}', errMsg) }
      }

      ctx.logger.info(`角色对话完成: tokens=${result.usage?.total_tokens}, id=${result.id}`)
      return {
        success: true,
        message: t('message.herComplete', 'Roleplay chat finished'),
        data: {
          content: choice.message?.content || '',
          totalTokens: result.usage?.total_tokens,
          id: result.id,
        },
      }
    },
  },

  // ============================
  // 语音合成（同步 TTS）
  // ============================
  {
    name: 'minimax_tts',
    label: t('action.tts.label', 'Text to Speech'),
    category: t('category', 'MiniMax AI'),
    icon: 'AudioLines',
    description: t('action.tts.description', 'MiniMax text-to-speech (sync TTS), multiple voices, emotions, and speed control'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'text', type: 'string', description: '待合成语音的文本（<10000字符）', required: true },
      { key: 'model', type: 'string', description: 'TTS模型，默认 speech-2.8-hd，可选 speech-2.8-turbo/speech-2.6-hd/speech-2.6-turbo/speech-02-hd/speech-02-turbo' },
      { key: 'voiceId', type: 'string', description: '音色ID，默认 Chinese (Mandarin)_Lyrical_Voice' },
      { key: 'speed', type: 'number', description: '语速 0.5-2.0，默认 1.0' },
      { key: 'vol', type: 'number', description: '音量 0-10，默认 1.0' },
      { key: 'pitch', type: 'number', description: '语调 -12到12，默认 0' },
      { key: 'emotion', type: 'string', description: '情绪: happy/sad/angry/fearful/disgusted/surprised/calm/fluent/whisper' },
      { key: 'audioFormat', type: 'string', description: '音频格式: mp3(默认)/wav/flac/pcm' },
      { key: 'outputFormat', type: 'string', description: '输出格式: url(默认)/hex' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'MiniMax API Key'), default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'text', label: t('field.text.label', 'Text Content'), type: 'textarea', required: true, tooltip: t('field.text.tooltip', 'Text to synthesize (<10000 characters)') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'speech-2.8-hd', options: TTS_MODELS },
      { key: 'voiceId', label: t('field.voiceId.label', 'Voice ID'), type: 'text', default: 'Chinese (Mandarin)_Lyrical_Voice', tooltip: t('field.voiceId.tooltip', 'System voice ID, e.g. male-qn-qingse, English_Graceful_Lady') },
      { key: 'speed', label: t('field.speed.label', 'Speed'), type: 'number', default: 1, tooltip: t('field.speed.tooltip', '0.5-2.0, default 1.0') },
      { key: 'vol', label: t('field.vol.label', 'Volume'), type: 'number', default: 1, tooltip: t('field.vol.tooltip', '0-10, default 1.0') },
      { key: 'pitch', label: t('field.pitch.label', 'Pitch'), type: 'number', default: 0, tooltip: t('field.pitch.tooltip', '-12 to 12, default 0') },
      { key: 'emotion', label: t('field.emotion.label', 'Emotion'), type: 'select', default: '', options: EMOTIONS },
      { key: 'audioFormat', label: t('field.audioFormat.label', 'Audio Format'), type: 'select', default: 'mp3', options: AUDIO_FORMATS },
      { key: 'sampleRate', label: t('field.sampleRate.label', 'Sample Rate'), type: 'select', default: 32000, options: [
        { label: '8000', value: 8000 }, { label: '16000', value: 16000 },
        { label: '22050', value: 22050 }, { label: '24000', value: 24000 },
        { label: t('option.sampleRate.32k', '32000 (default)'), value: 32000 }, { label: '44100', value: 44100 },
      ] },
      { key: 'outputFormat', label: t('field.outputFormat.label', 'Output Format'), type: 'select', default: 'url', options: [
        { label: t('field.urlRecommended.label', 'URL (recommended)'), value: 'url' },
        { label: t('field.hex.label', 'HEX'), value: 'hex' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'audioUrl', type: 'audio' },
        { key: 'audioHex', type: 'string' },
        { key: 'audioLength', type: 'number' },
        { key: 'audioFormat', type: 'string' },
        { key: 'traceId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const voiceSetting = {
        voice_id: args.voiceId || 'Chinese (Mandarin)_Lyrical_Voice',
        speed: args.speed ?? 1,
        vol: args.vol ?? 1,
        pitch: args.pitch ?? 0,
      }
      if (args.emotion) voiceSetting.emotion = args.emotion

      const body = {
        model: args.model || 'speech-2.8-hd',
        text: args.text,
        stream: false,
        voice_setting: voiceSetting,
        audio_setting: {
          sample_rate: args.sampleRate || 32000,
          bitrate: 128000,
          format: args.audioFormat || 'mp3',
          channel: 1,
        },
        output_format: args.outputFormat || 'url',
      }

      ctx.logger.info(`语音合成: 模型=${body.model}, 音色=${voiceSetting.voice_id}, 文本长度=${args.text.length}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/t2a_v2`, { headers, body, timeout: 120000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.ttsFailed', 'Text-to-speech failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      const audioUrl = args.outputFormat === 'url' ? result.data?.audio : undefined
      const audioHex = args.outputFormat !== 'url' ? result.data?.audio : undefined

      ctx.logger.info(`语音合成完成: 时长=${result.extra_info?.audio_length}ms, 格式=${result.extra_info?.audio_format}`)
      return {
        success: true,
        message: t('message.ttsComplete', 'Text-to-speech completed'),
        data: {
          audioUrl,
          audioHex,
          audioLength: result.extra_info?.audio_length,
          audioFormat: result.extra_info?.audio_format,
          traceId: result.trace_id,
        },
      }
    },
  },

  // ============================
  // 音乐生成
  // ============================
  {
    name: 'minimax_music_generation',
    label: t('action.musicGeneration.label', 'Music Generation'),
    category: t('category', 'MiniMax AI'),
    icon: 'Music',
    description: t('action.musicGeneration.description', 'MiniMax music generation: generate songs from descriptions and lyrics, cover mode supported'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'prompt', type: 'string', description: '音乐风格描述，如"流行音乐, 难过, 适合在下雨的晚上"', required: true },
      { key: 'lyrics', type: 'string', description: '歌词，用 \\n 分隔，支持 [Verse] [Chorus] 等结构标签' },
      { key: 'model', type: 'string', description: '模型: music-2.6(默认)/music-cover/music-2.6-free/music-cover-free' },
      { key: 'isInstrumental', type: 'boolean', description: '是否纯音乐（无人声），默认 false' },
      { key: 'lyricsOptimizer', type: 'boolean', description: '是否根据描述自动生成歌词，默认 false' },
      { key: 'audioUrl', type: 'string', description: '翻唱模式专用：参考音频URL' },
      { key: 'outputFormat', type: 'string', description: '输出格式: url(默认)/hex' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'prompt', label: t('field.prompt.music.label', 'Music Description'), type: 'textarea', required: true, tooltip: t('field.prompt.music.tooltip', 'Describe style, mood, scene, e.g. "pop music, sad, for a rainy night"') },
      { key: 'lyrics', label: t('field.lyrics.label', 'Lyrics'), type: 'textarea', tooltip: t('field.lyrics.music.tooltip', 'Separate lines with \\n, supports structure tags like [Verse] [Chorus]') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'music-2.6', options: MUSIC_MODELS },
      { key: 'isInstrumental', label: t('field.isInstrumental.label', 'Instrumental'), type: 'select', default: 'false', options: [
        { label: t('field.no.label', 'No'), value: 'false' }, { label: t('field.yes.label', 'Yes'), value: 'true' },
      ] },
      { key: 'lyricsOptimizer', label: t('field.lyricsOptimizer.label', 'Auto-generate Lyrics'), type: 'select', default: 'false', options: [
        { label: t('field.no.label', 'No'), value: 'false' }, { label: t('field.yesAutoGenerate.label', 'Yes (auto-generate from description)'), value: 'true' },
      ] },
      { key: 'audioUrl', label: t('field.audioUrl.label', 'Reference Audio URL'), type: 'text', tooltip: t('field.audioUrl.tooltip', 'Cover mode only: reference audio URL (6s-6min, max 50MB)') },
      { key: 'outputFormat', label: t('field.outputFormat.label', 'Output Format'), type: 'select', default: 'url', options: MUSIC_FORMATS },
      { key: 'audioFormat', label: t('field.audioFormat.label', 'Audio Format'), type: 'select', default: 'mp3', options: [
        { label: t('option.audio.mp3.default', 'mp3 (default)'), value: 'mp3' }, { label: 'wav', value: 'wav' }, { label: 'pcm', value: 'pcm' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'audioUrl', type: 'audio' },
        { key: 'audioHex', type: 'string' },
        { key: 'duration', type: 'number' },
        { key: 'sampleRate', type: 'number' },
        { key: 'traceId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        model: args.model || 'music-2.6',
        prompt: args.prompt,
        stream: false,
        output_format: args.outputFormat || 'url',
        ...(args.lyrics && { lyrics: args.lyrics }),
        ...(args.isInstrumental === 'true' && { is_instrumental: true }),
        ...(args.lyricsOptimizer === 'true' && { lyrics_optimizer: true }),
        ...(args.audioUrl && { audio_url: args.audioUrl }),
        ...(args.audioFormat && {
          audio_setting: {
            sample_rate: 44100,
            bitrate: 256000,
            format: args.audioFormat,
          },
        }),
      }

      ctx.logger.info(`音乐生成: 模型=${body.model}, 描述=${args.prompt.substring(0, 50)}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/music_generation`, { headers, body, timeout: 600000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.musicFailed', 'Music generation failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`音乐生成完成: 时长=${result.extra_info?.music_duration}ms`)
      const audioUrl = args.outputFormat === 'url' ? result.data?.audio : undefined
      const audioHex = args.outputFormat !== 'url' ? result.data?.audio : undefined
      return {
        success: true,
        message: t('message.musicComplete', 'Music generation completed'),
        data: {
          audioUrl,
          audioHex,
          duration: result.extra_info?.music_duration,
          sampleRate: result.extra_info?.music_sample_rate,
          traceId: result.trace_id,
        },
      }
    },
  },

  // ============================
  // 歌词生成
  // ============================
  {
    name: 'minimax_lyrics_generation',
    label: t('action.lyricsGeneration.label', 'Lyrics Generation'),
    category: t('category', 'MiniMax AI'),
    icon: 'FileText',
    description: t('action.lyricsGeneration.description', 'MiniMax lyrics generation: full song creation and lyrics editing/continuation'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'prompt', type: 'string', description: '歌曲主题/风格描述', required: true },
      { key: 'mode', type: 'string', description: '模式: write_full_song(默认)/edit' },
      { key: 'lyrics', type: 'string', description: '编辑模式下的现有歌词' },
      { key: 'title', type: 'string', description: '指定歌曲标题' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'prompt', label: t('field.prompt.lyrics.label', 'Description'), type: 'textarea', required: true, tooltip: t('field.prompt.lyrics.tooltip', 'Song theme/style description, e.g. "a breezy love song about a summer beach"') },
      { key: 'mode', label: t('field.mode.label', 'Mode'), type: 'select', default: 'write_full_song', options: [
        { label: t('field.mode.writeFullSong.label', 'Write Full Song'), value: 'write_full_song' },
        { label: t('field.mode.edit.label', 'Edit/Continue'), value: 'edit' },
      ] },
      { key: 'lyrics', label: t('field.lyricsEdit.label', 'Existing Lyrics'), type: 'textarea', tooltip: t('field.lyricsEdit.tooltip', 'Provide existing lyrics for continuation/editing in edit mode') },
      { key: 'title', label: t('field.title.label', 'Song Title'), type: 'text', tooltip: t('field.title.tooltip', 'The output will keep this title unchanged') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'songTitle', type: 'string' },
        { key: 'styleTags', type: 'string' },
        { key: 'lyrics', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        mode: args.mode || 'write_full_song',
        prompt: args.prompt,
        ...(args.lyrics && { lyrics: args.lyrics }),
        ...(args.title && { title: args.title }),
      }

      ctx.logger.info(`歌词生成: 模式=${body.mode}, 描述=${args.prompt.substring(0, 50)}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/lyrics_generation`, { headers, body, timeout: 120000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.lyricsFailed', 'Lyrics generation failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`歌词生成完成: 标题=${result.song_title}, 风格=${result.style_tags}`)
      return {
        success: true,
        message: t('message.lyricsComplete', 'Lyrics generation completed'),
        data: {
          songTitle: result.song_title,
          styleTags: result.style_tags,
          lyrics: result.lyrics,
        },
      }
    },
  },

  // ============================
  // 文生视频
  // ============================
  {
    name: 'minimax_text_to_video',
    label: t('action.textToVideo.label', 'Text to Video'),
    category: t('category', 'MiniMax AI'),
    icon: 'Video',
    description: t('action.textToVideo.description', 'MiniMax text-to-video: generate video from text descriptions with camera control'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'prompt', type: 'string', description: '视频描述（最大2000字符），支持 [左移][推进][固定] 等运镜指令', required: true },
      { key: 'model', type: 'string', description: '模型: MiniMax-Hailuo-2.3(默认)/MiniMax-Hailuo-02/T2V-01-Director/T2V-01' },
      { key: 'duration', type: 'number', description: '时长(秒): 6(默认) 或 10' },
      { key: 'resolution', type: 'string', description: '分辨率: 720P/768P(默认)/1080P' },
      { key: 'promptOptimizer', type: 'boolean', description: '是否自动优化提示词，默认 true' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'prompt', label: t('field.prompt.t2v.label', 'Video Description'), type: 'textarea', required: true, tooltip: t('field.prompt.t2v.tooltip', 'Video text description (max 2000 chars), supports camera commands like [Pan Left] [Push In] [Fixed]') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'MiniMax-Hailuo-2.3', options: T2V_MODELS },
      { key: 'duration', label: t('field.duration.label', 'Duration (sec)'), type: 'select', default: 6, options: VIDEO_DURATIONS },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '768P', options: VIDEO_RESOLUTIONS },
      { key: 'promptOptimizer', label: t('field.promptOptimizer.label', 'Auto-optimize Prompt'), type: 'select', default: 'true', options: [
        { label: t('field.yesDefault.label', 'Yes (default)'), value: 'true' }, { label: t('field.no.label', 'No'), value: 'false' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'taskId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        model: args.model || 'MiniMax-Hailuo-2.3',
        prompt: args.prompt,
        duration: args.duration || 6,
        resolution: args.resolution || '768P',
        prompt_optimizer: args.promptOptimizer !== 'false',
      }

      ctx.logger.info(`文生视频: 模型=${body.model}, 时长=${body.duration}s, 分辨率=${body.resolution}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.t2vFailed', 'Text-to-video failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`文生视频任务已创建: taskId=${result.task_id}`)
      return {
        success: true,
        message: t('message.t2vTaskCreated', 'Video generation task created, taskId: {taskId}').replace('{taskId}', result.task_id),
        data: { taskId: result.task_id },
      }
    },
  },

  // ============================
  // 图生视频
  // ============================
  {
    name: 'minimax_image_to_video',
    label: t('action.imageToVideo.label', 'Image to Video'),
    category: t('category', 'MiniMax AI'),
    icon: 'Clapperboard',
    description: t('action.imageToVideo.description', 'MiniMax image-to-video: generate video from an image and text description'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'firstFrameImage', type: 'string', description: '首帧图片 URL 或 Base64 Data URL', required: true },
      { key: 'prompt', type: 'string', description: '视频描述，支持运镜指令' },
      { key: 'model', type: 'string', description: '模型: MiniMax-Hailuo-2.3(默认)/I2V-01-Director/I2V-01-live/I2V-01 等' },
      { key: 'duration', type: 'number', description: '时长(秒): 6(默认) 或 10' },
      { key: 'resolution', type: 'string', description: '分辨率: 720P/768P(默认)/1080P' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'firstFrameImage', label: t('field.firstFrameImage.label', 'First Frame Image'), type: 'textarea', required: true, tooltip: t('field.firstFrameImage.tooltip', 'First frame image URL or Base64 Data URL (JPG/PNG/WebP, <20MB)') },
      { key: 'prompt', label: t('field.prompt.i2v.label', 'Video Description'), type: 'textarea', tooltip: t('field.prompt.i2v.tooltip', 'Video text description (max 2000 chars), supports camera commands') },
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', default: 'MiniMax-Hailuo-2.3', options: I2V_MODELS },
      { key: 'duration', label: t('field.duration.label', 'Duration (sec)'), type: 'select', default: 6, options: VIDEO_DURATIONS },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '768P', options: VIDEO_RESOLUTIONS },
      { key: 'promptOptimizer', label: t('field.promptOptimizer.label', 'Auto-optimize Prompt'), type: 'select', default: 'true', options: [
        { label: t('field.yesDefault.label', 'Yes (default)'), value: 'true' }, { label: t('field.no.label', 'No'), value: 'false' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'taskId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        model: args.model || 'MiniMax-Hailuo-2.3',
        first_frame_image: args.firstFrameImage,
        prompt: args.prompt || '',
        duration: args.duration || 6,
        resolution: args.resolution || '768P',
        prompt_optimizer: args.promptOptimizer !== 'false',
      }

      ctx.logger.info(`图生视频: 模型=${body.model}, 时长=${body.duration}s`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.i2vFailed', 'Image-to-video failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`图生视频任务已创建: taskId=${result.task_id}`)
      return {
        success: true,
        message: t('message.i2vTaskCreated', 'Image-to-video task created, taskId: {taskId}').replace('{taskId}', result.task_id),
        data: { taskId: result.task_id },
      }
    },
  },

  // ============================
  // 首尾帧生成视频
  // ============================
  {
    name: 'minimax_start_end_to_video',
    label: t('action.startEndToVideo.label', 'Start-End Frame Video'),
    category: t('category', 'MiniMax AI'),
    icon: 'Film',
    description: t('action.startEndToVideo.description', 'MiniMax start-end frame video: generate transition video from start and end frame images'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'firstFrameImage', type: 'string', description: '起始帧图片 URL 或 Base64 Data URL', required: true },
      { key: 'lastFrameImage', type: 'string', description: '结束帧图片 URL 或 Base64 Data URL', required: true },
      { key: 'prompt', type: 'string', description: '视频描述，支持运镜指令' },
      { key: 'duration', type: 'number', description: '时长(秒): 6(默认) 或 10' },
      { key: 'resolution', type: 'string', description: '分辨率: 768P(默认)/1080P' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'firstFrameImage', label: t('field.firstFrameImage.label', 'First Frame Image'), type: 'textarea', required: true, tooltip: t('field.firstFrameImage.sev.tooltip', 'Start frame image URL or Base64 Data URL') },
      { key: 'lastFrameImage', label: t('field.lastFrameImage.label', 'Last Frame Image'), type: 'textarea', required: true, tooltip: t('field.lastFrameImage.tooltip', 'End frame image URL or Base64 Data URL') },
      { key: 'prompt', label: t('field.prompt.t2v.label', 'Video Description'), type: 'textarea', tooltip: t('field.prompt.sev.tooltip', 'Video text description, supports camera commands') },
      { key: 'duration', label: t('field.duration.label', 'Duration (sec)'), type: 'select', default: 6, options: VIDEO_DURATIONS },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', default: '768P', options: [
        { label: t('option.resolution.768p.default', '768P (default)'), value: '768P' }, { label: '1080P', value: '1080P' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'taskId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        model: 'MiniMax-Hailuo-02',
        first_frame_image: args.firstFrameImage,
        last_frame_image: args.lastFrameImage,
        prompt: args.prompt || '',
        duration: args.duration || 6,
        resolution: args.resolution || '768P',
      }

      ctx.logger.info(`首尾帧视频: 时长=${body.duration}s, 分辨率=${body.resolution}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.sevFailed', 'Start-end frame video failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`首尾帧视频任务已创建: taskId=${result.task_id}`)
      return {
        success: true,
        message: t('message.sevTaskCreated', 'Start-end frame video task created, taskId: {taskId}').replace('{taskId}', result.task_id),
        data: { taskId: result.task_id },
      }
    },
  },

  // ============================
  // 主体参考视频
  // ============================
  {
    name: 'minimax_subject_to_video',
    label: t('action.subjectToVideo.label', 'Subject Reference Video'),
    category: t('category', 'MiniMax AI'),
    icon: 'UserRound',
    description: t('action.subjectToVideo.description', 'MiniMax subject reference video: generate video from a character image (maintains character consistency)'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'subjectImage', type: 'string', description: '人物面部参考图片 URL', required: true },
      { key: 'prompt', type: 'string', description: '视频描述' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'subjectImage', label: t('field.subjectImage.label', 'Character Image'), type: 'textarea', required: true, tooltip: t('field.subjectImage.tooltip', 'Character face reference image URL (JPG/PNG/WebP, <20MB)') },
      { key: 'prompt', label: t('field.prompt.t2v.label', 'Video Description'), type: 'textarea', tooltip: t('field.prompt.sv.tooltip', 'Video text description') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'taskId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      const body = {
        model: 'S2V-01',
        prompt: args.prompt || '',
        subject_reference: [
          {
            type: 'character',
            image: [args.subjectImage],
          },
        ],
      }

      ctx.logger.info(`主体参考视频: 人物图片=${args.subjectImage.substring(0, 80)}`)
      const result = await ctx.api.postJson(`${baseUrl}/v1/video_generation`, { headers, body, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.svFailed', 'Subject reference video failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      ctx.logger.info(`主体参考视频任务已创建: taskId=${result.task_id}`)
      return {
        success: true,
        message: t('message.svTaskCreated', 'Subject reference video task created, taskId: {taskId}').replace('{taskId}', result.task_id),
        data: { taskId: result.task_id },
      }
    },
  },

  // ============================
  // 查询视频任务状态
  // ============================
  {
    name: 'minimax_video_query',
    label: t('action.videoQuery.label', 'Video Task Query'),
    category: t('category', 'MiniMax AI'),
    icon: 'Search',
    description: t('action.videoQuery.description', 'Query MiniMax video generation task status (Preparing/Queueing/Processing/Success/Fail)'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'taskId', type: 'string', description: '视频生成任务ID', required: true },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'taskId', label: t('field.taskId.label', 'Task ID'), type: 'text', required: true, tooltip: t('field.taskId.tooltip', 'Task ID returned by video generation') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'status', type: 'string' },
        { key: 'taskId', type: 'string' },
        { key: 'fileId', type: 'string' },
        { key: 'videoWidth', type: 'number' },
        { key: 'videoHeight', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      ctx.logger.info(`查询视频任务: taskId=${args.taskId}`)
      const result = await ctx.api.fetchJson(`${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(args.taskId)}`, { headers, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.queryFailed', 'Query failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      const status = result.status
      ctx.logger.info(`视频任务状态: ${status}, fileId=${result.file_id || '无'}`)
      return {
        success: true,
        message: t('message.queryStatus', 'Task status: {status}').replace('{status}', status),
        data: {
          status,
          taskId: result.task_id,
          fileId: result.file_id,
          videoWidth: result.video_width,
          videoHeight: result.video_height,
        },
      }
    },
  },

  // ============================
  // 视频下载
  // ============================
  {
    name: 'minimax_video_download',
    label: t('action.videoDownload.label', 'Video Download'),
    category: t('category', 'MiniMax AI'),
    icon: 'Download',
    description: t('action.videoDownload.description', 'Get MiniMax video download link by fileId (valid for 1 hour)'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'fileId', type: 'string', description: '视频文件ID（从查询接口获取）', required: true },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'fileId', label: t('field.fileId.label', 'File ID'), type: 'text', required: true, tooltip: t('field.fileId.tooltip', 'File ID returned by video task query') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'downloadUrl', type: 'video' },
        { key: 'fileName', type: 'string' },
        { key: 'fileSize', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)

      ctx.logger.info(`获取视频下载链接: fileId=${args.fileId}`)
      const result = await ctx.api.fetchJson(`${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(args.fileId)}`, { headers, timeout: 30000 })

      if (result.base_resp?.status_code !== 0) {
        const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
        return { success: false, message: t('message.downloadFailed', 'Failed to get download link: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
      }

      const file = result.file
      ctx.logger.info(`获取下载链接成功: ${file.filename}, 大小=${file.bytes}B`)
      return {
        success: true,
        message: t('message.downloadSuccess', 'Download link retrieved (valid for 1 hour)'),
        data: {
          downloadUrl: file.download_url,
          fileName: file.filename,
          fileSize: file.bytes,
        },
      }
    },
  },

  // ============================
  // 视频异步等待（轮询至完成）
  // ============================
  {
    name: 'minimax_video_async_wait',
    label: t('action.videoAsyncWait.label', 'Video Async Wait'),
    category: t('category', 'MiniMax AI'),
    icon: 'Timer',
    description: t('action.videoAsyncWait.description', 'Poll video generation task until completion, auto-retrieve download link on success'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'MiniMax API Key', required: true },
      { key: 'taskId', type: 'string', description: '视频生成任务ID', required: true },
      { key: 'timeout', type: 'number', description: '超时时间（秒），默认 600（10分钟）' },
      { key: 'pollInterval', type: 'number', description: '轮询间隔（秒），默认 10' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://api.minimaxi.com' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, default: '{{ __config__["workflow.minimax"]["apiKey"] }}' },
      { key: 'taskId', label: t('field.taskId.label', 'Task ID'), type: 'text', required: true, tooltip: t('field.taskId.tooltip', 'Task ID returned by video generation') },
      { key: 'timeout', label: t('field.timeout.label', 'Timeout (sec)'), type: 'number', default: 600, tooltip: t('field.timeout.tooltip', 'Max wait time in seconds, default 600 (10 min)') },
      { key: 'pollInterval', label: t('field.pollInterval.label', 'Poll Interval (sec)'), type: 'number', default: 10, tooltip: t('field.pollInterval.tooltip', 'Query interval in seconds, default 10') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: '{{ __config__["workflow.minimax"]["baseUrl"] }}' },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'status', type: 'string' },
        { key: 'taskId', type: 'string' },
        { key: 'fileId', type: 'string' },
        { key: 'downloadUrl', type: 'video' },
        { key: 'fileName', type: 'string' },
        { key: 'fileSize', type: 'number' },
        { key: 'videoWidth', type: 'number' },
        { key: 'videoHeight', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = getBaseUrl(args)
      const headers = getHeaders(args)
      const taskId = args.taskId
      const timeoutMs = (Number(args.timeout) || 600) * 1000
      const pollMs = (Number(args.pollInterval) || 10) * 1000
      const deadline = Date.now() + timeoutMs

      ctx.logger.info(`视频异步等待开始: taskId=${taskId}, 超时=${timeoutMs / 1000}s, 轮询间隔=${pollMs / 1000}s`)

      while (Date.now() < deadline) {
        const result = await ctx.api.fetchJson(
          `${baseUrl}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
          { headers, timeout: 30000 },
        )

        if (result.base_resp?.status_code !== 0) {
          const errMsg = result.base_resp?.status_msg || t('message.unknownError', 'Unknown error')
          return { success: false, message: t('message.queryFailed', 'Query failed: {error} (code: {code})').replace('{error}', errMsg).replace('{code}', result.base_resp?.status_code) }
        }

        const status = result.status

        if (status === 'Success') {
          const fileId = result.file_id
          ctx.logger.info(`视频任务完成: taskId=${taskId}, fileId=${fileId}`)

          // 获取下载链接
          let downloadUrl, fileName, fileSize
          if (fileId) {
            try {
              const fileResult = await ctx.api.fetchJson(
                `${baseUrl}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
                { headers, timeout: 30000 },
              )
              if (fileResult.file) {
                downloadUrl = fileResult.file.download_url
                fileName = fileResult.file.filename
                fileSize = fileResult.file.bytes
              }
            } catch (e) {
              ctx.logger.warn(`获取下载链接失败: ${e.message}`)
            }
          }

          return {
            success: true,
            message: t('message.videoAsyncComplete', 'Video generation completed'),
            data: {
              status,
              taskId: result.task_id,
              fileId,
              downloadUrl,
              fileName,
              fileSize,
              videoWidth: result.video_width,
              videoHeight: result.video_height,
            },
          }
        }

        if (status === 'Fail') {
          ctx.logger.warn(`视频任务失败: taskId=${taskId}`)
          return {
            success: false,
            message: t('message.videoAsyncFailed', 'Video generation task failed, taskId: {taskId}').replace('{taskId}', taskId),
            data: {
              status,
              taskId: result.task_id,
              fileId: result.file_id,
            },
          }
        }

        // 仍在处理中
        ctx.logger.info(`视频任务状态: ${status}, 等待 ${pollMs / 1000}s 后重试`)
        await new Promise(r => setTimeout(r, pollMs))
      }

      // 超时
      ctx.logger.warn(`视频异步等待超时: taskId=${taskId}`)
      return {
        success: false,
        message: t('message.videoAsyncTimeout', 'Video generation timed out after {timeout}s, taskId: {taskId}').replace('{timeout}', String(timeoutMs / 1000)).replace('{taskId}', taskId),
      }
    },
  },
  ]
}
