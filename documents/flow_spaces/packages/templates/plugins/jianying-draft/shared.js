/**
 * 剪映草稿导入插件 - 共享工具
 *
 * 网络请求统一使用 ctx.api（由 plugin-runtime-api 注入），不自行实现 HTTP：
 *   ctx.api.postJson(url, { body, timeout })   POST JSON，返回解析后的 JSON
 *   ctx.api.fetchJson(url, { timeout })         GET，返回解析后的 JSON（别名 getJson）
 * 对接 pyJianYingDraft FastAPI 服务（默认 http://127.0.0.1:8000）
 *   POST /api/tasks/submit        提交 preset_data，返回 task_id
 *   GET  /api/tasks/{task_id}     查询任务状态与 draft_path
 */

const DEFAULT_API_BASE = 'http://127.0.0.1:8000'
const DEFAULT_TIMEOUT_SEC = 300
const DEFAULT_INTERVAL_SEC = 3

// ---------- Config ----------

let _config = {}

function setConfig(config) {
  _config = config || {}
}

function resolveApiBase(args) {
  return (args && args.apiBase) || _config.apiBase || DEFAULT_API_BASE
}

function resolveTimeoutMs(args) {
  const s = args && args.timeout != null ? args.timeout : _config.timeout != null ? _config.timeout : DEFAULT_TIMEOUT_SEC
  return Math.max(1, Number(s) || DEFAULT_TIMEOUT_SEC) * 1000
}

function resolveIntervalMs(args) {
  const s = args && args.interval != null ? args.interval : _config.interval != null ? _config.interval : DEFAULT_INTERVAL_SEC
  return Math.max(1, Number(s) || DEFAULT_INTERVAL_SEC) * 1000
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 轮询任务直到终态（completed/failed/cancelled）或超时
 * @param {object} api ctx.api
 * @returns {Promise<object>} completed 的 task（含 draft_path）
 */
async function pollTaskUntilDone(api, apiBase, taskId, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_SEC * 1000
  const intervalMs = opts.intervalMs || DEFAULT_INTERVAL_SEC * 1000
  const logger = opts.logger || console
  const url = `${apiBase}/api/tasks/${encodeURIComponent(taskId)}`
  const start = Date.now()

  for (;;) {
    const task = await api.fetchJson(url, { timeout: 30000 })
    const status = task.status
    logger.info(`[jianying-draft] 任务 ${taskId} 状态: ${status}${task.message ? ` - ${task.message}` : ''}`)

    if (status === 'completed') return task
    if (status === 'failed' || status === 'cancelled') {
      const err = new Error(task.error_message || `任务${status === 'failed' ? '失败' : '已取消'}: ${task.message || status}`)
      err.task = task
      throw err
    }
    if (Date.now() - start >= timeoutMs) {
      const err = new Error(
        `任务等待超时（${Math.round(timeoutMs / 1000)}秒），最后状态: ${status}。可用 get_task_result 继续查询 task_id=${taskId}`,
      )
      err.task = task
      err.timeout = true
      throw err
    }
    await sleep(intervalMs)
  }
}

// ---------- Preset 校验 ----------

/**
 * 校验剪映草稿 preset_data 结构（必需: ruleGroup / materials / testData）
 * @returns {{ valid: boolean, error?: string, stats?: object }}
 */
function validatePresetData(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'preset_data 必须是 JSON 对象' }
  }

  const required = ['ruleGroup', 'materials', 'testData']
  const missing = required.filter((f) => parsed[f] == null)
  if (missing.length) return { valid: false, error: `缺少必需字段: ${missing.join(', ')}` }

  const { ruleGroup, testData } = parsed
  if (typeof ruleGroup !== 'object' || ruleGroup === null) {
    return { valid: false, error: 'ruleGroup 必须是对象' }
  }
  if (!ruleGroup.id || !ruleGroup.title || !Array.isArray(ruleGroup.rules)) {
    return { valid: false, error: 'ruleGroup 需包含 id、title、rules 字段' }
  }
  if (!Array.isArray(parsed.materials)) {
    return { valid: false, error: 'materials 必须是数组' }
  }
  if (
    typeof testData !== 'object' ||
    testData === null ||
    !Array.isArray(testData.tracks) ||
    !Array.isArray(testData.items)
  ) {
    return { valid: false, error: 'testData 需包含 tracks 和 items 数组' }
  }
  if (parsed.segment_styles != null && (typeof parsed.segment_styles !== 'object' || Array.isArray(parsed.segment_styles))) {
    return { valid: false, error: 'segment_styles 必须是对象' }
  }
  for (const k of ['canvas_width', 'canvas_height', 'fps']) {
    if (parsed[k] != null && typeof parsed[k] !== 'number') {
      return { valid: false, error: `${k} 必须是数字` }
    }
  }
  if (parsed.raw_segments != null && !Array.isArray(parsed.raw_segments)) {
    return { valid: false, error: 'raw_segments 必须是数组' }
  }
  if (parsed.raw_materials != null && !Array.isArray(parsed.raw_materials)) {
    return { valid: false, error: 'raw_materials 必须是数组' }
  }
  if (parsed.draft_config != null && (typeof parsed.draft_config !== 'object' || Array.isArray(parsed.draft_config))) {
    return { valid: false, error: 'draft_config 必须是对象' }
  }

  return {
    valid: true,
    stats: {
      title: ruleGroup.title,
      rule_count: ruleGroup.rules.length,
      material_count: parsed.materials.length,
      track_count: testData.tracks.length,
      item_count: testData.items.length,
      has_raw_segments: !!(Array.isArray(parsed.raw_segments) && parsed.raw_segments.length),
      has_raw_materials: !!(Array.isArray(parsed.raw_materials) && parsed.raw_materials.length),
    },
  }
}

/**
 * 构造提交给 /api/tasks/submit 的载荷
 */
function buildSubmitPayload(parsed, draftTitle) {
  const payload = {
    ruleGroup: draftTitle ? { ...parsed.ruleGroup, title: draftTitle } : parsed.ruleGroup,
    materials: parsed.materials,
    testData: parsed.testData,
    segment_styles: parsed.segment_styles || {},
    raw_segments: parsed.raw_segments || [],
    raw_materials: parsed.raw_materials || [],
    draft_config: parsed.draft_config || {},
  }
  if (parsed.canvas_width != null) payload.canvas_width = parsed.canvas_width
  if (parsed.canvas_height != null) payload.canvas_height = parsed.canvas_height
  if (parsed.fps != null) payload.fps = parsed.fps
  return payload
}

module.exports = {
  setConfig,
  resolveApiBase,
  resolveTimeoutMs,
  resolveIntervalMs,
  sleep,
  pollTaskUntilDone,
  validatePresetData,
  buildSubmitPayload,
}
