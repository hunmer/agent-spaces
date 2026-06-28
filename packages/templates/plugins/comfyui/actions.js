const {
  comfyGet,
  comfyPost,
  submitPrompt,
  pollHistory,
  extractOutputFiles,
  viewUrl,
  uploadImage,
  asObject,
} = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.comfyui"]'

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

function createConfigProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: 'Server URL',
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.baseUrl.tooltip', 'ComfyUI server address, e.g. http://127.0.0.1:8188'),
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
    },
    {
      key: 'timeout',
      label: 'Timeout (ms)',
      type: 'number',
      dataType: 'number',
      tooltip: t('field.timeout.tooltip', 'Max polling time for a single task (ms).'),
      default: `${CONFIG_PREFIX}["timeout"]}}`,
    },
    {
      key: 'auth',
      label: 'Auth (optional)',
      type: 'textarea',
      dataType: 'object',
      tooltip: t('field.auth.tooltip', 'Optional. JSON object like {"type":"bearer","token":"..."} or {"type":"basic","username":"...","password":"..."}.'),
      toolRequired: false,
    },
  ]
}

// 列出 ComfyUI 的对象存储目录（object_info / model 列表）
async function listObjectInfo(ctx, args, { nodeClass } = {}) {
  const info = await comfyGet(ctx, args, '/object_info' + (nodeClass ? `/${encodeURIComponent(nodeClass)}` : ''))
  return info
}

