module.exports = (t) => [
  {
    name: 'fetch_text',
    label: t('action.fetch_text.label', 'Fetch Web Content'),
    category: t('category', 'HTTP Request'),
    icon: 'Globe',
    description: t('action.fetch_text.description', 'Request a URL and return text content (HTML/JSON/plain text etc.)'),
    properties: [
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', dataType: 'string', required: true, tooltip: t('field.url.tooltip', 'Target URL') },
      { key: 'headers', label: t('field.headers.label', 'Headers'), type: 'object', dataType: 'object', tooltip: t('field.headers.tooltip', 'Custom request headers (JSON object)') },
      { key: 'encoding', label: t('field.encoding.label', 'Encoding'), type: 'text', dataType: 'string', default: 'utf-8', tooltip: t('field.encoding.tooltip', 'Response encoding') },
      { key: 'timeout', label: t('field.timeout.label', 'Timeout (ms)'), type: 'number', dataType: 'number', default: 30000, tooltip: t('field.timeout.tooltip', 'Request timeout') },
    ],
    outputs: [
      { key: 'text', type: 'string' },
      { key: 'url', type: 'string' },
    ],
    run: async (ctx, args) => {
      const text = await ctx.api.fetchText(args.url, {
        headers: args.headers,
        encoding: args.encoding,
        timeout: args.timeout,
      })
      return { success: true, message: t('message.textFetched', 'Content fetched ({length} characters)').replace('{length}', text.length), data: { text, url: args.url } }
    },
  },
  {
    name: 'fetch_buffer',
    label: t('action.fetch_buffer.label', 'Download File'),
    category: t('category', 'HTTP Request'),
    icon: 'Download',
    description: t('action.fetch_buffer.description', 'Download a network file and return a Buffer (image/audio/binary etc.)'),
    properties: [
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', dataType: 'string', required: true, tooltip: t('field.fileUrl.tooltip', 'File download URL') },
      { key: 'headers', label: t('field.headers.label', 'Headers'), type: 'object', dataType: 'object', tooltip: t('field.headers.tooltip', 'Custom request headers (JSON object)') },
      { key: 'timeout', label: t('field.timeout.label', 'Timeout (ms)'), type: 'number', dataType: 'number', default: 60000, tooltip: t('field.downloadTimeout.tooltip', 'Download timeout') },
    ],
    outputs: [
      { key: 'buffer', type: 'buffer', dataType: 'string' },
      { key: 'size', type: 'number', dataType: 'number' },
      { key: 'mimeType', type: 'string' },
      { key: 'url', type: 'string' },
    ],
    run: async (ctx, args) => {
      const result = await ctx.api.fetchBuffer(args.url, {
        headers: args.headers,
        timeout: args.timeout,
      })
      return {
        success: true,
        message: t('message.fileDownloaded', 'File downloaded ({size} KB)').replace('{size}', (result.size / 1024).toFixed(1)),
        data: { ...result, url: args.url },
      }
    },
  },
  {
    name: 'fetch_buffers',
    label: t('action.fetch_buffers.label', 'Batch Download Files'),
    category: t('category', 'HTTP Request'),
    icon: 'Files',
    description: t('action.fetch_buffers.description', 'Batch download multiple network files and return a Buffer collection'),
    properties: [
      { key: 'urls', label: t('field.urls.label', 'URL List'), type: 'object', dataType: 'object', required: true, tooltip: t('field.urls.tooltip', 'URL array, e.g. ["https://...","https://..."]') },
      { key: 'headers', label: t('field.headers.label', 'Headers'), type: 'object', dataType: 'object', tooltip: t('field.headers.tooltip', 'Custom request headers (JSON object)') },
      { key: 'timeout', label: t('field.timeout.label', 'Timeout (ms)'), type: 'number', dataType: 'number', default: 60000, tooltip: t('field.batchTimeout.tooltip', 'Single download timeout') },
    ],
    outputs: [
      { key: 'results', type: 'object', dataType: 'object', children: [
        { key: 'url', type: 'string' },
        { key: 'success', type: 'boolean', dataType: 'boolean' },
        { key: 'size', type: 'number', dataType: 'number' },
        { key: 'mimeType', type: 'string' },
        { key: 'error', type: 'string' },
      ] },
      { key: 'total', type: 'number', dataType: 'number' },
      { key: 'successCount', type: 'number', dataType: 'number' },
    ],
    run: async (ctx, args) => {
      const urls = Array.isArray(args.urls) ? args.urls : JSON.parse(args.urls)
      const results = await ctx.api.fetchBuffers(urls, {
        headers: args.headers,
        timeout: args.timeout,
      })
      const successCount = results.filter(r => r.success).length
      return {
        success: true,
        message: t('message.batchDownloaded', 'Batch download completed: {successCount}/{total} succeeded').replace('{successCount}', successCount).replace('{total}', results.length),
        data: { results, total: results.length, successCount },
      }
    },
  },
]
