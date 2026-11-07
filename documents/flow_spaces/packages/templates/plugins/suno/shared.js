/**
 * Suno 插件共享接口与轮询工具
 *
 * 网络请求统一走 ctx.api（plugin-runtime-api 注入），不自行实现 HTTP：
 *   api.postJson(url, { headers, body, proxy, timeout })   POST JSON，返回解析后的 JSON
 *   api.fetchJson(url, { headers, proxy, timeout })         GET JSON（别名 getJson）
 * HTTP >= 400 自动抛错、3xx 自动跟随、含代理隧道与调试日志。
 * 这里仅保留对 401/402 的友好错误转译；业务 code 仍交由调用方判断。
 * actions.js 通过 require('./shared') 引用，调用时透传 ctx.api。
 */

const SUNO_BASE_URL = 'https://api.sunoapi.org'

// ---------- Config ----------

let _config = {}

function setConfig(config) {
  _config = config || {}
}

// ---------- HTTP 工具 ----------

function normalizeHttpError(err) {
  const msg = (err && err.message) || String(err)
  if (/^HTTP 401/.test(msg)) return new Error('认证失败：API Key 无效或已过期')
  if (/^HTTP 402/.test(msg)) return new Error('余额不足：请检查 Suno 账户额度')
  return err
}

async function postJson(api, url, options = {}) {
  try {
    return await api.postJson(url, options)
  } catch (err) {
    throw normalizeHttpError(err)
  }
}

async function getJson(api, url, options = {}) {
  try {
    return await api.fetchJson(url, options)
  } catch (err) {
    throw normalizeHttpError(err)
  }
}

// ---------- 任务详情接口路由 ----------
//
// 不同任务类型的详情查询接口不同，按 type 路由：
//   generate       生成 / 扩展 / 上传翻唱
//   lyrics         歌词生成
//   vocal_removal  人声分离
//   music_video    音乐视频 (MV)
//   cover          音乐封面
const RECORD_INFO_PATHS = {
  generate: '/api/v1/generate/record-info',
  lyrics: '/api/v1/lyrics/record-info',
  vocal_removal: '/api/v1/vocal-removal/record-info',
  music_video: '/api/v1/mp4/record-info',
  cover: '/api/v1/suno/cover/record-info',
}

function getRecordInfoPath(type) {
  return RECORD_INFO_PATHS[type] || RECORD_INFO_PATHS.generate
}

// 成功判定：兼容 generate/lyrics/vocal/mp4 的 status='SUCCESS' 与 cover 的 successFlag=1
function isTaskSuccess(data) {
  const flag = data.status || data.successFlag
  return flag === 'SUCCESS' || flag === 1
}

// 失败判定：兼容字符串失败枚举与 cover 的 successFlag=3
function isTaskFailed(data) {
  const flag = data.status || data.successFlag
  if (flag === 3) return true
  if (typeof flag === 'string' && /FAILED|ERROR|EXCEPTION|SENSITIVE/.test(flag)) return true
  return false
}

/**
 * 查询任务详情（单次）。type 决定走哪个 record-info 接口。
 */
async function queryRecordInfo(api, baseUrl, apiKey, taskId, proxy, type) {
  const url = `${baseUrl}${getRecordInfoPath(type)}?taskId=${encodeURIComponent(taskId)}`
  return getJson(api, url, { headers: buildAuthHeader(apiKey), proxy, timeout: 30000 })
}

// ---------- 任务轮询 ----------

/**
 * 轮询任务直到 SUCCESS / FAILED，或超过 maxWaitMs。
 *
 * @param {object} opts - { api, baseUrl, apiKey, proxy, taskId, type, intervalMs, maxWaitMs, logger }
 * @returns {Promise<object>} Suno record-info 的 data 字段
 */
