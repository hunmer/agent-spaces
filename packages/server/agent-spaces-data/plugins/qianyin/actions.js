// ============================================================
// 千音语音合成插件 - 统一 Actions
// ============================================================

const shared = require('./shared')

const {
  buildAuthHeaders,
  resolveBaseUrl,
  postJSON,
  getJSON,
  downloadBuffer,
  saveToTempFile,
  getFormatExt,
} = shared

const CONFIG_PREFIX = '{{ __config__["workflow.qianyin"]'

module.exports = (t) => [
  // ─── TTS 文字转语音 ─────────────────────────
  {
    name: 'qianyin_tts',
    label: t('action.tts.label', 'AI Text to Speech'),
    category: t('category', 'Qianyin'),
    icon: 'AudioWaveform',
    description: t('action.tts.description', 'Convert text to speech using Qianyin TTS with various speakers'),
    properties: [
      { key: 'appkey', label: t('field.appkey.label', 'App Key'), type: 'text', required: true, tooltip: t('field.appkey.tooltip', 'Qianyin AppKey (read from plugin config by default)'), default: `${CONFIG_PREFIX}["appkey"]}}` },
      { key: 'secret', label: t('field.secret.label', 'Secret'), type: 'text', required: true, tooltip: t('field.secret.tooltip', 'Qianyin Secret (read from plugin config by default)'), default: `${CONFIG_PREFIX}["secret"]}}` },
      { key: 'text', label: t('field.text.label', 'Text Content'), type: 'textarea', required: true, tooltip: t('field.text.tooltip', 'Text to convert to speech') },
      { key: 'speakerId', label: t('field.speakerId.label', 'Speaker ID'), type: 'text', tooltip: t('field.speakerId.tooltip', 'Speaker ID, e.g. 521 (default female)'), default: '521' },
      { key: 'format', label: t('field.format.label', 'Audio Format'), type: 'select', default: 'mp3', options: [
        { label: 'MP3（默认）', value: 'mp3' },
        { label: 'WAV', value: 'wav' },
      ] },
      { key: 'speed', label: t('field.speed.label', 'Speed'), type: 'number', default: 1.0, tooltip: t('field.speed.tooltip', 'Speech speed, 1.0 for normal') },
      { key: 'volume', label: t('field.volume.label', 'Volume (0-100)'), type: 'number', default: 100, tooltip: t('field.volume.tooltip', 'Volume 0-100, default 100') },
      { key: 'pitch', label: t('field.pitch.label', 'Pitch'), type: 'number', default: 0, tooltip: t('field.pitch.tooltip', 'Pitch adjustment, 0 for default') },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: `${CONFIG_PREFIX}["baseUrl"]}}`, tooltip: t('field.baseUrl.tooltip', 'Qianyin API base URL') },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要转换为语音的文字内容' },
        appkey: { type: 'string', description: '千音 AppKey（也可在插件配置中全局设置）' },
        secret: { type: 'string', description: '千音 Secret（也可在插件配置中全局设置）' },
        speakerId: { type: 'string', description: '发音人 ID，如 521（默认女声）、1051（晓晓Ultra）' },
        format: { type: 'string', description: '音频格式，默认 mp3，支持 mp3/wav' },
        speed: { type: 'number', description: '语速，默认 1.0' },
        volume: { type: 'number', description: '音量 0-100，默认 100' },
        pitch: { type: 'number', description: '音调调节，默认 0' },
        baseUrl: { type: 'string', description: 'API 地址，默认 https://open.qianyin123.com' },
      },
      required: ['text'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'filePath', type: 'string' },
        { key: 'format', type: 'string' },
        { key: 'size', type: 'number' },
        { key: 'fileUrl', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const authHeaders = buildAuthHeaders(args.appkey, args.secret)

      const text = args.text
      const speakerId = parseInt(args.speakerId || '521', 10)
      const format = args.format || 'mp3'
      const speed = (args.speed ?? 1.0).toString()
      const volume = ((args.volume ?? 100) / 100).toString()
      const pitch = (((args.pitch ?? 0) / 10) + 1.0).toString()

      // 文本 base64 编码
      const textBase64 = Buffer.from(text).toString('base64')

      const requestData = {
        text: textBase64,
        speakerId,
        audioType: format,
        speed,
        volume,
        pitch,
      }

      ctx.logger.info(`千音 TTS 请求: ${baseUrl}/api/tts/Submit`)
      ctx.logger.info(`发音人: ${speakerId}, 格式: ${format}, 文字长度: ${text.length}`)

      // 提交合成任务
      const result = await postJSON(
        `${baseUrl}/api/tts/Submit`,
        requestData,
        authHeaders,
        60000,
      )

      if (!result.data?.fileUrl) {
        throw new Error('千音合成失败: 未返回音频 URL')
      }

      const fileUrl = result.data.fileUrl
      ctx.logger.info(`千音合成成功，下载音频: ${fileUrl}`)

      // 下载音频
      const audioBuffer = await downloadBuffer(fileUrl)
      const ext = getFormatExt(format)
      const filePath = saveToTempFile(audioBuffer, ext)

      ctx.logger.info(`千音 TTS 完成: ${filePath} (${(audioBuffer.length / 1024).toFixed(1)}KB)`)

      return {
        success: true,
        message: t('message.ttsSuccess', 'Speech synthesis completed, audio saved ({size}KB)').replace('{size}', (audioBuffer.length / 1024).toFixed(1)),
        data: {
          filePath,
          format,
          size: audioBuffer.length,
          fileUrl,
        },
      }
    },
  },

  // ─── 获取发音人列表 ─────────────────────────
  {
    name: 'qianyin_speakers',
    label: t('action.speakers.label', 'Get Speaker List'),
    category: t('category', 'Qianyin'),
    icon: 'Users',
    description: t('action.speakers.description', 'Fetch available speaker list from Qianyin'),
    tool: false,
    properties: [
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: `${CONFIG_PREFIX}["baseUrl"]}}`, tooltip: t('field.baseUrl.tooltip', 'Qianyin API base URL') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'speakers', type: 'object', children: [] },
        { key: 'total', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)

      ctx.logger.info(`获取千音发音人列表: ${baseUrl}/api/speaker/GetList`)

      const result = await getJSON(`${baseUrl}/api/speaker/GetList`, null, 15000)

      if (result.code !== 200) {
        throw new Error(`获取发音人列表失败: ${result.message || '未知错误'} (code: ${result.code})`)
      }

      const list = result.data?.list || []
      const speakers = list.map((s) => ({
        id: s.id,
        name: s.name,
        gender: s.gender === 1 ? 'male' : 'female',
        language: s.language,
        description: s.descr,
        avatar: s.headUrl,
        auditionUrl: s.auditionUrl,
        price: s.price,
      }))

      ctx.logger.info(`获取到 ${speakers.length} 个发音人`)

      return {
        success: true,
        message: t('message.speakersSuccess', 'Found {count} speakers').replace('{count}', speakers.length),
        data: { speakers, total: speakers.length },
      }
    },
  },
]
