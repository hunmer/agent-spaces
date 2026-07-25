// Rembg 抠图插件动作定义
//
// 对接 D:\rembg\API.md 提供的 HTTP 服务：
//   - 从 URL / 本地文件 / data URI 去背景（自动判断输入类型）
//   - 仅生成黑白掩码
//   - 指定纯色背景（白底/红底等）
//   - Alpha Matting 精细抠图
//   - SAM 模型 + 点/框 prompt 精准分割
//   - 批量处理多张图片
//
// 结果统一通过 ctx.api.savePublicFile 落盘，返回 httpPath 供前端展示。

const {
  getBaseUrl,
  getModel,
  getTimeout,
  resolveImage,
  toImageArray,
  removeBackgroundFromUrl,
  removeBackgroundFromFile,
  saveResultImage,
} = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.rembg"]'

// ── 通用配置字段（追加到 workflow properties 与 tool 入参）────
function configProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'Rembg Base URL'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.baseUrl.tooltip', 'Rembg HTTP service URL, e.g. http://localhost:7000'),
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
    },
    {
      key: 'model',
      label: t('field.model.label', 'Model'),
      type: 'select',
      dataType: 'string',
      default: `${CONFIG_PREFIX}["model"]}}`,
      options: MODEL_OPTIONS,
      tooltip: t('field.model.tooltip', 'Segmentation model. sam requires extras prompt.'),
    },
    {
      key: 'timeout',
      label: t('field.timeout.label', 'Timeout (ms)'),
      type: 'number',
      dataType: 'number',
      default: `${CONFIG_PREFIX}["timeout"]}}`,
      tooltip: t('field.timeout.tooltip', 'Per-image processing timeout.'),
    },
  ]
}

// ── 模型下拉选项 ───────────────────────────────────────────
const MODEL_OPTIONS = [
  { label: 'u2net (默认·通用)', value: 'u2net' },
  { label: 'u2netp (轻量·快速)', value: 'u2netp' },
  { label: 'u2net_human_seg (人像)', value: 'u2net_human_seg' },
  { label: 'u2net_cloth_seg (服饰)', value: 'u2net_cloth_seg' },
  { label: 'silueta (通用·小体积)', value: 'silueta' },
  { label: 'isnet-general-use (通用·高精度)', value: 'isnet-general-use' },
  { label: 'isnet-anime (动漫角色)', value: 'isnet-anime' },
  { label: 'birefnet-general (通用·BiRefNet)', value: 'birefnet-general' },
  { label: 'birefnet-general-lite (通用·轻量)', value: 'birefnet-general-lite' },
  { label: 'birefnet-portrait (人像)', value: 'birefnet-portrait' },
  { label: 'birefnet-dis (二分图)', value: 'birefnet-dis' },
  { label: 'birefnet-hrsod (高分辨率显著性)', value: 'birefnet-hrsod' },
  { label: 'birefnet-cod (伪装目标)', value: 'birefnet-cod' },
  { label: 'birefnet-massive (大规模训练)', value: 'birefnet-massive' },
  { label: 'bria-rmbg (商业级)', value: 'bria-rmbg' },
  { label: 'sam (需 prompt 提示)', value: 'sam' },
]

// ── 通用输出 ───────────────────────────────────────────────
const imageOutput = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    dataType: 'object',
    children: [
      { key: 'imageUrl', type: 'string' },
      { key: 'size', type: 'number', dataType: 'number' },
      { key: 'model', type: 'string' },
    ],
  },
]

const batchOutput = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    dataType: 'object',
    children: [
      {
        key: 'results',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'input', type: 'string' },
          { key: 'success', type: 'boolean', dataType: 'boolean' },
          { key: 'imageUrl', type: 'string' },
          { key: 'error', type: 'string' },
        ],
      },
      { key: 'total', type: 'number', dataType: 'number' },
      { key: 'successCount', type: 'number', dataType: 'number' },
    ],
  },
]

