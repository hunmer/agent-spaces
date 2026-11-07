const DEFAULT_BASE_URL = 'https://www.runninghub.cn'

/**
 * 解析服务地址，允许 args 覆盖默认值。
 */
function getBaseUrl(args) {
  return args.baseUrl || DEFAULT_BASE_URL
}

/**
 * 统一构造鉴权请求头。apiKey 缺失时抛错，由调用方转为失败结果。
 */
function getHeaders(args) {
  const apiKey = args.apiKey
  if (!apiKey) throw new Error('Missing RunningHub API Key')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
}

/**
 * 统一 POST JSON 封装：注入 apiKey 到 body（RunningHub 旧版接口要求 body 内带 apiKey）。
 * v2 接口 body 不需要 apiKey，但带上无害（服务端以 Header 鉴权为主）。
 *
 * @param {object} ctx      action 上下文
 * @param {object} args     节点入参（含 apiKey / baseUrl）
 * @param {string} path     接口路径，如 /task/openapi/create
 * @param {object} body     请求体（不含 apiKey，本函数自动注入）
 * @param {object} [opts]   { timeout } 默认 30s
 */
async function postJson(ctx, args, path, body, opts = {}) {
  const headers = getHeaders(args)
  const url = `${getBaseUrl(args)}${path}`
  const payload = { apiKey: args.apiKey, ...body }
  return ctx.api.postJson(url, {
    headers,
    body: payload,
    timeout: opts.timeout || 30000,
  })
}

/**
 * 查询任务结果（单次）。
 * 统一端点 /task/openapi/outputs，新旧两套任务体系通用。
 *
 * 返回标准化结构：
 *   - code 0    → success，data.outputs 已填充
 *   - code 804  → 运行中（success=false, pending=true）
 *   - code 813  → 排队中（success=false, pending=true）
 *   - code 805  → 失败（success=false）
 *   - 其它非 0  → 失败
 */
async function queryTaskOutputs(ctx, args, taskId) {
  const result = await postJson(ctx, args, '/task/openapi/outputs', { taskId }, { timeout: 30000 })
  const code = result.code
  const msg = result.msg || ''

  // 成功：data 是输出文件数组
  if (code === 0) {
    const list = Array.isArray(result.data) ? result.data : []
    const outputs = list.map((item) => ({
      url: item.fileUrl || item.url || '',
      type: item.fileType || item.outputType || '',
      nodeId: item.nodeId || '',
      taskCostTime: item.taskCostTime || '',
    }))
    const taskCostTime = outputs[0]?.taskCostTime || ''
    return {
      success: true,
      pending: false,
      code,
      msg,
      data: { outputs, taskCostTime, raw: result.data },
    }
  }

  // 运行中 / 排队中：data 通常是包含 netWssUrl 的对象或 null
  if (code === 804 || code === 813) {
    return {
      success: false,
      pending: true,
      code,
      msg,
      data: { netWssUrl: result.data?.netWssUrl || '', raw: result.data },
    }
  }

  // 失败：data 可能含 failedReason
  return {
    success: false,
    pending: false,
    code,
    msg,
    data: { failedReason: result.data?.failedReason || result.data, raw: result.data },
  }
}

/**
 * 轮询任务直到完成 / 失败 / 超时。
 * 新旧两套任务体系共用（提交后拿到 taskId 即可）。
 *
 * @param {object} ctx
 * @param {object} args                  节点入参（用于鉴权与 baseUrl）
 * @param {string} taskId
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=600000] 总超时，默认 10 分钟
 * @param {number} [opts.pollMs=5000]      轮询间隔，默认 5 秒
 * @param {function} [opts.t]              i18n t 函数
 */
async function pollTask(ctx, args, taskId, opts = {}) {
  const timeoutMs = opts.timeoutMs || 600000
  const pollMs = opts.pollMs || 5000
  const t = opts.t || ((k, f) => f || k)
  const deadline = Date.now() + timeoutMs

  ctx.logger.info(`任务轮询开始: taskId=${taskId}, 超时=${timeoutMs / 1000}s, 间隔=${pollMs / 1000}s`)

  let lastStatus = ''
  while (Date.now() < deadline) {
    let result
    try {
      result = await queryTaskOutputs(ctx, args, taskId)
    } catch (e) {
      ctx.logger.warn(`轮询查询异常: ${e.message}, ${pollMs / 1000}s 后重试`)
      await new Promise((r) => setTimeout(r, pollMs))
      continue
    }

    const statusLabel = result.pending ? (result.code === 813 ? 'QUEUED' : 'RUNNING') : 'DONE'
    if (statusLabel !== lastStatus) {
      ctx.logger.info(`任务状态: ${statusLabel} (code=${result.code})`)
      lastStatus = statusLabel
    }

    // 成功
    if (result.success) {
      ctx.logger.info(`任务完成: taskId=${taskId}, 输出数=${result.data.outputs.length}`)
      return {
        success: true,
        message: t('message.taskComplete', 'Task completed'),
        data: {
          taskId,
          outputs: result.data.outputs,
          taskCostTime: result.data.taskCostTime,
        },
      }
    }

    // 失败
    if (!result.pending) {
      const failedReason = result.data?.failedReason
      const errMsg = typeof failedReason === 'string'
        ? failedReason
        : (failedReason?.exception_message || result.msg || t('message.taskFailed', 'Task failed'))
      ctx.logger.warn(`任务失败: taskId=${taskId}, code=${result.code}, msg=${errMsg}`)
      return {
        success: false,
        message: t('message.taskFailedDetail', 'Task failed: {error} (code: {code})')
          .replace('{error}', errMsg)
          .replace('{code}', String(result.code)),
        data: { taskId, code: result.code, failedReason },
      }
    }

    // 仍运行中 / 排队中
    await new Promise((r) => setTimeout(r, pollMs))
  }

  ctx.logger.warn(`任务轮询超时: taskId=${taskId}`)
  return {
    success: false,
    message: t('message.taskTimeout', 'Task timed out after {timeout}s').replace(
      '{timeout}',
      String(timeoutMs / 1000),
    ),
    data: { taskId },
  }
}

/**
 * 按执行模式统一构造提交后结果。
 * - sync（默认）：自动轮询直到完成 / 失败 / 超时，返回最终输出
 * - async：仅提交任务，立即返回 taskId，不等待
 *
 * mode 不区分大小写，未提供或非 async 时按同步处理。
 */
async function runByMode(ctx, args, taskId, opts = {}) {
  const mode = String(args.mode || 'sync').toLowerCase()
  const t = opts.t || ((k, f) => f || k)

  // 异步模式：直接返回 taskId，交由调用方后续用「查询任务结果」节点轮询
  if (mode === 'async') {
    ctx.logger.info(`异步模式：跳过轮询，直接返回 taskId=${taskId}`)
    return {
      success: true,
      message: t('message.taskSubmitted', 'Task submitted, taskId: {taskId}').replace('{taskId}', taskId),
      data: { taskId, status: 'SUBMITTED', outputs: [], taskCostTime: '' },
    }
  }

  // 同步模式：自动轮询到底
  return pollTask(ctx, args, taskId, {
    t,
    timeoutMs: (Number(args.timeout) || 600) * 1000,
    pollMs: (Number(args.pollInterval) || 5) * 1000,
  })
}

module.exports = {
  DEFAULT_BASE_URL,
  getBaseUrl,
  getHeaders,
  postJson,
  queryTaskOutputs,
  pollTask,
  runByMode,
}
