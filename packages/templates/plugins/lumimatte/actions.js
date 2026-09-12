// LumiMatte 插件动作定义
//
// 对接 G:\LumiMatte-main\lumi-matte-server\API.md 提供的本地离线推理服务：
//   - AI 智能抠图（ISNet，人像/发丝/商品/宠物）
//   - 智能局部消除（LaMa，涂抹遮罩区域无痕修复）
//   - 画质超分放大（2x/4x，零色偏 + 面部增强）
//   - PSD 分层工程导出（原生 8BPS）
//   - 服务健康检查 / 已安装模型清单
//
// 结果统一通过 ctx.api.savePublicFile 落盘，返回 httpPath 供前端展示。

const {
  resolveImage,
  toDataUrl,
  requestJson,
  processImage,
  saveResultFile,
  toLayerArray,
  toImageArray,
} = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.lumimatte"]'

// ── 通用配置字段（追加到 workflow properties 与 tool 入参）────
function configProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'LumiMatte Base URL'),
      type: 'text',
      dataType: 'string',
      required: true,
      tooltip: t('field.baseUrl.tooltip', 'LumiMatte HTTP service URL, e.g. http://127.0.0.1:8317'),
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
    },
    {
      key: 'timeout',
      label: t('field.timeout.label', 'Timeout (ms)'),
      type: 'number',
      dataType: 'number',
      default: `${CONFIG_PREFIX}["timeout"]}}`,
      tooltip: t(
        'field.timeout.tooltip',
        'Per-request timeout. First call per engine loads the model (10-30s).',
      ),
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
      { key: 'model', type: 'string' },
      { key: 'durationMs', type: 'number', dataType: 'number' },
    ],
  },
]

const psdOutput = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    dataType: 'object',
    children: [
      { key: 'fileUrl', type: 'string' },
      { key: 'filename', type: 'string' },
      { key: 'sizeBytes', type: 'number', dataType: 'number' },
      { key: 'layerCount', type: 'number', dataType: 'number' },
      { key: 'width', type: 'number', dataType: 'number' },
      { key: 'height', type: 'number', dataType: 'number' },
    ],
  },
]

const statusOutput = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    dataType: 'object',
    children: [
      { key: 'status', type: 'string' },
      { key: 'version', type: 'string' },
      { key: 'accel', type: 'string' },
      { key: 'platform', type: 'string' },
      { key: 'python', type: 'string' },
      { key: 'modelsDir', type: 'string' },
    ],
  },
]