// ── 内部：处理单张图片（输入可为 URL / 本地路径 / data URI）──
async function processOne(ctx, args, input) {
  const image = await resolveImage(input)
  const buffer = await removeBackgroundFromFile(ctx, args, image)
  const saved = saveResultImage(ctx, buffer, 'png')
  return { buffer, imageUrl: saved.httpPath, size: buffer.length }
}

module.exports = (t) => [
  // ── 动作 1：去背景（自适应输入）────────────────────────
  {
    name: 'rembg_remove',
    label: t('action.remove.label', 'Remove Background'),
    category: t('category', 'Rembg'),
    icon: 'Scissors',
    description: t(
      'action.remove.description',
      'Remove image background via Rembg. Input can be an image URL, local file path, or data URI.',
    ),
    properties: [
      {
        key: 'image',
        label: t('field.image.label', 'Image'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.image.tooltip', 'Image URL / local path / data URI'),
      },
      {
        key: 'backgroundColor',
        label: t('field.backgroundColor.label', 'Background Color'),
        type: 'text',
        dataType: 'string',
        tooltip: t(
          'field.backgroundColor.tooltip',
          'Optional solid background, e.g. "255,255,255,255" or "#FFFFFF". Empty = transparent.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const out = await processOne(ctx, args, args.image)
      return {
        success: true,
        message: t('message.removed', 'Background removed ({size} KB)').replace(
          '{size}',
          (out.size / 1024).toFixed(1),
        ),
        data: { imageUrl: out.imageUrl, size: out.size, model: getModel(args) },
      }
    },
  },

  // ── 动作 2：生成黑白掩码 ───────────────────────────────
  {
    name: 'rembg_mask',
    label: t('action.mask.label', 'Generate Mask'),
    category: t('category', 'Rembg'),
    icon: 'Contrast',
    description: t(
      'action.mask.description',
      'Generate a black/white mask (foreground=white) instead of a transparent PNG.',
    ),
    properties: [
      {
        key: 'image',
        label: t('field.image.label', 'Image'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.image.tooltip', 'Image URL / local path / data URI'),
      },
      {
        key: 'postProcessMask',
        label: t('field.postProcessMask.label', 'Post-process Mask'),
        type: 'checkbox',
        dataType: 'boolean',
        tooltip: t('field.postProcessMask.tooltip', 'Smooth / refine the mask edges.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const out = await processOne(ctx, { ...args, maskOnly: true }, args.image)
      return {
        success: true,
        message: t('message.maskGenerated', 'Mask generated ({size} KB)').replace(
          '{size}',
          (out.size / 1024).toFixed(1),
        ),
        data: { imageUrl: out.imageUrl, size: out.size, model: getModel(args) },
      }
    },
  },

  // ── 动作 3：Alpha Matting 精细抠图 ─────────────────────
  {
    name: 'rembg_alpha_matting',
    label: t('action.alphaMatting.label', 'Alpha Matting (Fine Cutout)'),
    category: t('category', 'Rembg'),
    icon: 'Sparkles',
    description: t(
      'action.alphaMatting.description',
      'Enable Alpha Matting for finer edge cutout. Slower than default mode.',
    ),
    properties: [
      {
        key: 'image',
        label: t('field.image.label', 'Image'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.image.tooltip', 'Image URL / local path / data URI'),
      },
      {
        key: 'af',
        label: t('field.af.label', 'Foreground Threshold'),
        type: 'number',
        dataType: 'number',
        default: 240,
        tooltip: t('field.af.tooltip', '0-255, default 240'),
      },
      {
        key: 'ab',
        label: t('field.ab.label', 'Background Threshold'),
        type: 'number',
        dataType: 'number',
        default: 10,
        tooltip: t('field.ab.tooltip', '0-255, default 10'),
      },
      {
        key: 'ae',
        label: t('field.ae.label', 'Erode Size'),
        type: 'number',
        dataType: 'number',
        default: 10,
        tooltip: t('field.ae.tooltip', '>=0, default 10'),
      },
      {
        key: 'backgroundColor',
        label: t('field.backgroundColor.label', 'Background Color'),
        type: 'text',
        dataType: 'string',
        tooltip: t(
          'field.backgroundColor.tooltip',
          'Optional solid background, e.g. "255,255,255,255" or "#FFFFFF". Empty = transparent.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const out = await processOne(ctx, { ...args, alphaMatting: true }, args.image)
      return {
        success: true,
        message: t('message.alphaMattingDone', 'Alpha matting done ({size} KB)').replace(
          '{size}',
          (out.size / 1024).toFixed(1),
        ),
        data: { imageUrl: out.imageUrl, size: out.size, model: getModel(args) },
      }
    },
  },

  // ── 动作 4：SAM 提示分割 ───────────────────────────────
  {
    name: 'rembg_sam_segment',
    label: t('action.sam.label', 'SAM Prompt Segment'),
    category: t('category', 'Rembg'),
    icon: 'Target',
    description: t(
      'action.sam.description',
      'Use the SAM model with point/box prompts to segment a specific target.',
    ),
    properties: [
      {
        key: 'image',
        label: t('field.image.label', 'Image'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.image.tooltip', 'Image URL / local path / data URI'),
      },
      {
        key: 'extras',
        label: t('field.extras.label', 'SAM Prompt (JSON)'),
        type: 'textarea',
        dataType: 'object',
        required: true,
        tooltip: t(
          'field.extras.tooltip',
          'JSON object, e.g. {"sam_prompt":[{"type":"point","data":[724,740],"label":1}]}',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      if (!args.extras) {
        return { success: false, message: t('message.needExtras', 'Provide SAM prompt in extras.') }
      }
      // SAM 必须使用 sam 模型
      const out = await processOne(ctx, { ...args, model: 'sam' }, args.image)
      return {
        success: true,
        message: t('message.samDone', 'SAM segmentation done ({size} KB)').replace(
          '{size}',
          (out.size / 1024).toFixed(1),
        ),
        data: { imageUrl: out.imageUrl, size: out.size, model: 'sam' },
      }
    },
  },

  // ── 动作 5：批量去背景 ─────────────────────────────────
  {
    name: 'rembg_batch_remove',
    label: t('action.batch.label', 'Batch Remove Background'),
    category: t('category', 'Rembg'),
    icon: 'Images',
    description: t(
      'action.batch.description',
      'Remove backgrounds from multiple images. Input is a JSON array of URLs / paths / data URIs.',
    ),
    properties: [
      {
        key: 'images',
        label: t('field.images.label', 'Image List'),
        type: 'textarea',
        dataType: 'string[]',
        required: true,
        tooltip: t('field.images.tooltip', 'JSON array, e.g. ["https://...", "/path/to/img.png"]'),
      },
      {
        key: 'backgroundColor',
        label: t('field.backgroundColor.label', 'Background Color'),
        type: 'text',
        dataType: 'string',
        tooltip: t(
          'field.backgroundColor.tooltip',
          'Optional solid background applied to all images.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: batchOutput,
    run: async (ctx, args) => {
      const list = toImageArray(args.images)
      if (!list.length) {
        return { success: false, message: t('message.needImages', 'Provide an image list.') }
      }
      const baseUrl = getBaseUrl(args)
      const model = getModel(args)
      ctx.logger.info(`Rembg batch: ${list.length} images, model=${model}, baseUrl=${baseUrl}`)

      const results = []
      let successCount = 0
      for (let i = 0; i < list.length; i++) {
        const input = list[i]
        try {
          const out = await processOne(ctx, args, input)
          results.push({ input, success: true, imageUrl: out.imageUrl })
          successCount++
        } catch (err) {
          ctx.logger.warning(`Rembg batch [${i + 1}/${list.length}] failed: ${err.message}`)
          results.push({ input, success: false, error: err.message })
        }
      }
      return {
        success: successCount > 0,
        message: t('message.batchDone', 'Batch done: {successCount}/{total} succeeded')
          .replace('{successCount}', successCount)
          .replace('{total}', list.length),
        data: { results, total: list.length, successCount },
      }
    },
  },
]
