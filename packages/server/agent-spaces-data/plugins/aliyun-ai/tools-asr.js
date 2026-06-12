// ============================================================
// 阿里云百炼 AI 插件 - 语音识别 ASR 工具定义
// 涵盖：录音文件异步转写（FunASR/Paraformer/Qwen-Filetrans）、
//       千问 Qwen-ASR 实时语音识别（OpenAI 兼容模式）
// ============================================================

const { getHeaders, executeAsyncTask } = require('./shared')

const TASK_SUBMIT_ENDPOINT = '/api/v1/services/audio/asr/transcription'
const TASK_QUERY_BASE = 'https://dashscope.aliyuncs.com/api/v1/tasks'
const QWEN_SYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

// ── Helpers ────────────────────────────────────────────────

function getAsyncHeaders(args) {
  return { ...getHeaders(args), 'X-DashScope-Async': 'enable' }
}

function parseArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value)
  } catch {
    return [value]
  }
}

function buildAsyncRequestBody(args) {
  const model = args.model || 'paraformer-v2'
  const isQwenFiletrans = model.startsWith('qwen')

  const body = { model }

  if (isQwenFiletrans) {
    body.input = { file_url: args.fileUrl }
    body.parameters = {}
    if (args.channelId) body.parameters.channel_id = parseArray(args.channelId)
    if (args.language) body.parameters.language = args.language
    if (args.enableItn !== undefined) body.parameters.enable_itn = args.enableItn
    if (args.enableWords !== undefined) body.parameters.enable_words = args.enableWords
  } else {
    const fileUrls = parseArray(args.fileUrls)
    body.input = { file_urls: fileUrls }
    body.parameters = {}
    if (args.channelId) body.parameters.channel_id = parseArray(args.channelId)
    if (args.vocabularyId) body.parameters.vocabulary_id = args.vocabularyId
    if (args.specialWordFilter) body.parameters.special_word_filter = args.specialWordFilter
    if (args.diarizationEnabled !== undefined) body.parameters.diarization_enabled = args.diarizationEnabled
    if (args.speakerCount) body.parameters.speaker_count = args.speakerCount
    if (args.languageHints) body.parameters.language_hints = parseArray(args.languageHints)
    if (args.disfluencyRemovalEnabled !== undefined) body.parameters.disfluency_removal_enabled = args.disfluencyRemovalEnabled
    if (args.timestampAlignmentEnabled !== undefined) body.parameters.timestamp_alignment_enabled = args.timestampAlignmentEnabled
  }

  return body
}

function extractTranscriptionResults(pollResult) {
  const output = pollResult.output || {}
  const results = output.results || output.result ? [output.result] : []

  if (results.length === 0) {
    return { success: false, message: '任务成功但无识别结果' }
  }

  const transcriptions = []
  for (const item of results) {
    const transcriptionUrl = item.transcription_url
    if (transcriptionUrl) {
      transcriptions.push({
        fileUrl: item.file_url || '',
        transcriptionUrl,
        subtaskStatus: item.subtask_status || 'SUCCEEDED',
      })
    }
  }

  return {
    success: true,
    message: `识别完成，共 ${transcriptions.length} 个文件`,
    data: {
      taskId: output.task_id,
      taskMetrics: output.task_metrics || null,
      transcriptions,
      usage: pollResult.usage || null,
    },
  }
}

async function executeAsyncTranscription(api, args, body) {
  const baseUrl = args.baseUrl ? args.baseUrl.replace(/\/$/, '') : 'https://dashscope.aliyuncs.com'
  const submitHeaders = getAsyncHeaders(args)

  const createResult = await api.postJson(`${baseUrl}${TASK_SUBMIT_ENDPOINT}`, {
    headers: submitHeaders,
    body,
    timeout: 600000,
  })

  if (createResult.code || createResult.message) {
    return {
      success: false,
      message: `创建任务失败: ${createResult.code} - ${createResult.message}`,
    }
  }

  const taskId = createResult.output?.task_id
  if (!taskId) {
    return { success: false, message: '创建任务成功但未获取到 task_id' }
  }

  const pollHeaders = getHeaders(args)
  const maxAttempts = 120
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000))
    const pollResult = await api.getJson(`${TASK_QUERY_BASE}/${taskId}`, {
      headers: pollHeaders,
      timeout: 30000,
    })

    const status = pollResult.output?.task_status
    if (status === 'SUCCEEDED') {
      return extractTranscriptionResults(pollResult)
    }
    if (status === 'FAILED') {
      return {
        success: false,
        message: `任务失败: ${pollResult.output?.code || ''} - ${pollResult.output?.message || '未知错误'}`,
      }
    }
    if (status === 'UNKNOWN' || status === 'CANCELED') {
      return { success: false, message: `任务异常: ${status}` }
    }
  }
  return { success: false, message: '轮询超时（已等待 10 分钟）' }
}

