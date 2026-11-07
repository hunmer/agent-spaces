const {
  getBaseUrl,
  getHeaders,
  postJson,
  queryTaskOutputs,
  runByMode,
} = require('./shared')

// 执行模式：sync 自动轮询到底；async 仅提交返回 taskId
const MODE_OPTIONS = [
  { label: '同步（自动等待结果）', value: 'sync' },
  { label: '异步（仅返回 taskId）', value: 'async' },
]

// ============================================================
// 模型清单：value 即 /openapi/v2/ 下的路径片段
// 路径来源于 RunningHub 官方 API 文档各模型接口的 URL
// ============================================================

// 图生视频模型（image-to-video）
const IMAGE_TO_VIDEO_MODELS = [
  // --- Vidu ---
  { label: 'Vidu 图生视频 q2-pro', value: 'vidu/image-to-video-q2-pro' },
  { label: 'Vidu 图生视频 q2-turbo', value: 'vidu/image-to-video-q2-turbo' },
  { label: 'Vidu 图生视频 q2-pro-fast', value: 'vidu/image-to-video-q2-pro-fast' },
  { label: 'Vidu 图生视频 q3-turbo', value: 'vidu/image-to-video-q3-turbo' },
  { label: 'Vidu 图生视频 q3-pro', value: 'vidu/image-to-video-q3-pro' },
  { label: 'Vidu 首尾帧生视频 q2-pro', value: 'vidu/first-last-frame-q2-pro' },
  { label: 'Vidu 首尾帧生视频 q2-turbo', value: 'vidu/first-last-frame-q2-turbo' },
  { label: 'Vidu 首尾帧生视频 q2-pro-fast', value: 'vidu/first-last-frame-q2-pro-fast' },
  { label: 'Vidu 首尾帧生视频 q3-pro', value: 'vidu/first-last-frame-q3-pro' },
  { label: 'Vidu 首尾帧生视频 q3-turbo', value: 'vidu/first-last-frame-q3-turbo' },
  // --- 可灵 ---
  { label: '可灵 图生视频 o1', value: 'kling/image-to-video-o1' },
  { label: '可灵 首尾帧生视频 o1', value: 'kling/first-last-frame-o1' },
  { label: '可灵 图生视频 2.5-turbo-std', value: 'kling/image-to-video-2.5-turbo-std' },
  { label: '可灵 图生视频 2.5-turbo-pro', value: 'kling/image-to-video-2.5-turbo-pro' },
  { label: '可灵 图生视频 2.6-pro', value: 'kling/image-to-video-2.6-pro' },
  { label: '可灵 图生视频 3.0-pro', value: 'kling/image-to-video-3.0-pro' },
  { label: '可灵 图生视频 3.0-std', value: 'kling/image-to-video-3.0-std' },
  { label: '可灵 图生视频 o3-pro', value: 'kling/image-to-video-o3-pro' },
  { label: '可灵 图生视频 o3-std', value: 'kling/image-to-video-o3-std' },
  { label: '可灵 图生视频 o3-4k', value: 'kling/image-to-video-o3-4k' },
  { label: '可灵 图生视频 v3-4k', value: 'kling/image-to-video-v3-4k' },
  { label: '可灵 elements (元素锁定)', value: 'kling/elements' },
  // --- 海螺 (MiniMax) ---
  { label: '海螺 02 标准', value: 'hailuo/02-standard' },
  { label: '海螺 02 图生视频 标准', value: 'hailuo/02-image-to-video-standard' },
  { label: '海螺 02 图生视频 pro', value: 'hailuo/02-image-to-video-pro' },
  { label: '海螺 02 fast', value: 'hailuo/02-fast' },
  { label: '海螺 2.3 图生视频 标准', value: 'hailuo/2.3-image-to-video-standard' },
  { label: '海螺 2.3 图生视频 pro', value: 'hailuo/2.3-image-to-video-pro' },
  { label: '海螺 2.3 fast 图生视频', value: 'hailuo/2.3-fast-image-to-video' },
  { label: '海螺 2.3 fast-pro 图生视频', value: 'hailuo/2.3-fast-pro-image-to-video' },
  // --- 万相 ---
  { label: '万相 2.2 图生视频', value: 'wan/2.2-image-to-video' },
  { label: '万相 2.2 首尾帧生视频', value: 'wan/2.2-first-last-frame' },
  { label: '万相 2.5 Preview 图生视频', value: 'wan/2.5-preview-image-to-video' },
  { label: '万相 2.6 图生视频', value: 'wan/2.6-image-to-video' },
  { label: '万相 2.6 图生视频 Flash', value: 'wan/2.6-image-to-video-flash' },
  { label: '万相 2.7 图生视频', value: 'wan/2.7-image-to-video' },
  // --- seedance ---
  { label: 'seedance v1.5-pro 图生视频', value: 'seedance/v1.5-pro-image-to-video' },
  { label: 'seedance v1.5-pro 图生视频 fast', value: 'seedance/v1.5-pro-image-to-video-fast' },
  { label: 'seedance 2.0 图生视频', value: 'seedance/2.0-image-to-video' },
  { label: 'seedance 2.0 Fast 图生视频', value: 'seedance/2.0-fast-image-to-video' },
  // --- 全能视频 ---
  { label: '全能视频 V3.1 Lite 图生视频', value: 'omnivideo/v3.1-lite-image-to-video' },
  { label: '全能视频 V3.1 pro 图生视频', value: 'omnivideo/v3.1-pro-image-to-video' },
  { label: '全能视频 V3.1 fast 图生视频', value: 'omnivideo/v3.1-fast-image-to-video' },
  { label: '全能视频 V3.1 pro 首尾帧', value: 'omnivideo/v3.1-pro-first-last-frame' },
  { label: '全能视频 V3.1 fast 首尾帧', value: 'omnivideo/v3.1-fast-first-last-frame' },
  { label: '全能视频 S 图生视频', value: 'omnivideo/s-image-to-video' },
  { label: '全能视频 S 图生视频 pro', value: 'omnivideo/s-image-to-video-pro' },
  { label: '全能视频 S 文生视频 pro', value: 'omnivideo/s-text-to-video-pro' },
  { label: '全能视频 X 图生视频', value: 'omnivideo/x-image-to-video' },
  // --- 其他 ---
  { label: '悠船 图生视频', value: 'youchuan/image-to-video' },
  { label: 'PixVerse V6 图生视频', value: 'pixverse/v6-image-to-video' },
  { label: 'ltx 2.3 图生视频', value: 'ltx/2.3-image-to-video' },
  { label: 'ltx 2.3 图生视频 LoRA', value: 'ltx/2.3-image-to-video-lora' },
  { label: 'happyhorse 1.0 图生视频', value: 'happyhorse/1.0-image-to-video' },
  { label: 'SkyReels V4 图生视频 fast', value: 'skyreels/v4-image-to-video-fast' },
  { label: 'SkyReels V4 图生视频 std', value: 'skyreels/v4-image-to-video-std' },
]