module.exports = (t) => {
  const configProperties = createConfigProperties(t)

  return [
    // ─── 1. 运行工作流并取输出 ─────────────────────────────
    {
      name: 'comfy_run_workflow',
      label: t('action.run.label', 'Run Workflow'),
      category: t('category', 'ComfyUI'),
      icon: 'Workflow',
      description: t('action.run.description', 'Submit a ComfyUI API-format workflow, poll until done, and return output files. Optionally override inputs at given node paths.'),
      properties: [
        {
          key: 'prompt',
          label: t('field.prompt.label', 'Workflow (API JSON)'),
          type: 'code',
          dataType: 'object',
          required: true,
          tooltip: t('field.prompt.tooltip', 'ComfyUI "Save (API Format)" JSON, an object keyed by node id. String or object accepted.'),
        },
        {
          key: 'overrides',
          label: t('field.overrides.label', 'Input Overrides'),
          type: 'textarea',
          dataType: 'object',
          tooltip: t('field.overrides.tooltip', 'Optional. Object like {"6.inputs.text":"...","3.inputs.seed":42} applied to the prompt before submit.'),
        },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'promptId', type: 'string' },
          { key: 'files', type: 'object', dataType: 'object', children: [] },
          { key: 'images', type: 'image[]' },
          { key: 'status', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        const prompt = asObject(args.prompt)
        if (!prompt || typeof prompt !== 'object') {
          return { success: false, message: t('message.needPrompt', 'A valid ComfyUI API-format workflow (object) is required.') }
        }

        // 应用 overrides：支持 "nodeId.inputs.key" 或 "nodeId.inputs.key" 路径写法
        const overrides = asObject(args.overrides)
        if (overrides && typeof overrides === 'object') {
          for (const [pathStr, value] of Object.entries(overrides)) {
            const segs = String(pathStr).split('.')
            let node = prompt
            // 第一段是 node id
            if (!prompt[segs[0]]) {
              ctx.logger.warning(`override target node not found: ${segs[0]}`)
              continue
            }
            let cur = prompt[segs[0]]
            for (let i = 1; i < segs.length; i++) {
              const key = segs[i]
              if (i === segs.length - 1) {
                cur[key] = value
              } else {
                cur[key] = cur[key] || {}
                cur = cur[key]
              }
            }
            ctx.logger.info(`override applied: ${pathStr}`)
          }
        }

        // 提交 + 轮询
        const submitted = await submitPrompt(ctx, args, prompt)
        const entry = await pollHistory(ctx, args, submitted.prompt_id)
        const files = extractOutputFiles(entry).map((f) => ({
          ...f,
          url: viewUrl(args, f),
        }))
        const images = files
          .filter((f) => f.kind === 'image' || f.kind === 'gif')
          .map((f) => f.url)

        ctx.logger.info(`workflow done, ${files.length} output file(s), ${images.length} image(s)`)
        return {
          success: true,
          message: t('message.runDone', 'Workflow finished, {count} file(s) ({imgs} image)').replace('{count}', files.length).replace('{imgs}', images.length),
          data: {
            promptId: submitted.prompt_id,
            files,
            images,
            status: entry.status || {},
          },
        }
      },
    },

    // ─── 2. 上传图片到 input 目录 ──────────────────────────
    {
      name: 'comfy_upload_image',
      label: t('action.upload.label', 'Upload Image'),
      category: t('category', 'ComfyUI'),
      icon: 'Upload',
      description: t('action.upload.description', 'Upload a local image to ComfyUI (default input folder) so it can be referenced by LoadImage nodes.'),
      properties: [
        { key: 'filePath', label: 'File Path', type: 'text', dataType: 'string', required: true, tooltip: t('field.filePath.tooltip', 'Local image file path to upload.') },
        {
          key: 'type',
          label: t('field.uploadType.label', 'Target Folder'),
          type: 'select',
          dataType: 'string',
          default: 'input',
          options: [
            { label: 'input', value: 'input' },
            { label: 'temp', value: 'temp' },
            { label: 'output', value: 'output' },
          ],
          tooltip: t('field.uploadType.tooltip', 'ComfyUI upload folder.'),
        },
        { key: 'subfolder', label: 'Subfolder', type: 'text', dataType: 'string', tooltip: t('field.subfolder.tooltip', 'Optional subfolder under the target folder.') },
        { key: 'overwrite', label: 'Overwrite', type: 'checkbox', dataType: 'boolean', default: false },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'name', type: 'string' },
          { key: 'subfolder', type: 'string' },
          { key: 'type', type: 'string' },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.filePath) return { success: false, message: t('message.needFilePath', 'File path required.') }
        const result = await uploadImage(ctx, args, args.filePath, {
          type: args.type || 'input',
          subfolder: args.subfolder || '',
          overwrite: !!args.overwrite,
        })
        const fullName = result.subfolder ? `${result.subfolder}/${result.name}` : result.name
        ctx.logger.info(`uploaded as ${fullName} (type=${result.type})`)
        return {
          success: true,
          message: t('message.uploaded', 'Uploaded: {name}').replace('{name}', fullName),
          data: result,
        }
      },
    },

    // ─── 3. 系统状态 ───────────────────────────────────────
    {
      name: 'comfy_system_stats',
      label: t('action.systemStats.label', 'System Stats'),
      category: t('category', 'ComfyUI'),
      icon: 'Cpu',
      description: t('action.systemStats.description', 'Get ComfyUI system statistics (devices, CPU/GPU, etc.).'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching system stats')
        const stats = await comfyGet(ctx, args, '/system_stats')
        return { success: true, message: t('message.statsFetched', 'System stats fetched'), data: stats }
      },
    },

    // ─── 4. 队列状态 ───────────────────────────────────────
    {
      name: 'comfy_get_queue',
      label: t('action.queue.label', 'Queue Status'),
      category: t('category', 'ComfyUI'),
      icon: 'ListOrdered',
      description: t('action.queue.description', 'Get current ComfyUI queue (running + pending).'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'queue_running', type: 'object', dataType: 'object', children: [] },
          { key: 'queue_pending', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        const q = await comfyGet(ctx, args, '/queue')
        return { success: true, message: t('message.queueFetched', 'Queue fetched'), data: q }
      },
    },

    // ─── 5. 中断当前任务 ───────────────────────────────────
    {
      name: 'comfy_interrupt',
      label: t('action.interrupt.label', 'Interrupt'),
      category: t('category', 'ComfyUI'),
      icon: 'OctagonX',
      description: t('action.interrupt.description', 'Interrupt the currently running ComfyUI task.'),
      properties: [],
      configProperties,
      outputs: commonOutputs,
      tool: false,
      run: async (ctx, args) => {
        ctx.logger.info('Sending interrupt')
        await comfyPost(ctx, args, '/interrupt', {})
        return { success: true, message: t('message.interrupted', 'Interrupt signal sent') }
      },
    },

    // ─── 6. 列出模型 / 节点输入选项 ───────────────────────
    {
      name: 'comfy_list_models',
      label: t('action.listModels.label', 'List Models / Nodes'),
      category: t('category', 'ComfyUI'),
      icon: 'Boxes',
      description: t('action.listModels.description', 'List available model files for a given node class input (e.g. CheckpointLoaderSimple), or all object_info when nodeClass is empty.'),
      properties: [
        {
          key: 'nodeClass',
          label: 'Node Class',
          type: 'text',
          dataType: 'string',
          tooltip: t('field.nodeClass.tooltip', 'ComfyUI node class, e.g. CheckpointLoaderSimple, LoraLoader, VAELoader. Leave empty to return all.'),
        },
        {
          key: 'inputKey',
          label: 'Input Key',
          type: 'text',
          dataType: 'string',
          default: 'ckpt_name',
          tooltip: t('field.inputKey.tooltip', 'Input name under the node to read available values. Default ckpt_name.'),
        },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'models', type: 'string[]' },
        ] },
      ],
      run: async (ctx, args) => {
        const nodeClass = (args.nodeClass || '').trim()
        if (!nodeClass) {
          const info = await listObjectInfo(ctx, args, {})
          const classes = Object.keys(info || {})
          return { success: true, message: t('message.nodesCount', 'Found {count} node classes').replace('{count}', classes.length), data: { models: classes } }
        }
        const info = await listObjectInfo(ctx, args, { nodeClass })
        const node = info && info[nodeClass]
        if (!node) {
          return { success: false, message: t('message.nodeNotFound', 'Node class not found: {name}').replace('{name}', nodeClass) }
        }
        const inputs = (node.input && node.input.required) || {}
        // 优先按指定 inputKey 取，否则取第一个列表型输入
        let models = []
        const wantedKey = args.inputKey || 'ckpt_name'
        if (inputs[wantedKey]) {
          models = inputs[wantedKey][0]
        } else {
          for (const list of Object.values(inputs)) {
            if (Array.isArray(list) && Array.isArray(list[0])) { models = list[0]; break }
          }
        }
        models = Array.isArray(models) ? models : []
        return { success: true, message: t('message.modelsCount', 'Found {count} item(s)').replace('{count}', models.length), data: { models } }
      },
    },

    // ─── 7. 查询历史 ───────────────────────────────────────
    {
      name: 'comfy_get_history',
      label: t('action.history.label', 'Get History'),
      category: t('category', 'ComfyUI'),
      icon: 'History',
      description: t('action.history.description', 'Get ComfyUI execution history. Pass a prompt_id for a specific task, or leave empty for recent items.'),
      properties: [
        { key: 'promptId', label: 'Prompt ID', type: 'text', dataType: 'string', tooltip: t('field.promptId.tooltip', 'Optional. Specific prompt_id. Leave empty for recent history (max_items applies).') },
        { key: 'maxItems', label: 'Max Items', type: 'number', dataType: 'number', default: 10, tooltip: t('field.maxItems.tooltip', 'Number of recent items when promptId is empty.') },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [] },
      ],
      run: async (ctx, args) => {
        let res
        if (args.promptId) {
          res = await comfyGet(ctx, args, `/history/${encodeURIComponent(args.promptId)}`)
        } else {
          res = await comfyGet(ctx, args, '/history', { max_items: Number(args.maxItems) > 0 ? Number(args.maxItems) : 10 })
        }
        const ids = Object.keys(res || {})
        return { success: true, message: t('message.historyFetched', 'History fetched ({count})').replace('{count}', ids.length), data: res }
      },
    },
  ]
}