// ── Tool definitions ───────────────────────────────────────

module.exports = {
  tools: [
    {
      name: 'asr_file_recognition',
      description: '录音文件异步语音识别。提交音频/视频文件URL进行语音转文字，支持多种模型。先提交任务，自动轮询等待结果。适用于录音、会议、访谈等长音频场景。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
          baseUrl: { type: 'string', description: 'DashScope API 地址，默认 https://dashscope.aliyuncs.com' },
          model: {
            type: 'string',
            description: '识别模型。paraformer-v2(推荐多语种)/fun-asr(中英文)/qwen3-asr-flash-filetrans(千问长音频) 等',
          },
          fileUrls: {
            type: 'array',
            items: { type: 'string' },
            description: 'FunASR/Paraformer: 音频文件URL列表（最多100个）',
          },
          fileUrl: {
            type: 'string',
            description: 'Qwen-Filetrans: 单个音频文件URL',
          },
          languageHints: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paraformer-v2 语言提示，如 ["zh","en"]',
          },
          language: {
            type: 'string',
            description: 'Qwen-Filetrans 指定语言代码（zh/en/ja/ko 等）',
          },
          diarizationEnabled: { type: 'boolean', description: '是否开启说话人分离（默认关闭）' },
          speakerCount: { type: 'integer', description: '说话人数量参考值（2-100）' },
        },
        required: ['apiKey'],
      },
    },
    {
      name: 'asr_qwen_flash',
      description: '千问 Qwen-ASR 实时语音识别（OpenAI 兼容模式）。适用于短音频（<10MB）快速转写，支持音频URL和Base64编码输入，同步返回识别结果。还支持语种检测和情感分析。',
      input_schema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: '阿里云百炼 DashScope API Key' },
          baseUrl: { type: 'string', description: 'DashScope API 地址，默认 https://dashscope.aliyuncs.com' },
          audio: {
            type: 'string',
            description: '音频内容：公网可访问URL 或 Base64 Data URI（data:audio/wav;base64,...）',
          },
          language: {
            type: 'string',
            description: '指定语种（zh/en/ja/ko/de/fr/ru 等），不指定则自动检测',
          },
          enableItn: { type: 'boolean', description: '是否启用逆文本标准化（ITN），默认 false' },
        },
        required: ['apiKey', 'audio'],
      },
    },
  ],

  handler: async (name, args, api) => {
    switch (name) {
      case 'asr_file_recognition': {
        const body = buildAsyncRequestBody(args)
        return executeAsyncTranscription(api, args, body)
      }

      case 'asr_qwen_flash': {
        const baseUrl = args.baseUrl ? args.baseUrl.replace(/\/$/, '') : 'https://dashscope.aliyuncs.com'
        const headers = getHeaders(args)

        const body = {
          model: 'qwen3-asr-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: { data: args.audio },
                },
              ],
            },
          ],
          stream: false,
          asr_options: {
            ...(args.language && { language: args.language }),
            ...(args.enableItn !== undefined && { enable_itn: args.enableItn }),
          },
        }

        const result = await api.postJson(`${baseUrl}${QWEN_SYNC_ENDPOINT}`, {
          headers,
          body,
          timeout: 120000,
        })

        if (result.error) {
          return { success: false, message: `识别失败: ${result.error.message || JSON.stringify(result.error)}` }
        }

        const text = result.choices?.[0]?.message?.content || ''
        const annotations = result.choices?.[0]?.message?.annotations || []
        const audioInfo = annotations.find(a => a.type === 'audio_info') || {}
        const usage = result.usage || {}

        return {
          success: true,
          message: text ? `识别完成: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}` : '识别完成但无内容',
          data: {
            text,
            language: audioInfo.language || '',
            emotion: audioInfo.emotion || '',
            duration: usage.seconds || 0,
            usage,
          },
        }
      }

      default:
        return { success: false, message: `未知工具: ${name}` }
    }
  },
}
