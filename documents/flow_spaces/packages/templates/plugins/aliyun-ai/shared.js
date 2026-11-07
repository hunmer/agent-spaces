// ============================================================
// 阿里云百炼 AI 插件 - AI Agent 工具定义
// 涵盖：文生图、图像编辑、扩图、可灵生图、图生视频、首尾帧生视频、
//       参考生视频、文生视频、视频编辑、图生动作、声动人像
// ============================================================

const SYNC_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const TASK_QUERY_ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/tasks'

const ASYNC_ENDPOINTS = {
  wanText2Image: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
  outPainting: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/out-painting',
  klingImage: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation',
  videoSynthesis: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
  image2video: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2video/video-synthesis',
}

// ── Helpers ────────────────────────────────────────────────

function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('缺少 apiKey（阿里云百炼 DashScope API Key）')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

function getAsyncHeaders(args) {
  return { ...getHeaders(args), 'X-DashScope-Async': 'enable' }
}

function extractImageUrls(result) {
  const choices = result.output?.choices || []
  const urls = []
  for (const choice of choices) {
    const contents = choice.message?.content || []
    for (const item of contents) {
      if (item.image) urls.push(item.image)
    }
  }
  return urls
}

function extractLegacyImageUrls(result) {
  return (result.output?.results || []).map(r => r.url).filter(Boolean)
}

async function executeAsyncTask(api, args, endpoint, body, extractResult) {
  const headers = getAsyncHeaders(args)

  const createResult = await api.postJson(endpoint, { headers, body, timeout: 600000 })
  if (createResult.code || createResult.message) {
    return { success: false, message: `创建任务失败: ${createResult.code} - ${createResult.message}` }
  }

  const taskId = createResult.output?.task_id
  if (!taskId) return { success: false, message: '创建任务成功但未获取到 task_id' }

  const pollHeaders = getHeaders(args)
  const maxAttempts = 120
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000))
    const pollResult = await api.getJson(`${TASK_QUERY_ENDPOINT}/${taskId}`, { headers: pollHeaders, timeout: 30000 })
    const status = pollResult.output?.task_status

    if (status === 'SUCCEEDED') return extractResult(pollResult)
    if (status === 'FAILED') {
      return { success: false, message: `任务失败: ${pollResult.output?.code || ''} - ${pollResult.output?.message || '未知错误'}` }
    }
    if (status === 'UNKNOWN' || status === 'CANCELED') return { success: false, message: `任务异常: ${status}` }
  }
  return { success: false, message: '轮询超时' }
}

module.exports = {
  SYNC_ENDPOINT,
  ASYNC_ENDPOINTS,
  getHeaders,
  extractImageUrls,
  extractLegacyImageUrls,
  executeAsyncTask,
}
