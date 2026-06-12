// ============================================================
// FishAudio 语音合成插件 - 统一 Actions
// 合并自: tools.js, workflow.js
// ============================================================

const path = require('path')
const shared = require('./shared')

const {
  postForBuffer,
  postFormData,
  readAudioFile,
  getFormatExt,
  getMimeType,
  buildAuthHeader,
  resolveBaseUrl,
  resolveProxy,
} = shared

const CONFIG_PREFIX = '{{ __config__["workflow.fish-audio"]'

module.exports = (t) => [
  // ─── TTS 文字转语音 ─────────────────────────
  {
    name: 'fish_audio_tts',
    label: t('action.tts.label', 'AI Text to Speech'),
    category: t('category', 'FishAudio'),
    icon: 'AudioWaveform',
    description: t('action.tts.description', 'Convert text to natural speech using FishAudio (TTS)'),
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'FishAudio API Key (read from plugin config by default)'), default: `${CONFIG_PREFIX}["apiKey"]}}` },
      { key: 'text', label: t('field.text.label', 'Text Content'), type: 'textarea', required: true, tooltip: t('field.text.tooltip', 'Text to convert to speech') },
      { key: 'referenceId', label: t('field.referenceId.label', 'Voice Model ID'), type: 'text', tooltip: t('field.referenceId.tooltip', 'Voice model ID (read from plugin config by default)'), default: `${CONFIG_PREFIX}["referenceId"]}}` },
      { key: 'model', label: t('field.model.label', 'TTS Model'), type: 'select', default: 's2-pro', options: [
        { label: 'S2-Pro（推荐）', value: 's2-pro' },
        { label: 'S1', value: 's1' },
      ] },
      { key: 'format', label: t('field.format.label', 'Audio Format'), type: 'select', default: 'mp3', options: [
        { label: 'MP3（默认）', value: 'mp3' },
        { label: 'WAV', value: 'wav' },
        { label: 'PCM', value: 'pcm' },
        { label: 'Opus', value: 'opus' },
      ] },
      { key: 'sampleRate', label: t('field.sampleRate.label', 'Sample Rate (Hz)'), type: 'select', default: '44100', options: [
        { label: '44100 Hz（默认）', value: '44100' },
        { label: '16000 Hz', value: '16000' },
        { label: '24000 Hz', value: '24000' },
        { label: '32000 Hz', value: '32000' },
        { label: '48000 Hz（Opus 推荐）', value: '48000' },
      ] },
      { key: 'speed', label: t('field.speed.label', 'Speed (0.5-2.0)'), type: 'number', default: 1, tooltip: t('field.speed.tooltip', '1.0 for normal speed') },
      { key: 'volume', label: t('field.volume.label', 'Volume (dB)'), type: 'number', default: 0, tooltip: t('field.volume.tooltip', '0 for no change, positive to amplify, negative to reduce') },
      { key: 'temperature', label: t('field.temperature.label', 'Expression (0-1)'), type: 'number', default: 0.7, tooltip: t('field.temperature.tooltip', 'Higher values produce more varied output') },
      { key: 'latency', label: t('field.latency.label', 'Latency Mode'), type: 'select', default: 'normal', options: [
        { label: 'Normal（最佳质量）', value: 'normal' },
        { label: 'Balanced（较低延迟）', value: 'balanced' },
        { label: 'Low（最低延迟）', value: 'low' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: `${CONFIG_PREFIX}["baseUrl"]}}`, tooltip: t('field.baseUrl.tooltip', 'FishAudio API base URL') },
      { key: 'proxy', label: t('field.proxy.label', 'HTTP Proxy'), type: 'text', tooltip: t('field.proxy.tooltip', 'HTTP proxy address, read from plugin config by default'), default: `${CONFIG_PREFIX}["httpProxy"]}}`, placeholder: 'http://127.0.0.1:7890' },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要转换为语音的文字内容' },
        apiKey: { type: 'string', description: 'FishAudio API Key（也可在插件配置中全局设置）' },
        referenceId: { type: 'string', description: '音色模型 ID（可在 fish.audio 模型市场获取）' },
        model: { type: 'string', description: 'TTS 模型，默认 s2-pro，支持 s1/s2-pro' },
        format: { type: 'string', description: '音频格式，默认 mp3，支持 wav/mp3/pcm/opus' },
        sampleRate: { type: 'number', description: '采样率(Hz)，默认 44100（opus 为 48000）' },
        speed: { type: 'number', description: '语速倍率，0.5-2.0，默认 1.0' },
        volume: { type: 'number', description: '音量调整(dB)，正数放大负数减小，默认 0' },
        temperature: { type: 'number', description: '表现力控制，0-1，越高越丰富，默认 0.7' },
        topP: { type: 'number', description: '核采样参数，0-1，默认 0.7' },
        chunkLength: { type: 'number', description: '文本分片长度，100-300，默认 300' },
        latency: { type: 'string', description: '延迟模式：normal(最佳质量)/balanced(较低延迟)/low(最低延迟)' },
        baseUrl: { type: 'string', description: 'API 地址，默认 https://api.fish.audio' },
        proxy: { type: 'string', description: 'HTTP 代理地址，如 http://127.0.0.1:7890（也可在插件配置中全局设置）' },
      },
      required: ['text'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'filePath', type: 'string' },
        { key: 'httpPath', type: 'string' },
        { key: 'format', type: 'string' },
        { key: 'size', type: 'number' },
        { key: 'mimeType', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const model = args.model || 's2-pro'
      const format = args.format || 'mp3'

      const body = {
        text: args.text,
        ...(args.referenceId && { reference_id: args.referenceId }),
        temperature: args.temperature ?? 0.7,
        top_p: args.topP ?? 0.7,
        ...(args.sampleRate && { sample_rate: parseInt(args.sampleRate) || 44100 }),
        ...(args.chunkLength && { chunk_length: args.chunkLength }),
        format,
        normalize: true,
        ...(args.latency && { latency: args.latency }),
        prosody: {
          speed: args.speed ?? 1,
          volume: args.volume ?? 0,
          normalize_loudness: true,
        },
      }

      ctx.logger.info(`TTS 请求: ${baseUrl}/v1/tts${proxy ? ` (代理: ${proxy})` : ''}`)
      ctx.logger.info(`模型: ${model}, 格式: ${format}`)
      ctx.logger.info(`文字长度: ${args.text.length} 字符`)

      const { buffer, mimeType } = await postForBuffer(`${baseUrl}/v1/tts`, {
        headers: { ...headers, 'model': model },
        body,
        timeout: 120000,
        proxy,
      })

      const ext = getFormatExt(format)
      const { filePath, httpPath } = ctx.api.savePublicFile(buffer, ext)

      ctx.logger.info(`TTS 完成: ${filePath} (${(buffer.length / 1024).toFixed(1)}KB)`)

      return {
        success: true,
        message: t('message.ttsSuccess', 'Speech synthesis completed, audio saved ({size}KB)').replace('{size}', (buffer.length / 1024).toFixed(1)),
        data: { filePath, httpPath, format, size: buffer.length, mimeType },
      }
    },
  },

  // ─── STT 语音转文字 ─────────────────────────
  {
    name: 'fish_audio_stt',
    label: t('action.stt.label', 'AI Speech to Text'),
    category: t('category', 'FishAudio'),
    icon: 'Mic',
    description: t('action.stt.description', 'Transcribe audio files to text using FishAudio (STT)'),
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', required: true, tooltip: t('field.apiKey.tooltip', 'FishAudio API Key (read from plugin config by default)'), default: `${CONFIG_PREFIX}["apiKey"]}}` },
      { key: 'filePath', label: t('field.filePath.label', 'Audio File Path'), type: 'text', required: true, tooltip: t('field.filePath.tooltip', 'Local audio file path (supports WAV/MP3/FLAC)') },
      { key: 'language', label: t('field.language.label', 'Language'), type: 'select', default: 'auto', options: [
        { label: '自动检测', value: 'auto' },
        { label: '中文', value: 'zh' },
        { label: '英文', value: 'en' },
        { label: '日文', value: 'ja' },
        { label: '韩文', value: 'ko' },
        { label: '法文', value: 'fr' },
        { label: '德文', value: 'de' },
        { label: '西班牙文', value: 'es' },
      ] },
      { key: 'baseUrl', label: t('field.baseUrl.label', 'API URL'), type: 'text', default: `${CONFIG_PREFIX}["baseUrl"]}}`, tooltip: t('field.baseUrl.tooltip', 'FishAudio API base URL') },
      { key: 'proxy', label: t('field.proxy.label', 'HTTP Proxy'), type: 'text', tooltip: t('field.proxy.tooltip', 'HTTP proxy address, read from plugin config by default'), default: `${CONFIG_PREFIX}["httpProxy"]}}`, placeholder: 'http://127.0.0.1:7890' },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '音频文件的本地路径' },
        apiKey: { type: 'string', description: 'FishAudio API Key' },
        language: { type: 'string', description: '音频语言，如 zh/en/ja/ko 等，不填则自动检测' },
        ignoreTimestamps: { type: 'boolean', description: '是否忽略精确时间戳，默认 true' },
        baseUrl: { type: 'string', description: 'API 地址，默认 https://api.fish.audio' },
        proxy: { type: 'string', description: 'HTTP 代理地址，如 http://127.0.0.1:7890（也可在插件配置中全局设置）' },
      },
      required: ['filePath'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'text', type: 'string' },
        { key: 'duration', type: 'number' },
        { key: 'segments', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      const baseUrl = resolveBaseUrl(args)
      const proxy = resolveProxy(args)
      const headers = buildAuthHeader(args.apiKey)

      const audioBuffer = readAudioFile(args.filePath)
      const ext = path.extname(args.filePath).toLowerCase()
      const mimeType = getMimeType(ext)

      ctx.logger.info(`STT 请求: ${baseUrl}/v1/asr${proxy ? ` (代理: ${proxy})` : ''}`)
      ctx.logger.info(`文件: ${args.filePath} (${(audioBuffer.length / 1024).toFixed(1)}KB, ${mimeType})`)
      ctx.logger.info(`语言: ${args.language || '自动检测'}`)

      const result = await postFormData(`${baseUrl}/v1/asr`, {
        headers,
        file: { buffer: audioBuffer, mimeType },
        language: (args.language && args.language !== 'auto') ? args.language : null,
        timeout: 120000,
        proxy,
      })

      ctx.logger.info(`STT 完成: 时长 ${result.duration?.toFixed(1) || '?'}秒, 文字长度 ${result.text?.length || 0}`)

      return {
        success: true,
        message: t('message.sttSuccess', 'Speech recognition completed, duration {duration}s').replace('{duration}', result.duration?.toFixed(1) || '?'),
        data: {
          text: result.text,
          duration: result.duration,
          segments: result.segments || [],
        },
      }
    },
  },
]
