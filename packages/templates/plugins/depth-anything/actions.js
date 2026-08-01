// Depth Anything 深度估计插件动作定义
//
// 对接 G:\Depth-Anything\API.md 提供的 HTTP 服务：
//   - 单图深度估计（灰度图 / 彩色热力图，仅深度图 / 原图+深度图拼接）
//   - 批量处理多张图片
//
// 结果统一通过 ctx.api.savePublicFile 落盘，返回 httpPath 供前端展示。

const {
  getBaseUrl,
  getTimeout,
  resolveImage,
  toImageArray,
  predictFromFile,
  predictBatchFromFiles,
  parseZip,
  saveResultImage,
  MAX_BATCH_FILES,
} = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.depth-anything"]'

// ── 通用配置字段（追加到 workflow properties 与 tool 入参）────
function configProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'Depth Anything Base URL'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.baseUrl.tooltip', 'Depth Anything HTTP service URL, e.g. http://localhost:7860'),
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
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
      { key: 'savedAs', type: 'string' },
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
          { key: 'filename', type: 'string' },
          { key: 'error', type: 'string' },
        ],
      },
      { key: 'total', type: 'number', dataType: 'number' },
      { key: 'successCount', type: 'number', dataType: 'number' },
    ],
  },
]

// ── 输出模式选项 ───────────────────────────────────────────
const GRAYSCALE_OPTIONS = [
  { label: '灰度图（默认）', value: 'true' },
  { label: '彩色热力图 Inferno', value: 'false' },
]

const PRED_ONLY_OPTIONS = [
  { label: '仅深度图（默认）', value: 'true' },
  { label: '原图 + 深度图（左右拼接）', value: 'false' },
]

// ── 内部：处理单张图片（输入可为 URL / 本地路径 / data URI）──
async function processOne(ctx, args, input) {
  const image = await resolveImage(input)
  const { buffer, savedAs } = await predictFromFile(ctx, args, image)
  const saved = saveResultImage(ctx, buffer, 'png')
  return { buffer, imageUrl: saved.httpPath, savedAs }
}

module.exports = (t) => [
  // ── 动作 1：单图深度估计 ───────────────────────────────
  {
    name: 'depth_predict',
    label: t('action.predict.label', 'Depth Estimation'),
    category: t('category', 'Depth Anything'),
    icon: 'Mountain',
    description: t(
      'action.predict.description',
      'Estimate monocular depth from a single image. Input can be an image URL, local file path, or data URI.',
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
        key: 'grayscale',
        label: t('field.grayscale.label', 'Color Mode'),
        type: 'select',
        dataType: 'string',
        default: 'true',
        options: GRAYSCALE_OPTIONS,
        tooltip: t(
          'field.grayscale.tooltip',
          'true = grayscale depth map (default); false = Inferno colormap.',
        ),
      },
      {
        key: 'pred_only',
        label: t('field.predOnly.label', 'Output Mode'),
        type: 'select',
        dataType: 'string',
        default: 'true',
        options: PRED_ONLY_OPTIONS,
        tooltip: t(
          'field.predOnly.tooltip',
          'true = depth map only (default); false = original + depth side by side.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      // select 控件值为字符串，归一化成布尔
      const normArgs = {
        ...args,
        grayscale: String(args.grayscale) !== 'false',
        pred_only: String(args.pred_only) !== 'false',
      }
      const out = await processOne(ctx, normArgs, args.image)
      return {
        success: true,
        message: t('message.predicted', 'Depth map generated ({size} KB)').replace(
          '{size}',
          (out.buffer.length / 1024).toFixed(1),
        ),
        data: { imageUrl: out.imageUrl, size: out.buffer.length, savedAs: out.savedAs },
      }
    },
  },

  // ── 动作 2：批量深度估计 ───────────────────────────────
  {
    name: 'depth_batch_predict',
    label: t('action.batch.label', 'Batch Depth Estimation'),
    category: t('category', 'Depth Anything'),
    icon: 'Images',
    description: t(
      'action.batch.description',
      'Estimate depth from multiple images. Input is a JSON array of URLs / paths / data URIs.',
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
        key: 'grayscale',
        label: t('field.grayscale.label', 'Color Mode'),
        type: 'select',
        dataType: 'string',
        default: 'true',
        options: GRAYSCALE_OPTIONS,
        tooltip: t(
          'field.grayscale.tooltip',
          'true = grayscale depth map (default); false = Inferno colormap.',
        ),
      },
      {
        key: 'pred_only',
        label: t('field.predOnly.label', 'Output Mode'),
        type: 'select',
        dataType: 'string',
        default: 'true',
        options: PRED_ONLY_OPTIONS,
        tooltip: t(
          'field.predOnly.tooltip',
          'true = depth map only (default); false = original + depth side by side.',
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
      ctx.logger.info(`Depth Anything batch: ${list.length} images, baseUrl=${baseUrl}`)

      const normArgs = {
        ...args,
        grayscale: String(args.grayscale) !== 'false',
        pred_only: String(args.pred_only) !== 'false',
      }

      // 阶段 1：解析所有输入为 buffer（URL/路径/data URI）
      const inputs = []
      for (let i = 0; i < list.length; i++) {
        const input = list[i]
        try {
          const image = await resolveImage(input)
          inputs.push({ input, image })
        } catch (err) {
          ctx.logger.warning(`Depth Anything batch resolve [${i + 1}/${list.length}] failed: ${err.message}`)
          inputs.push({ input, error: err.message })
        }
      }

      // 阶段 2：对解析成功的图片按 MAX_BATCH_FILES 分批调用 /predict/batch
      const okInputs = inputs.filter((x) => x.image)
      const failed = inputs.filter((x) => x.error)
      const results = failed.map((x) => ({ input: x.input, success: false, error: x.error }))
      let successCount = 0

      for (let i = 0; i < okInputs.length; i += MAX_BATCH_FILES) {
        const chunk = okInputs.slice(i, i + MAX_BATCH_FILES)
        try {
          const zipBuffer = await predictBatchFromFiles(
            ctx,
            normArgs,
            chunk.map((x) => x.image),
          )
          const files = parseZip(zipBuffer)
          ctx.logger.info(
            `Depth Anything batch zip: ${files.length} entries for ${chunk.length} inputs`,
          )
          // ZIP 内文件名：{原文件名去扩展名}_depth.png；按下标顺序对应
          for (let j = 0; j < chunk.length; j++) {
            const { input } = chunk[j]
            const file = files[j]
            if (!file) {
              results.push({ input, success: false, error: 'No result entry in zip' })
              continue
            }
            try {
              const saved = saveResultImage(ctx, file.buffer, 'png')
              results.push({ input, success: true, imageUrl: saved.httpPath, filename: file.name })
              successCount++
            } catch (err) {
              results.push({ input, success: false, error: err.message })
            }
          }
        } catch (err) {
          ctx.logger.warning(
            `Depth Anything batch [${i + 1}-${i + chunk.length}/${okInputs.length}] failed: ${err.message}`,
          )
          for (const { input } of chunk) {
            results.push({ input, success: false, error: err.message })
          }
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