// 参考生视频模型（reference-to-video）
const REFERENCE_TO_VIDEO_MODELS = [
  { label: '可灵 参考生视频 o1', value: 'kling/reference-to-video-o1' },
  { label: '可灵 参考生视频 o3-4k', value: 'kling/reference-to-video-o3-4k' },
  { label: 'kling-video o3-pro 参考生视频', value: 'kling-video-o3-pro/reference-to-video' },
  { label: 'kling-video o3-std 参考生视频', value: 'kling-video-o3-std/reference-to-video' },
  { label: 'Vidu 参考生视频 q2', value: 'vidu/reference-to-video-q2' },
  { label: 'Vidu 参考生视频 q3', value: 'vidu/reference-to-video-q3' },
  { label: 'Vidu 参考生视频 q3-mix', value: 'vidu/reference-to-video-q3-mix' },
  { label: '万相 2.6 参考生视频', value: 'wan/2.6-reference-to-video' },
  { label: '万相 2.6 参考生视频 Flash', value: 'wan/2.6-reference-to-video-flash' },
  { label: '万相 2.7 参考生视频', value: 'wan/2.7-reference-to-video' },
  { label: 'seedance 2.0 多模态视频', value: 'seedance/2.0-multimodal-video' },
  { label: 'seedance 2.0 Fast 多模态视频', value: 'seedance/2.0-fast-multimodal-video' },
  { label: 'seedance v1-lite 参考生视频', value: 'seedance/v1-lite-reference-to-video' },
  { label: 'happyhorse 1.0 参考生视频', value: 'happyhorse/1.0-reference-to-video' },
  { label: 'SkyReels V4 Omni 参考视频 fast', value: 'skyreels/v4-omni-reference-fast' },
]

