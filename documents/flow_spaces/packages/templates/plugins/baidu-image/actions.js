// 百度AI图像处理插件 - 动作定义
// 两个节点：
//   1. baidu_image_segment  智能抠图（主体分割，自动/手动框选）
//   2. baidu_image_enhance  图像无损放大（长宽各 2 倍）

const {
  imageToBase64,
  getAccessToken,
  callSegment,
  callEnhance,
  saveResultImage,
} = require('./shared')

// 配置占位符：workflow 运行时会从 __config__ 注入插件配置
const CONFIG_APIKEY = '{{ __config__["workflow.baidu-image"]["apiKey"] }}'
const CONFIG_SECRETKEY = '{{ __config__["workflow.baidu-image"]["secretKey"] }}'

module.exports = (t) => [
  // ── 节点 1：智能抠图 ────────────────────────────────────
  {
    name: 'baidu_image_segment',
    label: t('action.segment.label', 'Baidu Smart Cutout'),
    category: t('category', 'Baidu AI Image'),
    icon: 'Scissors',
    description: t(
      'action.segment.description',
      'Baidu subject segmentation: removes background and returns the subject. Supports auto detection and manual bounding box selection.',
    ),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: '百度智能云应用 API Key', required: true },
      { key: 'secretKey', type: 'string', description: '百度智能云应用 Secret Key', required: true },
      { key: 'image', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: '图片输入：URL / 本地路径 / base64 data URI，或 JSON 数组（批量）', required: true },
      { key: 'method', type: 'string', description: '抠图方式：auto(自动识别主体，默认) / control(手动框选)' },
      { key: 'returnForm', type: 'string', description: '返回图像形式：rgba(透明背景主体，默认) / mask(二值蒙版图)' },
      { key: 'refineMask', type: 'boolean', description: '是否对边缘平滑处理，默认 true' },
      { key: 'position', type: 'array', items: { type: 'object' }, description: 'method=control 时必填，主体外框坐标，如 [[[x1,y1],[x2,y2]]]，支持多个框' },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', dataType: 'string', required: true, tooltip: t('field.apiKey.tooltip', '百度智能云应用 API Key'), default: CONFIG_APIKEY },
      { key: 'secretKey', label: t('field.secretKey.label', 'Secret Key'), type: 'text', dataType: 'string', required: true, tooltip: t('field.secretKey.tooltip', '百度智能云应用 Secret Key'), default: CONFIG_SECRETKEY },
      { key: 'image', label: t('field.image.label', 'Image'), type: 'textarea', dataType: 'any', required: true, tooltip: t('field.image.tooltip', 'URL / 本地路径 / data URI，或 JSON 数组（批量处理）') },
      {
        key: 'method', label: t('field.method.label', 'Cutout Method'), type: 'select', dataType: 'string', default: 'auto',
        tooltip: t('field.method.tooltip', 'auto=自动识别主体；control=手动框选主体（需提供坐标）'),
        options: [
          { label: t('option.method.auto', 'Auto (default)'), value: 'auto' },
          { label: t('option.method.control', 'Manual Bounding Box'), value: 'control' },
        ],
      },
      {
        key: 'returnForm', label: t('field.returnForm.label', 'Output Form'), type: 'select', dataType: 'string', default: 'rgba',
        tooltip: t('field.returnForm.tooltip', 'rgba=透明背景主体；mask=单通道二值蒙版图'),
        options: [
          { label: t('option.returnForm.rgba', 'RGBA Transparent Subject (default)'), value: 'rgba' },
          { label: t('option.returnForm.mask', 'Mask'), value: 'mask' },
        ],
      },
      { key: 'refineMask', label: t('field.refineMask.label', 'Edge Refinement'), type: 'checkbox', dataType: 'boolean', default: true, tooltip: t('field.refineMask.tooltip', '是否对主体边缘进行平滑处理') },
      {
        key: 'position', label: t('field.position.label', 'Bounding Boxes'), type: 'textarea', dataType: 'object',
        tooltip: t('field.position.tooltip', 'method=control 时必填。格式 [[[x1,y1],[x2,y2]]]，可含多个框。矩形不能与图片边缘重合，尺寸需 ≥10×10。'),
      },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'logId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      try {
        const accessToken = await getAccessToken(ctx, args)

        // 归一化图片输入为数组
        let images = args.image
        if (typeof images === 'string') {
          const trimmed = images.trim()
          if (trimmed.startsWith('[')) {
            try { images = JSON.parse(trimmed) } catch { images = [trimmed] }
          } else {
            images = [trimmed]
          }
        }
        if (!Array.isArray(images)) images = [images]
        images = images.filter((x) => x != null && x !== '')
        if (images.length === 0) throw new Error('需要至少 1 张输入图片')

        const method = args.method || 'auto'
        const returnForm = args.returnForm || 'rgba'
        const refineMask = args.refineMask === false ? 'false' : 'true'

        // control 方式必须有 position
        let position = null
        if (method === 'control') {
          if (args.position == null || args.position === '') {
            throw new Error('method=control 时必须提供 position（主体外框坐标）')
          }
          position = args.position
          if (typeof position === 'string') {
            try { position = JSON.parse(position) } catch { throw new Error('position 不是合法 JSON') }
          }
          if (!Array.isArray(position)) throw new Error('position 必须是数组')
        }

        ctx.logger.info(`智能抠图开始，图片数: ${images.length}, method=${method}, returnForm=${returnForm}`)
        const results = []
        let lastLogId = ''
        for (let i = 0; i < images.length; i++) {
          const base64 = await imageToBase64(images[i])
          const payload = {
            image: base64,
            method,
            return_form: returnForm,
            refine_mask: refineMask,
          }
          if (method === 'control' && position) {
            // position 是每张图共用的外框集合（百度文档示例形式）
            payload.position = position
          }
          const data = await callSegment(ctx, accessToken, payload)
          lastLogId = data.log_id != null ? String(data.log_id) : lastLogId
          if (!data.image) {
            throw new Error(`第 ${i + 1} 张图片未返回结果图像`)
          }
          // rgba 返回四通道 PNG；mask 返回单通道图，统一用 png 扩展名落盘
          const httpPath = saveResultImage(ctx, data.image, returnForm === 'mask' ? 'png' : 'png')
          results.push(httpPath)
        }

        ctx.logger.info(`智能抠图完成，生成 ${results.length} 张结果图`)
        return {
          success: true,
          message: t('message.segmentDone', 'Cutout completed, generated {count} image(s)').replace('{count}', results.length),
          data: { images: results, logId: lastLogId },
        }
      } catch (err) {
        ctx.logger.error(`智能抠图失败: ${err.message}`)
        return {
          success: false,
          message: t('message.failed', 'Request failed: {error}').replace('{error}', err.message),
          data: {},
        }
      }
    },
  },

  // ── 节点 2：图像无损放大 ────────────────────────────────
  {
    name: 'baidu_image_enhance',
    label: t('action.enhance.label', 'Baidu Lossless Upscale'),
    category: t('category', 'Baidu AI Image'),
    icon: 'ZoomIn',
    description: t(
      'action.enhance.description',
      'Baidu image quality enhancement: upscales the image 2x in both width and height while preserving quality.',
    ),
    toolProperties: [
      { key: 'apiKey', type: 'string', description: '百度智能云应用 API Key', required: true },
      { key: 'secretKey', type: 'string', description: '百度智能云应用 Secret Key', required: true },
      { key: 'image', oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: '图片输入：URL / 本地路径 / base64 data URI，或 JSON 数组（批量）', required: true },
    ],
    properties: [
      { key: 'apiKey', label: t('field.apiKey.label', 'API Key'), type: 'text', dataType: 'string', required: true, tooltip: t('field.apiKey.tooltip', '百度智能云应用 API Key'), default: CONFIG_APIKEY },
      { key: 'secretKey', label: t('field.secretKey.label', 'Secret Key'), type: 'text', dataType: 'string', required: true, tooltip: t('field.secretKey.tooltip', '百度智能云应用 Secret Key'), default: CONFIG_SECRETKEY },
      { key: 'image', label: t('field.image.label', 'Image'), type: 'textarea', dataType: 'any', required: true, tooltip: t('field.enhance.image.tooltip', 'URL / 本地路径 / data URI，或 JSON 数组（批量处理）。注意：base64 后不超过 4M，长宽乘积不超过 2000×2000。') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'images', type: 'image[]' },
        { key: 'logId', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      try {
        const accessToken = await getAccessToken(ctx, args)

        // 归一化图片输入为数组
        let images = args.image
        if (typeof images === 'string') {
          const trimmed = images.trim()
          if (trimmed.startsWith('[')) {
            try { images = JSON.parse(trimmed) } catch { images = [trimmed] }
          } else {
            images = [trimmed]
          }
        }
        if (!Array.isArray(images)) images = [images]
        images = images.filter((x) => x != null && x !== '')
        if (images.length === 0) throw new Error('需要至少 1 张输入图片')

        ctx.logger.info(`图像无损放大开始，图片数: ${images.length}`)
        const results = []
        let lastLogId = ''
        for (let i = 0; i < images.length; i++) {
          const base64 = await imageToBase64(images[i])
          // form-urlencoded 提交：image=<base64>
          const data = await callEnhance(ctx, accessToken, { image: base64 })
          lastLogId = data.log_id != null ? String(data.log_id) : lastLogId
          if (!data.image) {
            throw new Error(`第 ${i + 1} 张图片未返回结果图像`)
          }
          const httpPath = saveResultImage(ctx, data.image, 'jpg')
          results.push(httpPath)
        }

        ctx.logger.info(`图像无损放大完成，生成 ${results.length} 张结果图`)
        return {
          success: true,
          message: t('message.enhanceDone', 'Upscale completed, generated {count} image(s)').replace('{count}', results.length),
          data: { images: results, logId: lastLogId },
        }
      } catch (err) {
        ctx.logger.error(`图像无损放大失败: ${err.message}`)
        return {
          success: false,
          message: t('message.failed', 'Request failed: {error}').replace('{error}', err.message),
          data: {},
        }
      }
    },
  },
]
