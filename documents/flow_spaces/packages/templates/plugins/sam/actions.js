const {
  getBaseUrl,
  getTimeout,
  normalizeBoxes,
  resolveImage,
  segmentWithBoxes,
  saveMasks,
} = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.sam"]'

function configProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: t('field.baseUrl.label', 'SAM Base URL'),
      type: 'text',
      dataType: 'string',
      required: true,
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
      tooltip: t('field.baseUrl.tooltip', 'SAM HTTP service URL, e.g. http://127.0.0.1:30231'),
    },
    {
      key: 'timeout',
      label: t('field.timeout.label', 'Timeout (ms)'),
      type: 'number',
      dataType: 'number',
      default: `${CONFIG_PREFIX}["timeout"]}}`,
      tooltip: t('field.timeout.tooltip', 'Timeout for one batched segmentation request.'),
    },
  ]
}

module.exports = (t) => [
  {
    name: 'sam_segment_with_boxes',
    label: t('action.segment.label', 'Segment with Boxes'),
    category: t('category', 'SAM'),
    icon: 'ScanSearch',
    description: t(
      'action.segment.description',
      'Segment multiple regions in one SAM request. The image embedding is computed once.',
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
        key: 'boxes',
        label: t('field.boxes.label', 'Boxes'),
        type: 'textarea',
        dataType: 'object[]',
        required: true,
        tooltip: t(
          'field.boxes.tooltip',
          'JSON array of {slot_id,x_min,y_min,x_max,y_max}.',
        ),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'masks', type: 'object', dataType: 'object[]' },
          { key: 'total', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.image) {
        return { success: false, message: t('message.needImage', 'Provide an image input.') }
      }
      const boxes = normalizeBoxes(args.boxes)
      if (!boxes.length) {
        return { success: false, message: t('message.needBoxes', 'Provide at least one box.') }
      }
      const image = await resolveImage(args.image)
      const baseUrl = getBaseUrl(args)
      ctx.logger.info(`SAM POST ${baseUrl}/segment_with_boxes (boxes=${boxes.length})`)
      const masks = await segmentWithBoxes({
        baseUrl,
        timeout: getTimeout(args),
        imageBuffer: image.buffer,
        boxes,
      })
      const savedMasks = saveMasks(ctx, masks)
      return {
        success: true,
        message: t('message.segmented', 'Segmented {total} regions.').replace(
          '{total}',
          String(savedMasks.length),
        ),
        data: { masks: savedMasks, total: savedMasks.length },
      }
    },
  },
]