// ============================================================
// 通用配置属性（apiKey / baseUrl），所有节点复用
// ============================================================
function commonProps(t) {
  return [
    {
      key: 'apiKey',
      label: t('field.apiKey.label', 'API Key'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.apiKey.tooltip', 'RunningHub API Key'),
      default: '{{ __config__["workflow.runninghub"]["apiKey"] }}',
    },
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'API URL'),
      type: 'text',
      dataType: 'string',
      default: '{{ __config__["workflow.runninghub"]["baseUrl"] }}',
    },
  ]
}

// 提交类节点共用的「执行模式」属性：sync 自动轮询 / async 仅返回 taskId
// 同时用于 workflow properties 和 tool toolProperties。
function modeProp(t) {
  return {
    key: 'mode',
    label: t('field.mode.label', 'Execution Mode'),
    type: 'select',
    dataType: 'string',
    default: 'sync',
    options: MODE_OPTIONS,
    tooltip: t('field.mode.tooltip', 'Sync: auto-poll until done. Async: return taskId immediately, query later via the Query Task Outputs node.'),
    description: '执行模式: sync(默认,自动轮询直到完成)/async(仅提交返回taskId)',
  }
}

// 解析可能是 JSON 字符串的数组/对象入参（防御式）
function parseMaybeJson(val, fallback) {
  if (val == null) return fallback
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(val)
  } catch {
    return fallback
  }
}