const modelsOutput = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    dataType: 'object',
    children: [
      { key: 'count', type: 'number', dataType: 'number' },
      {
        key: 'models',
        type: 'object',
        dataType: 'object[]',
        children: [
          { key: 'file', type: 'string' },
          { key: 'sizeBytes', type: 'number', dataType: 'number' },
        ],
      },
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
        dataType: 'object[]',
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
async function mattingOne(ctx, args, input) {
  const img = await resolveImage(input)
  const out = await processImage(ctx, args, '/api/process/matting', {
    imageData: toDataUrl(img.buffer, img.mime),
  })
  const saved = saveResultFile(ctx, out.buffer, out.ext)
  return { size: out.buffer.length, model: out.meta.model, durationMs: out.meta.durationMs, imageUrl: saved.httpPath }
}

module.exports = (t) => [
  // ── 动作 1：AI 智能抠图 ─────────────────────────────────
  {
    name: 'lumimatte_matting',
    label: t('action.matting.label', 'AI Matting'),
    category: t('category', 'LumiMatte'),
    icon: 'Scissors',
    description: t(
      'action.matting.description',
      'AI matting via ISNet: output a transparent PNG with alpha channel. Best for portraits, hair, products and pets.',
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
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const out = await mattingOne(ctx, args, args.image)
      return {
        success: true,
        message: t('message.mattingDone', 'Matting done ({size} KB, {ms} ms)')
          .replace('{size}', (out.size / 1024).toFixed(1))
          .replace('{ms}', out.durationMs ?? '-'),
        data: { imageUrl: out.imageUrl, size: out.size, model: out.model, durationMs: out.durationMs },
      }
    },
  },

  // ── 动作 2：智能局部消除 ─────────────────────────────────
  {
    name: 'lumimatte_inpaint',
    label: t('action.inpaint.label', 'Inpaint (Object Removal)'),
    category: t('category', 'LumiMatte'),
    icon: 'Eraser',
    description: t(
      'action.inpaint.description',
      'Erase masked regions (passersby, watermarks, flaws) via LaMa with context-aware inpainting. White = remove, black = keep; mask must match image size.',
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
        key: 'mask',
        label: t('field.mask.label', 'Mask Image'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t(
          'field.mask.tooltip',
          'Mask image URL / path / data URI. White = area to remove, black = keep. Must match the image size.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      if (!args.mask) {
        return { success: false, message: t('message.needMask', 'Provide a mask image.') }
      }
      const img = await resolveImage(args.image)
      const mask = await resolveImage(args.mask)
      const out = await processImage(ctx, args, '/api/process/inpaint', {
        imageData: toDataUrl(img.buffer, img.mime),
        maskData: toDataUrl(mask.buffer, mask.mime),
      })
      const saved = saveResultFile(ctx, out.buffer, out.ext)
      return {
        success: true,
        message: t('message.inpaintDone', 'Inpaint done ({size} KB, {ms} ms)')
          .replace('{size}', (out.buffer.length / 1024).toFixed(1))
          .replace('{ms}', out.meta.durationMs ?? '-'),
        data: {
          imageUrl: saved.httpPath,
          size: out.buffer.length,
          model: out.meta.model,
          durationMs: out.meta.durationMs,
        },
      }
    },
  },

  // ── 动作 3：画质超分放大 ─────────────────────────────────
  {
    name: 'lumimatte_super_res',
    label: t('action.superRes.label', 'Super Resolution'),
    category: t('category', 'LumiMatte'),
    icon: 'ZoomIn',
    description: t(
      'action.superRes.description',
      'Upscale image 2x/4x with zero color shift (Lanczos base + Real-ESRGAN detail, multiplicative luminance). Optional face enhance and denoise.',
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
        key: 'scale',
        label: t('field.scale.label', 'Scale'),
        type: 'select',
        dataType: 'number',
        default: 2,
        options: [
          { label: '2x', value: 2 },
          { label: '4x', value: 4 },
        ],
        tooltip: t('field.scale.tooltip', 'Upscale factor, default 2.'),
      },
      {
        key: 'denoiseLevel',
        label: t('field.denoiseLevel.label', 'Denoise Level'),
        type: 'number',
        dataType: 'number',
        default: 0.5,
        tooltip: t('field.denoiseLevel.tooltip', 'Denoise strength 0-1, default 0.5.'),
      },
      {
        key: 'faceEnhance',
        label: t('field.faceEnhance.label', 'Face Enhance'),
        type: 'checkbox',
        dataType: 'boolean',
        default: true,
        tooltip: t('field.faceEnhance.tooltip', 'Enhance faces, default on.'),
      },
      {
        key: 'tileSize',
        label: t('field.tileSize.label', 'Tile Size'),
        type: 'number',
        dataType: 'number',
        default: 256,
        tooltip: t('field.tileSize.tooltip', 'Tiled inference size, default 256.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: imageOutput,
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const img = await resolveImage(args.image)
      const scale = Number(args.scale) === 4 ? 4 : Number(args.scale) === 2 ? 2 : Number(args.scale) || 2
      const options = {
        scale,
        denoiseLevel: Number.isFinite(Number(args.denoiseLevel)) ? Number(args.denoiseLevel) : 0.5,
        faceEnhance: args.faceEnhance !== false,
        tileSize: Number.isFinite(Number(args.tileSize)) && Number(args.tileSize) > 0 ? Number(args.tileSize) : 256,
      }
      const out = await processImage(ctx, args, '/api/process/super-res', {
        imageData: toDataUrl(img.buffer, img.mime),
        options,
      })
      const saved = saveResultFile(ctx, out.buffer, out.ext)
      return {
        success: true,
        message: t('message.superResDone', 'Super-res done ({scale}x, {size} KB, {ms} ms)')
          .replace('{scale}', out.meta.scale ?? scale)
          .replace('{size}', (out.buffer.length / 1024).toFixed(1))
          .replace('{ms}', out.meta.durationMs ?? '-'),
        data: {
          imageUrl: saved.httpPath,
          size: out.buffer.length,
          model: out.meta.model,
          durationMs: out.meta.durationMs,
        },
      }
    },
  },

  // ── 动作 4：导出 PSD 分层工程 ───────────────────────────
  {
    name: 'lumimatte_export_psd',
    label: t('action.exportPsd.label', 'Export PSD'),
    category: t('category', 'LumiMatte'),
    icon: 'Layers',
    description: t(
      'action.exportPsd.description',
      'Generate a layered 8BPS PSD file (layers bottom-up). Layers with imageData get real RGBA pixels; layers without it stay white placeholders.',
    ),
    properties: [
      {
        key: 'width',
        label: t('field.width.label', 'Canvas Width (px)'),
        type: 'number',
        dataType: 'number',
        required: true,
        default: 800,
        tooltip: t('field.width.tooltip', 'Canvas width in pixels.'),
      },
      {
        key: 'height',
        label: t('field.height.label', 'Canvas Height (px)'),
        type: 'number',
        dataType: 'number',
        required: true,
        default: 800,
        tooltip: t('field.height.tooltip', 'Canvas height in pixels.'),
      },
      {
        key: 'layers',
        label: t('field.layers.label', 'Layers (JSON)'),
        type: 'textarea',
        dataType: 'object[]',
        tooltip: t(
          'field.layers.tooltip',
          'JSON array of layers (bottom-up). Item fields: name, imageData (image URL/path/data URI), top, left, bottom, right, opacity (0-1), hidden.',
        ),
      },
      {
        key: 'filename',
        label: t('field.filename.label', 'Filename'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.filename.tooltip', 'Suggested file name, default lumimatte_<ts>.psd'),
      },
    ],
    configProperties: configProperties(t),
    outputs: psdOutput,
    run: async (ctx, args) => {
      const width = Number(args.width)
      const height = Number(args.height)
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return { success: false, message: t('message.needSize', 'Provide valid canvas width and height.') }
      }
      // 每层 imageData 支持 URL / 本地路径 / data URI，统一解析成 data URL 交给服务端
      const layers = []
      for (const layer of toLayerArray(args.layers)) {
        if (!layer || typeof layer !== 'object') continue
        const payload = { ...layer }
        if (layer.imageData) {
          const img = await resolveImage(String(layer.imageData))
          payload.imageData = toDataUrl(img.buffer, img.mime)
        }
        layers.push(payload)
      }
      const json = await requestJson(ctx, args, 'POST', '/api/export/psd', {
        width,
        height,
        layers,
        ...(args.filename ? { filename: String(args.filename) } : {}),
      })
      if (!json || json.success === false || !json.psdBase64) {
        throw new Error(`LumiMatte /api/export/psd failed: ${JSON.stringify(json).slice(0, 300)}`)
      }
      const buffer = Buffer.from(json.psdBase64, 'base64')
      const saved = saveResultFile(ctx, buffer, 'psd')
      return {
        success: true,
        message: t('message.psdDone', 'PSD exported ({count} layers, {size} KB)')
          .replace('{count}', json.layerCount ?? layers.length)
          .replace('{size}', (buffer.length / 1024).toFixed(1)),
        data: {
          fileUrl: saved.httpPath,
          filename: json.filename,
          sizeBytes: json.sizeBytes ?? buffer.length,
          layerCount: json.layerCount ?? layers.length,
          width: json.width,
          height: json.height,
        },
      }
    },
  },

  // ── 动作 5：服务健康检查 ─────────────────────────────────
  {
    name: 'lumimatte_status',
    label: t('action.status.label', 'Server Status'),
    category: t('category', 'LumiMatte'),
    icon: 'Activity',
    description: t(
      'action.status.description',
      'Check LumiMatte server health: version, acceleration (DirectML/CPU), platform, models dir.',
    ),
    properties: [],
    configProperties: configProperties(t),
    outputs: statusOutput,
    run: async (ctx, args) => {
      const json = await requestJson(ctx, args, 'GET', '/api/system/status')
      return {
        success: true,
        message: t('message.statusOk', 'LumiMatte {version} running ({accel})')
          .replace('{version}', json.version)
          .replace('{accel}', json.accel),
        data: {
          status: json.status,
          version: json.version,
          accel: json.accel,
          platform: json.platform,
          python: json.python,
          modelsDir: json.modelsDir,
        },
      }
    },
  },

  // ── 动作 6：已安装模型清单 ───────────────────────────────
  {
    name: 'lumimatte_models',
    label: t('action.models.label', 'List Models'),
    category: t('category', 'LumiMatte'),
    icon: 'Package',
    description: t(
      'action.models.description',
      'List offline models installed in the LumiMatte models dir (isnet, lama, realesrgan, u2net...).',
    ),
    properties: [],
    configProperties: configProperties(t),
    outputs: modelsOutput,
    run: async (ctx, args) => {
      const json = await requestJson(ctx, args, 'GET', '/api/system/models')
      const models = Array.isArray(json.models) ? json.models : []
      return {
        success: true,
        message: t('message.modelsOk', '{count} offline models installed').replace(
          '{count}',
          json.count ?? models.length,
        ),
        data: { count: json.count ?? models.length, models },
      }
    },
  },

  // ── 动作 7：批量 AI 抠图 ─────────────────────────────────
  {
    name: 'lumimatte_batch_matting',
    label: t('action.batch.label', 'Batch AI Matting'),
    category: t('category', 'LumiMatte'),
    icon: 'Images',
    description: t(
      'action.batch.description',
      'Batch AI matting for multiple images. Input is a JSON array of image URLs / paths / data URIs. Inference is serialized server-side, so large batches take longer.',
    ),
    properties: [
      {
        key: 'images',
        label: t('field.images.label', 'Image List'),
        type: 'textarea',
        dataType: 'string[]',
        required: true,
        tooltip: t('field.images.tooltip', 'JSON array, e.g. ["https://...", "G:/images/b.jpg"]'),
      },
    ],
    configProperties: configProperties(t),
    outputs: batchOutput,
    run: async (ctx, args) => {
      const list = toImageArray(args.images)
      if (!list.length) {
        return { success: false, message: t('message.needImages', 'Provide an image list.') }
      }
      ctx.logger.info(`LumiMatte batch matting: ${list.length} images`)
      const results = []
      let successCount = 0
      for (let i = 0; i < list.length; i++) {
        const input = list[i]
        try {
          const out = await mattingOne(ctx, args, input)
          results.push({ input, success: true, imageUrl: out.imageUrl })
          successCount++
        } catch (err) {
          ctx.logger.warning(`LumiMatte batch [${i + 1}/${list.length}] failed: ${err.message}`)
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