async function waitForTask(opts) {
  const {
    api,
    baseUrl,
    apiKey,
    proxy,
    taskId,
    type = 'generate',
    intervalMs = 15000,
    maxWaitMs = 600000,
    logger,
  } = opts

  const start = Date.now()
  let lastStatus = ''

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - start
    if (elapsed > maxWaitMs) {
      throw new Error(`轮询超时（${Math.round(maxWaitMs / 1000)}s），最后状态：${lastStatus || 'UNKNOWN'}，taskId=${taskId}`)
    }

    const resp = await queryRecordInfo(api, baseUrl, apiKey, taskId, proxy, type)
    if (resp.code !== 200) {
      throw new Error(`查询任务状态失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}`)
    }

    const data = resp.data || {}
    lastStatus = data.status || data.successFlag || ''

    if (logger) {
      logger.info(`Poll taskId=${taskId} type=${type} status=${lastStatus} elapsed=${Math.round(elapsed / 1000)}s`)
    }

    if (isTaskSuccess(data)) {
      return data
    }
    if (isTaskFailed(data)) {
      throw new Error(`任务失败：${data.errorMessage || data.error || lastStatus || 'unknown error'}`)
    }

    await sleep(intervalMs)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------- 鉴权与地址解析 ----------

function buildAuthHeader(apiKey) {
  if (!apiKey) throw new Error('缺少 apiKey（请在插件配置中设置 Suno API Key）')
  return { 'Authorization': `Bearer ${apiKey}` }
}

function resolveBaseUrl(args) {
  return args.baseUrl || _config.baseUrl || SUNO_BASE_URL
}

function resolveProxy(args) {
  return args.proxy || _config.httpProxy || ''
}

function resolveCallBackUrl(args) {
  return args.callBackUrl || _config.callBackUrl || ''
}

function resolveDefaultModel(args) {
  return args.model || _config.defaultModel || 'V4_5'
}

/**
 * 解析提交任务的 HTTP 超时（毫秒）。
 * 优先级：args.requestTimeout > config.requestTimeout > 默认 60s。
 * 同步应用到 ctx.api.postJson 的 options.timeout。
 */
function resolveRequestTimeout(args) {
  const fromArgs = Number(args?.requestTimeout)
  const fromCfg = Number(_config.requestTimeout)
  const sec = fromArgs > 0 ? fromArgs : fromCfg > 0 ? fromCfg : 60
  return sec * 1000
}

/**
 * 提交任务后，根据 args.wait 决定是否轮询到完成。
 * - wait=false（默认）：返回 { taskId, status, waited: false }
 * - wait=true：轮询，返回 { taskId, status:'SUCCESS', response, waited: true }
 */
async function maybeWait({ api, baseUrl, apiKey, proxy, taskId, type = 'generate', args, logger, t }) {
  const wait = args.wait === true || args.wait === 'true'
  if (!wait) {
    return {
      success: true,
      waited: false,
      taskId,
      status: 'GENERATING',
      message: t('message.taskSubmitted', 'Task submitted, taskId={taskId}').replace('{taskId}', taskId),
      data: { taskId, status: 'GENERATING' },
    }
  }

  const data = await waitForTask({
    api,
    baseUrl,
    apiKey,
    proxy,
    taskId,
    type,
    intervalMs: parseInt(args.pollInterval) > 0 ? parseInt(args.pollInterval) * 1000 : 15000,
    maxWaitMs: parseInt(args.maxWait) > 0 ? parseInt(args.maxWait) * 1000 : 600000,
    logger,
  })

  return {
    success: true,
    waited: true,
    taskId,
    status: data.status || data.successFlag,
    response: data.response,
    message: t('message.taskDone', 'Task completed, taskId={taskId}').replace('{taskId}', taskId),
    data: data.response || data,
  }
}

module.exports = {
  setConfig,
  postJson,
  getJson,
  queryRecordInfo,
  getRecordInfoPath,
  waitForTask,
  maybeWait,
  buildAuthHeader,
  resolveBaseUrl,
  resolveProxy,
  resolveCallBackUrl,
  resolveDefaultModel,
  resolveRequestTimeout,
}