module.exports = (t) => {
  const CATEGORY = t('category', 'RunningHub')

  // ============================================================
  // 1. 发起 ComfyUI 任务（高级版）
  // ============================================================
  const comfyuiCreate = {
    name: 'runninghub_comfyui_create',
    label: t('action.comfyuiCreate.label', 'Run ComfyUI Workflow'),
    category: CATEGORY,
    icon: 'Workflow',
    description: t('action.comfyuiCreate.description', 'Submit a ComfyUI workflow task with node parameter overrides, then auto-poll until completion.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'workflowId', type: 'string', description: '工作流 ID', required: true },
      { key: 'nodeInfoList', type: 'string', description: '节点参数覆盖列表 JSON 数组，如 [{"nodeId":"6","fieldName":"text","fieldValue":"1 girl"}]' },
      { key: 'accessPassword', type: 'string', description: '加密工作流访问密码' },
      { key: 'webhookUrl', type: 'string', description: '任务完成回调 URL' },
      { key: 'instanceType', type: 'string', description: '实例类型: default(24g)/plus(48g)' },
      { key: 'retainSeconds', type: 'number', description: '保留秒数(企业共享Key,10-180),减少冷启动' },
      { key: 'mode', type: 'string', description: '执行模式: sync(默认,自动轮询直到完成)/async(仅提交返回taskId)' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'workflowId', label: t('field.workflowId.label', 'Workflow ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.workflowId.tooltip', 'Workflow template ID, obtainable from the platform') },
      { key: 'nodeInfoList', label: t('field.nodeInfoList.label', 'Node Overrides'), type: 'array', dataType: 'object[]', tooltip: t('field.nodeInfoList.tooltip', 'Override default node parameters before execution'), fields: [
        { key: 'nodeId', label: 'Node ID', type: 'text', dataType: 'string' },
        { key: 'fieldName', label: 'Field Name', type: 'text', dataType: 'string' },
        { key: 'fieldValue', label: 'Field Value', type: 'text', dataType: 'string' },
      ] },
      { key: 'accessPassword', label: t('field.accessPassword.label', 'Access Password'), type: 'text', dataType: 'string', tooltip: t('field.accessPassword.tooltip', 'Password for encrypted workflows') },
      { key: 'webhookUrl', label: t('field.webhookUrl.label', 'Webhook URL'), type: 'text', dataType: 'string', tooltip: t('field.webhookUrl.tooltip', 'Callback URL when task completes') },
      { key: 'instanceType', label: t('field.instanceType.label', 'Instance Type'), type: 'select', dataType: 'string', default: 'default', options: [
        { label: t('option.instance.default', 'default (24g VRAM)'), value: 'default' },
        { label: t('option.instance.plus', 'plus (48g VRAM)'), value: 'plus' },
      ] },
      { key: 'retainSeconds', label: t('field.retainSeconds.label', 'Retain Seconds'), type: 'number', dataType: 'number', tooltip: t('field.retainSeconds.tooltip', 'Enterprise shared key only, 10-180s, reduces cold start') },
      modeProp(t),
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'taskId', type: 'string' },
        { key: 'outputs', type: 'string' },
        { key: 'taskCostTime', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const nodeInfoList = parseMaybeJson(args.nodeInfoList, [])
      const body = {
        workflowId: args.workflowId,
        ...(Array.isArray(nodeInfoList) && nodeInfoList.length > 0 && { nodeInfoList }),
        ...(args.accessPassword && { accessPassword: args.accessPassword }),
        ...(args.webhookUrl && { webhookUrl: args.webhookUrl }),
        ...(args.instanceType && args.instanceType !== 'default' && { instanceType: args.instanceType }),
        ...(args.retainSeconds && { retainSeconds: Number(args.retainSeconds) }),
      }

      ctx.logger.info(`ComfyUI 任务提交: workflowId=${args.workflowId}, 节点覆盖数=${nodeInfoList?.length || 0}`)
      const result = await postJson(ctx, args, '/task/openapi/create', body, { timeout: 30000 })

      if (result.code !== 0) {
        return { success: false, message: t('message.submitFailed', 'Submit failed: {error} (code: {code})').replace('{error}', result.msg).replace('{code}', String(result.code)) }
      }

      const taskId = result.data?.taskId
      ctx.logger.info(`ComfyUI 任务已创建: taskId=${taskId}, mode=${args.mode || 'sync'}`)
      return runByMode(ctx, args, taskId, { t })
    },
  }

  // ============================================================
  // 2. 发起 AI 应用任务
  // ============================================================
  const aiappRun = {
    name: 'runninghub_aiapp_run',
    label: t('action.aiappRun.label', 'Run AI App'),
    category: CATEGORY,
    icon: 'Bot',
    description: t('action.aiappRun.description', 'Submit an AI App (WebApp) task with nodeInfoList overrides, then auto-poll until completion.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'webappId', type: 'number', description: 'AI 应用 ID (webappId)', required: true },
      { key: 'nodeInfoList', type: 'string', description: '节点信息列表 JSON 数组，如 [{"nodeId":"122","fieldName":"prompt","fieldValue":"..."}]' },
      { key: 'accessPassword', type: 'string', description: 'AI 应用加密访问密码' },
      { key: 'instanceType', type: 'string', description: '实例类型: default/plus' },
      { key: 'webhookUrl', type: 'string', description: '任务完成回调 URL' },
      { key: 'mode', type: 'string', description: '执行模式: sync(默认,自动轮询直到完成)/async(仅提交返回taskId)' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'webappId', label: t('field.webappId.label', 'AI App ID'), type: 'number', dataType: 'number', required: true, tooltip: t('field.webappId.tooltip', 'AI App ID, the trailing number in the ai-detail URL') },
      { key: 'nodeInfoList', label: t('field.nodeInfoList.label', 'Node Info List'), type: 'array', dataType: 'object[]', required: true, tooltip: t('field.nodeInfoList.aiapp.tooltip', 'Node inputs, obtainable from the AI App detail page'), fields: [
        { key: 'nodeId', label: 'Node ID', type: 'text', dataType: 'string' },
        { key: 'fieldName', label: 'Field Name', type: 'text', dataType: 'string' },
        { key: 'fieldValue', label: 'Field Value', type: 'text', dataType: 'string' },
      ] },
      { key: 'accessPassword', label: t('field.accessPassword.label', 'Access Password'), type: 'text', dataType: 'string' },
      { key: 'instanceType', label: t('field.instanceType.label', 'Instance Type'), type: 'select', dataType: 'string', default: 'default', options: [
        { label: t('option.instance.default', 'default (24g VRAM)'), value: 'default' },
        { label: t('option.instance.plus', 'plus (48g VRAM)'), value: 'plus' },
      ] },
      { key: 'webhookUrl', label: t('field.webhookUrl.label', 'Webhook URL'), type: 'text', dataType: 'string' },
      modeProp(t),
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'taskId', type: 'string' },
        { key: 'outputs', type: 'string' },
        { key: 'taskCostTime', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const nodeInfoList = parseMaybeJson(args.nodeInfoList, [])
      if (!Array.isArray(nodeInfoList) || nodeInfoList.length === 0) {
        return { success: false, message: t('message.nodeInfoListRequired', 'nodeInfoList is required') }
      }
      const body = {
        webappId: Number(args.webappId),
        nodeInfoList,
        ...(args.accessPassword && { accessPassword: args.accessPassword }),
        ...(args.instanceType && args.instanceType !== 'default' && { instanceType: args.instanceType }),
        ...(args.webhookUrl && { webhookUrl: args.webhookUrl }),
      }

      ctx.logger.info(`AI 应用任务提交: webappId=${body.webappId}, 节点数=${nodeInfoList.length}`)
      const result = await postJson(ctx, args, '/task/openapi/ai-app/run', body, { timeout: 30000 })

      if (result.code !== 0) {
        return { success: false, message: t('message.submitFailed', 'Submit failed: {error} (code: {code})').replace('{error}', result.msg).replace('{code}', String(result.code)) }
      }

      const taskId = result.data?.taskId
      ctx.logger.info(`AI 应用任务已创建: taskId=${taskId}, mode=${args.mode || 'sync'}`)
      return runByMode(ctx, args, taskId, { t })
    },
  }

  // ============================================================
  // 3. 查询任务结果（单次，不轮询）
  // ============================================================
  const taskOutputs = {
    name: 'runninghub_task_outputs',
    label: t('action.taskOutputs.label', 'Query Task Outputs'),
    category: CATEGORY,
    icon: 'Search',
    description: t('action.taskOutputs.description', 'Query a single task status and outputs by taskId (does not auto-poll). Status codes: 0=success, 804=running, 813=queued, 805=failed.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'taskId', type: 'string', description: '任务 ID', required: true },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'taskId', label: t('field.taskId.label', 'Task ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.taskId.tooltip', 'Task ID returned when submitting the task') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'code', type: 'number', dataType: 'number' },
        { key: 'status', type: 'string' },
        { key: 'outputs', type: 'string' },
        { key: 'taskCostTime', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      ctx.logger.info(`查询任务结果: taskId=${args.taskId}`)
      const result = await queryTaskOutputs(ctx, args, args.taskId)

      const statusMap = { 0: 'SUCCESS', 804: 'RUNNING', 813: 'QUEUED', 805: 'FAILED' }
      const status = result.pending ? (result.code === 813 ? 'QUEUED' : 'RUNNING') : (statusMap[result.code] || 'UNKNOWN')

      return {
        success: result.success,
        message: result.success
          ? t('message.querySuccess', 'Task completed, {count} output(s)').replace('{count}', String(result.data.outputs?.length || 0))
          : (result.pending ? t('message.queryPending', 'Task {status} (code: {code})').replace('{status}', status).replace('{code}', String(result.code)) : result.msg),
        data: {
          code: result.code,
          status,
          outputs: result.data.outputs || [],
          taskCostTime: result.data.taskCostTime || '',
          failedReason: result.data.failedReason,
        },
      }
    },
  }

  // ============================================================
  // 4. 取消任务
  // ============================================================
  const taskCancel = {
    name: 'runninghub_task_cancel',
    label: t('action.taskCancel.label', 'Cancel Task'),
    category: CATEGORY,
    icon: 'XCircle',
    description: t('action.taskCancel.description', 'Cancel a running or queued task by taskId.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'taskId', type: 'string', description: '任务 ID', required: true },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'taskId', label: t('field.taskId.label', 'Task ID'), type: 'text', dataType: 'string', required: true },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      ctx.logger.info(`取消任务: taskId=${args.taskId}`)
      const result = await postJson(ctx, args, '/task/openapi/cancel', { taskId: args.taskId }, { timeout: 30000 })

      if (result.code !== 0) {
        return { success: false, message: t('message.cancelFailed', 'Cancel failed: {error} (code: {code})').replace('{error}', result.msg).replace('{code}', String(result.code)) }
      }
      return { success: true, message: t('message.cancelSuccess', 'Task cancelled') }
    },
  }

  // ============================================================
  // 5. 获取公共模型列表
  // ============================================================
  const resourceList = {
    name: 'runninghub_resource_list',
    label: t('action.resourceList.label', 'List Public Models'),
    category: CATEGORY,
    icon: 'List',
    description: t('action.resourceList.description', 'Query public model list (UNET/CHECKPOINT/LORA/GGUF) with filtering and pagination.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'resourceType', type: 'string', description: '模型类型: UNET/CHECKPOINT/LORA/GGUF' },
      { key: 'resourceName', type: 'string', description: '模型名称关键词' },
      { key: 'current', type: 'number', description: '页码，默认 1' },
      { key: 'size', type: 'number', description: '每页条数(1-50)，默认 10' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'resourceType', label: t('field.resourceType.label', 'Resource Type'), type: 'select', dataType: 'string', default: 'UNET', options: [
        { label: 'UNET', value: 'UNET' },
        { label: 'CHECKPOINT', value: 'CHECKPOINT' },
        { label: 'LORA', value: 'LORA' },
        { label: 'GGUF', value: 'GGUF' },
      ] },
      { key: 'resourceName', label: t('field.resourceName.label', 'Name Keyword'), type: 'text', dataType: 'string', tooltip: t('field.resourceName.tooltip', 'Model name keyword filter') },
      { key: 'current', label: t('field.current.label', 'Page'), type: 'number', dataType: 'number', default: 1 },
      { key: 'size', label: t('field.size.label', 'Page Size'), type: 'number', dataType: 'number', default: 10, tooltip: t('field.size.tooltip', '1-50') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'total', type: 'number', dataType: 'number' },
        { key: 'pages', type: 'number', dataType: 'number' },
        { key: 'current', type: 'number', dataType: 'number' },
        { key: 'records', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const body = {
        resourceType: args.resourceType || 'UNET',
        ...(args.resourceName && { resourceName: args.resourceName }),
        current: Number(args.current) || 1,
        size: Number(args.size) || 10,
      }

      ctx.logger.info(`查询模型列表: type=${body.resourceType}, page=${body.current}, size=${body.size}`)
      // 此接口 body 不需要 apiKey（用 Header 鉴权），但 postJson 会注入，无害
      const headers = getHeaders(args)
      const url = `${getBaseUrl(args)}/openapi/v2/resource/list`
      const result = await ctx.api.postJson(url, { headers, body, timeout: 30000 })

      if (result.code !== 0) {
        return { success: false, message: t('message.listFailed', 'List failed: {error} (code: {code})').replace('{error}', result.msg).replace('{code}', String(result.code)) }
      }

      const d = result.data || {}
      ctx.logger.info(`模型列表返回: total=${d.total}, records=${d.records?.length || 0}`)
      return {
        success: true,
        message: t('message.listSuccess', 'Found {total} models').replace('{total}', String(d.total || 0)),
        data: {
          total: d.total || 0,
          pages: d.pages || 0,
          current: d.current || body.current,
          hasNext: d.hasNext,
          records: d.records || [],
        },
      }
    },
  }

  // ============================================================
  // 6. 获取工作流 JSON
  // ============================================================
  const workflowJson = {
    name: 'runninghub_workflow_json',
    label: t('action.workflowJson.label', 'Get Workflow JSON'),
    category: CATEGORY,
    icon: 'FileJson',
    description: t('action.workflowJson.description', 'Retrieve the ComfyUI prompt JSON of a workflow by workflowId.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'workflowId', type: 'string', description: '工作流 ID', required: true },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'workflowId', label: t('field.workflowId.label', 'Workflow ID'), type: 'text', dataType: 'string', required: true },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'prompt', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      ctx.logger.info(`获取工作流 JSON: workflowId=${args.workflowId}`)
      const result = await postJson(ctx, args, '/task/openapi/getJsonApiFormat', { workflowId: args.workflowId }, { timeout: 30000 })

      if (result.code !== 0) {
        return { success: false, message: t('message.jsonFailed', 'Get JSON failed: {error} (code: {code})').replace('{error}', result.msg).replace('{code}', String(result.code)) }
      }
      return {
        success: true,
        message: t('message.jsonSuccess', 'Workflow JSON retrieved'),
        data: { prompt: result.data?.prompt || '' },
      }
    },
  }

  // ============================================================
  // 7. 图生视频（模型聚合）
  // ============================================================
  const imageToVideo = {
    name: 'runninghub_image_to_video',
    label: t('action.imageToVideo.label', 'Image to Video'),
    category: CATEGORY,
    icon: 'Clapperboard',
    description: t('action.imageToVideo.description', 'Generate video from an image using RunningHub model API. Aggregates 60+ model variants (Kling/Hailuo/Vidu/Wan/seedance/SkyReels etc.). Auto-polls until completion.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'model', type: 'string', description: '模型路径，如 vidu/image-to-video-q2-pro / kling/image-to-video-o3-pro / hailuo/2.3-image-to-video-pro 等', required: true },
      { key: 'prompt', type: 'string', description: '视频描述提示词', required: true },
      { key: 'imageUrl', type: 'string', description: '首帧图片 URL（部分首尾帧模型可改用 firstFrameUrl/lastFrameUrl）', required: true },
      { key: 'duration', type: 'string', description: '时长(秒)，常用 4/5/6/8/10' },
      { key: 'resolution', type: 'string', description: '分辨率: 540p/720p/1080p' },
      { key: 'aspectRatio', type: 'string', description: '画幅: 16:9/9:16/4:3/3:4/1:1' },
      { key: 'movementAmplitude', type: 'string', description: '运动幅度: auto/small/medium/large' },
      { key: 'bgm', type: 'boolean', description: '是否生成背景音乐' },
      { key: 'mode', type: 'string', description: '执行模式: sync(默认,自动轮询直到完成)/async(仅提交返回taskId)' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', dataType: 'string', required: true, default: 'vidu/image-to-video-q2-pro', options: IMAGE_TO_VIDEO_MODELS, tooltip: t('field.model.i2v.tooltip', 'Pick a model variant; the value is the API path under /openapi/v2/') },
      { key: 'prompt', label: t('field.prompt.label', 'Prompt'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.prompt.i2v.tooltip', 'Video description, supports camera commands') },
      { key: 'imageUrl', label: t('field.imageUrl.label', 'Image URL'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.imageUrl.tooltip', 'First frame image URL (JPG/PNG)') },
      { key: 'duration', label: t('field.duration.label', 'Duration (sec)'), type: 'text', dataType: 'string', default: '5', tooltip: t('field.duration.tooltip', 'Varies by model, common values: 4/5/6/8/10') },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', dataType: 'string', default: '720p', options: [
        { label: '540p', value: '540p' },
        { label: t('option.resolution.720p.default', '720p (default)'), value: '720p' },
        { label: '1080p', value: '1080p' },
      ] },
      { key: 'aspectRatio', label: t('field.aspectRatio.label', 'Aspect Ratio'), type: 'select', dataType: 'string', default: '16:9', options: [
        { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }, { label: '1:1', value: '1:1' },
      ] },
      { key: 'movementAmplitude', label: t('field.movementAmplitude.label', 'Movement Amplitude'), type: 'select', dataType: 'string', default: 'auto', options: [
        { label: t('option.movement.auto', 'auto (default)'), value: 'auto' },
        { label: 'small', value: 'small' }, { label: 'medium', value: 'medium' }, { label: 'large', value: 'large' },
      ] },
      { key: 'bgm', label: t('field.bgm.label', 'BGM'), type: 'select', dataType: 'string', default: 'true', options: [
        { label: t('field.yesDefault.label', 'Yes (default)'), value: 'true' }, { label: t('field.no.label', 'No'), value: 'false' },
      ] },
      modeProp(t),
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'taskId', type: 'string' },
        { key: 'outputs', type: 'string' },
        { key: 'taskCostTime', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const modelPath = args.model
      if (!modelPath) return { success: false, message: t('message.modelRequired', 'Model is required') }

      const body = {
        prompt: args.prompt || '',
        imageUrl: args.imageUrl,
        duration: String(args.duration || '5'),
        resolution: args.resolution || '720p',
        movementAmplitude: args.movementAmplitude || 'auto',
        bgm: args.bgm !== 'false',
        ...(args.aspectRatio && { aspectRatio: args.aspectRatio }),
      }

      const url = `${getBaseUrl(args)}/openapi/v2/${modelPath}`
      const headers = getHeaders(args)
      ctx.logger.info(`图生视频提交: model=${modelPath}, resolution=${body.resolution}, duration=${body.duration}s`)
      const result = await ctx.api.postJson(url, { headers, body, timeout: 30000 })

      // v2 接口返回：成功直接含 taskId（同步返回 RUNNING/QUEUED），失败有 errorCode/errorMessage
      const taskId = result.taskId || result.data?.taskId
      if (!taskId) {
        const errMsg = result.errorMessage || result.msg || t('message.submitFailed.v2', 'Submit failed')
        return { success: false, message: errMsg + (result.errorCode ? ` (code: ${result.errorCode})` : '') }
      }

      ctx.logger.info(`图生视频任务已创建: taskId=${taskId}, mode=${args.mode || 'sync'}`)
      return runByMode(ctx, args, taskId, { t })
    },
  }

  // ============================================================
  // 8. 参考生视频（模型聚合）
  // ============================================================
  const referenceToVideo = {
    name: 'runninghub_reference_to_video',
    label: t('action.referenceToVideo.label', 'Reference to Video'),
    category: CATEGORY,
    icon: 'Users',
    description: t('action.referenceToVideo.description', 'Generate video from reference image(s) using RunningHub model API. Aggregates 15+ variants (Kling/Vidu/Wan/seedance/SkyReels etc.). Auto-polls until completion.'),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: 'RunningHub API Key', required: true },
      { key: 'model', type: 'string', description: '模型路径，如 vidu/reference-to-video-q2 / kling/reference-to-video-o1 等', required: true },
      { key: 'prompt', type: 'string', description: '视频描述提示词', required: true },
      { key: 'imageUrls', type: 'string', description: '参考图 URL 列表 JSON 数组，如 ["https://..."]', required: true },
      { key: 'duration', type: 'string', description: '时长(秒)' },
      { key: 'resolution', type: 'string', description: '分辨率: 540p/720p/1080p' },
      { key: 'aspectRatio', type: 'string', description: '画幅: 16:9/9:16/4:3/3:4/1:1' },
      { key: 'movementAmplitude', type: 'string', description: '运动幅度: auto/small/medium/large' },
      { key: 'mode', type: 'string', description: '执行模式: sync(默认,自动轮询直到完成)/async(仅提交返回taskId)' },
      { key: 'baseUrl', type: 'string', description: 'API地址，默认 https://www.runninghub.cn' },
    ],
    properties: [
      ...commonProps(t),
      { key: 'model', label: t('field.model.label', 'Model'), type: 'select', dataType: 'string', required: true, default: 'vidu/reference-to-video-q2', options: REFERENCE_TO_VIDEO_MODELS },
      { key: 'prompt', label: t('field.prompt.label', 'Prompt'), type: 'textarea', dataType: 'string', required: true },
      { key: 'imageUrls', label: t('field.imageUrls.label', 'Reference Image URLs'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.imageUrls.tooltip', 'JSON array of reference image URLs, e.g. ["https://..."]. Most models support up to 7.') },
      { key: 'duration', label: t('field.duration.label', 'Duration (sec)'), type: 'text', dataType: 'string', default: '5' },
      { key: 'resolution', label: t('field.resolution.label', 'Resolution'), type: 'select', dataType: 'string', default: '720p', options: [
        { label: '540p', value: '540p' },
        { label: t('option.resolution.720p.default', '720p (default)'), value: '720p' },
        { label: '1080p', value: '1080p' },
      ] },
      { key: 'aspectRatio', label: t('field.aspectRatio.label', 'Aspect Ratio'), type: 'select', dataType: 'string', default: '16:9', options: [
        { label: '16:9', value: '16:9' }, { label: '9:16', value: '9:16' },
        { label: '4:3', value: '4:3' }, { label: '3:4', value: '3:4' }, { label: '1:1', value: '1:1' },
      ] },
      { key: 'movementAmplitude', label: t('field.movementAmplitude.label', 'Movement Amplitude'), type: 'select', dataType: 'string', default: 'auto', options: [
        { label: t('option.movement.auto', 'auto (default)'), value: 'auto' },
        { label: 'small', value: 'small' }, { label: 'medium', value: 'medium' }, { label: 'large', value: 'large' },
      ] },
      modeProp(t),
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'taskId', type: 'string' },
        { key: 'outputs', type: 'string' },
        { key: 'taskCostTime', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const modelPath = args.model
      if (!modelPath) return { success: false, message: t('message.modelRequired', 'Model is required') }

      const imageUrls = parseMaybeJson(args.imageUrls, [])
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        return { success: false, message: t('message.imageUrlsRequired', 'imageUrls is required') }
      }

      const body = {
        prompt: args.prompt || '',
        imageUrls,
        duration: String(args.duration || '5'),
        resolution: args.resolution || '720p',
        aspectRatio: args.aspectRatio || '16:9',
        movementAmplitude: args.movementAmplitude || 'auto',
      }

      const url = `${getBaseUrl(args)}/openapi/v2/${modelPath}`
      const headers = getHeaders(args)
      ctx.logger.info(`参考生视频提交: model=${modelPath}, 参考图数=${imageUrls.length}`)
      const result = await ctx.api.postJson(url, { headers, body, timeout: 30000 })

      const taskId = result.taskId || result.data?.taskId
      if (!taskId) {
        const errMsg = result.errorMessage || result.msg || t('message.submitFailed.v2', 'Submit failed')
        return { success: false, message: errMsg + (result.errorCode ? ` (code: ${result.errorCode})` : '') }
      }

      ctx.logger.info(`参考生视频任务已创建: taskId=${taskId}, mode=${args.mode || 'sync'}`)
      return runByMode(ctx, args, taskId, { t })
    },
  }

  return [
    comfyuiCreate,
    aiappRun,
    taskOutputs,
    taskCancel,
    resourceList,
    workflowJson,
    imageToVideo,
    referenceToVideo,
  ]
}
