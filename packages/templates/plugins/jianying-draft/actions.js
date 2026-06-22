// ============================================================
// 剪映草稿导入插件 - 统一 Actions
// 对接 pyJianYingDraft 服务（默认 http://127.0.0.1:8000）
// 网络请求统一走 ctx.api（plugin-runtime-api 注入），不自行实现 HTTP
// ============================================================

const shared = require('./shared')
const {
  resolveApiBase,
  resolveTimeoutMs,
  resolveIntervalMs,
  pollTaskUntilDone,
  validatePresetData,
  buildSubmitPayload,
} = shared

// workflow 节点默认从插件配置读取：{{ __config__["workflow.jianying-draft"]["<key>"] }}
const CONFIG_PREFIX = '{{ __config__["workflow.jianying-draft"]'

module.exports = (t) => [
  // ─── 提交预设数据导入草稿（提交 + 轮询到完成）─────────
  {
    name: 'jianying_submit_draft',
    label: t('action.submit.label', 'Import JianYing Draft'),
    category: t('category', 'JianYing Draft'),
    icon: 'Film',
    description: t(
      'action.submit.description',
      'Submit preset data to pyJianYingDraft server and poll until the draft is generated',
    ),
    properties: [
      {
        key: 'preset_data',
        label: t('field.preset_data.label', 'Preset Data (JSON)'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.preset_data.tooltip', 'JianYing preset JSON string, must contain ruleGroup/materials/testData'),
      },
      {
        key: 'draft_title',
        label: t('field.draft_title.label', 'Draft Title'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.draft_title.tooltip', 'Custom draft title (optional, defaults to ruleGroup.title)'),
      },
      {
        key: 'apiBase',
        label: t('field.apiBase.label', 'API URL'),
        type: 'text',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["apiBase"]}}`,
        tooltip: t('field.apiBase.tooltip', 'pyJianYingDraft server base URL'),
      },
      {
        key: 'timeout',
        label: t('field.timeout.label', 'Timeout (s)'),
        type: 'number',
        dataType: 'number',
        default: `${CONFIG_PREFIX}["timeout"]}}`,
        tooltip: t('field.timeout.tooltip', 'Max seconds to wait for task completion'),
      },
      {
        key: 'interval',
        label: t('field.interval.label', 'Poll Interval (s)'),
        type: 'number',
        dataType: 'number',
        default: `${CONFIG_PREFIX}["interval"]}}`,
        tooltip: t('field.interval.tooltip', 'Seconds between status polls'),
      },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        preset_data: { type: 'string', description: '剪映草稿预设数据 JSON 字符串，需包含 ruleGroup、materials、testData' },
        draft_title: { type: 'string', description: '自定义草稿标题（可选，默认使用 ruleGroup.title）' },
        apiBase: { type: 'string', description: 'pyJianYingDraft 服务地址，默认 http://127.0.0.1:8000' },
        timeout: { type: 'number', description: '等待任务完成的超时秒数，默认 300' },
        interval: { type: 'number', description: '轮询间隔秒数，默认 3' },
      },
      required: ['preset_data'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'task_id', type: 'string' },
          { key: 'status', type: 'string' },
          { key: 'draft_path', type: 'string' },
          { key: 'progress', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      const apiBase = resolveApiBase(args)

      let parsed
      try {
        parsed = typeof args.preset_data === 'string' ? JSON.parse(args.preset_data) : args.preset_data
      } catch (e) {
        return { success: false, message: `preset_data JSON 解析失败: ${e.message}` }
      }
      const v = validatePresetData(parsed)
      if (!v.valid) return { success: false, message: `预设校验失败: ${v.error}` }

      const payload = buildSubmitPayload(parsed, args.draft_title)
      ctx.logger.info(
        `提交草稿任务: ${apiBase}/api/tasks/submit（规则 ${v.stats.rule_count} 条，素材 ${v.stats.material_count} 个）`,
      )

      let task
      try {
        task = await ctx.api.postJson(`${apiBase}/api/tasks/submit`, { body: payload, timeout: 60000 })
      } catch (e) {
        return { success: false, message: e.message }
      }
      if (!task.task_id) {
        return { success: false, message: task.message || '任务提交失败，未返回 task_id' }
      }

      let finalTask
      try {
        finalTask = await pollTaskUntilDone(ctx.api, apiBase, task.task_id, {
          timeoutMs: resolveTimeoutMs(args),
          intervalMs: resolveIntervalMs(args),
          logger: ctx.logger,
        })
      } catch (e) {
        const cur = e.task || {}
        return {
          success: false,
          message: e.message,
          data: {
            task_id: task.task_id,
            status: cur.status || 'unknown',
            draft_path: cur.draft_path,
            progress: cur.progress,
          },
        }
      }

      ctx.logger.info(`草稿生成完成: ${finalTask.draft_path}`)
      return {
        success: true,
        message: t('message.submitSuccess', 'Draft generated: {path}').replace(
          '{path}',
          finalTask.draft_path || finalTask.task_id,
        ),
        data: {
          task_id: finalTask.task_id,
          status: finalTask.status,
          draft_path: finalTask.draft_path,
          progress: finalTask.progress,
        },
      }
    },
  },

  // ─── 通过 URL 导入草稿 ─────────────────────────
  {
    name: 'jianying_submit_draft_by_url',
    label: t('action.submitByUrl.label', 'Import Draft by URL'),
    category: t('category', 'JianYing Draft'),
    icon: 'Link',
    description: t('action.submitByUrl.description', 'Fetch preset JSON from a URL and submit it to generate a JianYing draft'),
    properties: [
      {
        key: 'url',
        label: t('field.url.label', 'Preset JSON URL'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.url.tooltip', 'HTTP(S) URL returning a preset JSON object'),
      },
      {
        key: 'draft_title',
        label: t('field.draft_title.label', 'Draft Title'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.draft_title.tooltip', 'Custom draft title (optional)'),
      },
      {
        key: 'apiBase',
        label: t('field.apiBase.label', 'API URL'),
        type: 'text',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["apiBase"]}}`,
        tooltip: t('field.apiBase.tooltip', 'pyJianYingDraft server base URL'),
      },
      {
        key: 'timeout',
        label: t('field.timeout.label', 'Timeout (s)'),
        type: 'number',
        dataType: 'number',
        default: `${CONFIG_PREFIX}["timeout"]}}`,
        tooltip: t('field.timeout.tooltip', 'Max seconds to wait for task completion'),
      },
      {
        key: 'interval',
        label: t('field.interval.label', 'Poll Interval (s)'),
        type: 'number',
        dataType: 'number',
        default: `${CONFIG_PREFIX}["interval"]}}`,
        tooltip: t('field.interval.tooltip', 'Seconds between status polls'),
      },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '返回剪映预设 JSON 的 HTTP(S) 地址' },
        draft_title: { type: 'string', description: '自定义草稿标题（可选）' },
        apiBase: { type: 'string', description: 'pyJianYingDraft 服务地址，默认 http://127.0.0.1:8000' },
        timeout: { type: 'number', description: '超时秒数，默认 300' },
        interval: { type: 'number', description: '轮询间隔秒数，默认 3' },
      },
      required: ['url'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'task_id', type: 'string' },
          { key: 'status', type: 'string' },
          { key: 'draft_path', type: 'string' },
          { key: 'progress', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      const apiBase = resolveApiBase(args)
      if (!args.url) return { success: false, message: 'url 不能为空' }

      let parsed
      try {
        parsed = await ctx.api.fetchJson(args.url, { timeout: 60000 })
      } catch (e) {
        return { success: false, message: `获取 URL 内容失败: ${e.message}` }
      }
      const v = validatePresetData(parsed)
      if (!v.valid) return { success: false, message: `远程数据校验失败: ${v.error}` }

      const payload = buildSubmitPayload(parsed, args.draft_title)
      ctx.logger.info(`URL 预设校验通过（规则 ${v.stats.rule_count} 条），提交任务`)

      let task
      try {
        task = await ctx.api.postJson(`${apiBase}/api/tasks/submit`, { body: payload, timeout: 60000 })
      } catch (e) {
        return { success: false, message: e.message }
      }
      if (!task.task_id) return { success: false, message: task.message || '任务提交失败，未返回 task_id' }

      let finalTask
      try {
        finalTask = await pollTaskUntilDone(ctx.api, apiBase, task.task_id, {
          timeoutMs: resolveTimeoutMs(args),
          intervalMs: resolveIntervalMs(args),
          logger: ctx.logger,
        })
      } catch (e) {
        const cur = e.task || {}
        return {
          success: false,
          message: e.message,
          data: {
            task_id: task.task_id,
            status: cur.status || 'unknown',
            draft_path: cur.draft_path,
            progress: cur.progress,
          },
        }
      }

      ctx.logger.info(`草稿生成完成: ${finalTask.draft_path}`)
      return {
        success: true,
        message: t('message.submitSuccess', 'Draft generated: {path}').replace(
          '{path}',
          finalTask.draft_path || finalTask.task_id,
        ),
        data: {
          task_id: finalTask.task_id,
          status: finalTask.status,
          draft_path: finalTask.draft_path,
          progress: finalTask.progress,
        },
      }
    },
  },

  // ─── 查询任务结果 ─────────────────────────
  {
    name: 'jianying_get_task_result',
    label: t('action.getResult.label', 'Get Task Result'),
    category: t('category', 'JianYing Draft'),
    icon: 'Search',
    description: t('action.getResult.description', 'Query the current status of a JianYing draft generation task'),
    properties: [
      {
        key: 'task_id',
        label: t('field.task_id.label', 'Task ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.task_id.tooltip', 'Task ID returned by submit_draft'),
      },
      {
        key: 'apiBase',
        label: t('field.apiBase.label', 'API URL'),
        type: 'text',
        dataType: 'string',
        default: `${CONFIG_PREFIX}["apiBase"]}}`,
        tooltip: t('field.apiBase.tooltip', 'pyJianYingDraft server base URL'),
      },
    ],
    toolProperties: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '要查询的任务 ID' },
        apiBase: { type: 'string', description: 'pyJianYingDraft 服务地址，默认 http://127.0.0.1:8000' },
      },
      required: ['task_id'],
    },
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'task_id', type: 'string' },
          { key: 'status', type: 'string' },
          { key: 'draft_path', type: 'string' },
          { key: 'progress', type: 'object', dataType: 'object', children: [] },
          { key: 'error_message', type: 'string' },
          { key: 'completed_at', type: 'string' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.task_id) return { success: false, message: 'task_id 不能为空' }
      const apiBase = resolveApiBase(args)

      let task
      try {
        task = await ctx.api.fetchJson(`${apiBase}/api/tasks/${encodeURIComponent(args.task_id)}`, { timeout: 30000 })
      } catch (e) {
        return { success: false, message: e.message }
      }

      return {
        success: true,
        message: task.message || `任务状态: ${task.status}`,
        data: {
          task_id: task.task_id,
          status: task.status,
          draft_path: task.draft_path,
          progress: task.progress,
          error_message: task.error_message,
          completed_at: task.completed_at,
        },
      }
    },
  },

  // ─── 校验预设数据（仅 workflow 节点）─────────
  {
    name: 'jianying_validate_preset',
    label: t('action.validate.label', 'Validate Preset Data'),
    category: t('category', 'JianYing Draft'),
    icon: 'ShieldCheck',
    description: t('action.validate.description', 'Validate JianYing preset data structure locally without submitting'),
    tool: false,
    properties: [
      {
        key: 'preset_data',
        label: t('field.preset_data.label', 'Preset Data (JSON)'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.preset_data.tooltip', 'JianYing preset JSON string to validate'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'valid', type: 'boolean', dataType: 'boolean' },
          { key: 'error', type: 'string' },
          { key: 'stats', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      let parsed
      try {
        parsed = typeof args.preset_data === 'string' ? JSON.parse(args.preset_data) : args.preset_data
      } catch (e) {
        return { success: true, message: `JSON 解析失败: ${e.message}`, data: { valid: false, error: e.message, stats: {} } }
      }
      const v = validatePresetData(parsed)
      return {
        success: true,
        message: v.valid ? t('message.validateOk', 'Preset is valid') : `校验失败: ${v.error}`,
        data: { valid: v.valid, error: v.error || '', stats: v.stats || {} },
      }
    },
  },
]
