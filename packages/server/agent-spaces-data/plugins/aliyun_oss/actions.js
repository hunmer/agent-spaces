const crypto = require('crypto')
const { createClient, normalizeResult } = require('./shared')

function generateRandomKey(ext) {
  const date = new Date().toISOString().slice(0, 10)
  const id = crypto.randomUUID().slice(0, 8)
  return `uploads/${date}/${id}.${ext || 'bin'}`
}

function getExtFromPath(p) {
  const m = p && p.match(/\.([^.]+)$/)
  return m ? m[1] : ''
}

const CONFIG_PREFIX = '{{ __config__["workflow.aliyun-oss"]'

function configProperties(t) {
  return [
    { key: 'region', label: 'Region', type: 'text', required: true, toolRequired: false, tooltip: t('config.region.tooltip', 'e.g. oss-cn-hangzhou'), default: `${CONFIG_PREFIX}["region"]}}` },
    { key: 'accessKeyId', label: 'AccessKey ID', type: 'text', required: true, default: `${CONFIG_PREFIX}["accessKeyId"]}}` },
    { key: 'accessKeySecret', label: 'AccessKey Secret', type: 'text', required: true, default: `${CONFIG_PREFIX}["accessKeySecret"]}}` },
    { key: 'bucket', label: 'Bucket', type: 'text', required: true, default: `${CONFIG_PREFIX}["bucket"]}}` },
    { key: 'endpoint', label: 'Endpoint', type: 'text', tooltip: t('config.endpoint.tooltip', 'Custom endpoint; overrides region'), default: `${CONFIG_PREFIX}["endpoint"]}}` },
    { key: 'secure', label: 'HTTPS', type: 'boolean', default: true },
  ]
}

const uploadOutputs = [
  { key: 'success', type: 'boolean' },
  { key: 'message', type: 'string' },
  {
    key: 'data',
    type: 'object',
    children: [
      { key: 'name', type: 'string' },
      { key: 'url', type: 'string' },
    ],
  },
]

const commonOutputs = [
  { key: 'success', type: 'boolean' },
  { key: 'message', type: 'string' },
]

module.exports = (t) => [
  {
    name: 'oss_upload_file',
    label: t('action.uploadFile.label', 'OSS Upload File'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Upload',
    description: t('action.uploadFile.description', 'Upload a local file to OSS.'),
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', tooltip: t('field.objectKey.auto.tooltip', 'Full path in OSS; auto-generated if empty') },
      { key: 'filePath', label: t('field.filePath.label', 'Local File Path'), type: 'text', tooltip: t('field.filePath.tooltip', 'Full local file path.') },
    ],
    toolProperties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', tooltip: t('field.objectKey.tool.tooltip', 'Target path in OSS; auto-generated if empty') },
      { key: 'filePath', label: t('field.filePath.label', 'Local File Path'), type: 'text', tooltip: t('field.filePathOrContent.tooltip', 'Full local file path. Provide either filePath or content.') },
      { key: 'content', label: t('field.content.label', 'Content'), type: 'textarea', tooltip: t('field.contentOrFilePath.tooltip', 'Text content. Provide either content or filePath.') },
    ],
    configProperties: configProperties(t),
    outputs: uploadOutputs,
    run: async (ctx, args) => {
      const objectKey = args.objectKey || generateRandomKey(getExtFromPath(args.filePath))
      const client = createClient(args)
      let result
      if (args.filePath) {
        ctx.logger.info(`Upload file: ${args.filePath} -> ${objectKey}`)
        result = await client.put(objectKey, args.filePath)
      } else if (args.content) {
        ctx.logger.info(`Upload content -> ${objectKey}`)
        result = await client.put(objectKey, Buffer.from(args.content))
      } else {
        return { success: false, message: t('message.needFilePathOrContent', 'Provide filePath or content.') }
      }
      const out = normalizeResult(result)
      return { success: true, message: t('message.uploadSuccess', 'Upload succeeded: {name}').replace('{name}', out.name), data: out }
    },
  },
  {
    name: 'oss_upload_content',
    label: t('action.uploadContent.label', 'OSS Upload Content'),
    category: t('category', 'Aliyun OSS'),
    icon: 'FileUp',
    description: t('action.uploadContent.description', 'Upload string or Buffer content to OSS.'),
    tool: false,
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
      { key: 'content', label: t('field.content.label', 'Content'), type: 'textarea', required: true, tooltip: t('field.content.tooltip', 'Text content to upload.') },
    ],
    configProperties: configProperties(t),
    outputs: uploadOutputs,
    run: async (ctx, args) => {
      const client = createClient(args)
      ctx.logger.info(`Upload content -> ${args.objectKey}`)
      const result = await client.put(args.objectKey, Buffer.from(args.content))
      const out = normalizeResult(result)
      return { success: true, message: t('message.contentUploaded', 'Content uploaded: {name}').replace('{name}', out.name), data: out }
    },
  },
  {
    name: 'oss_download',
    label: t('action.download.label', 'OSS Download File'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Download',
    description: t('action.download.description', 'Download a file from OSS to local disk, or read its text content.'),
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
      { key: 'filePath', label: t('field.savePath.label', 'Local Save Path'), type: 'text', required: true, tooltip: t('field.savePath.tooltip', 'Full local path to save the downloaded file.') },
    ],
    toolProperties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
      { key: 'filePath', label: t('field.savePath.label', 'Local Save Path'), type: 'text', tooltip: t('field.optionalSavePath.tooltip', 'Leave empty to return text content.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        children: [
          { key: 'filePath', type: 'string' },
          { key: 'content', type: 'string' },
          { key: 'contentLength', type: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.objectKey) return { success: false, message: t('message.missingObjectKey', 'Missing objectKey.') }
      const client = createClient(args)
      if (args.filePath) {
        ctx.logger.info(`Download file: ${args.objectKey} -> ${args.filePath}`)
        const result = await client.get(args.objectKey, args.filePath)
        return {
          success: true,
          message: t('message.fileDownloaded', 'File downloaded: {objectKey}').replace('{objectKey}', args.objectKey),
          data: {
            filePath: args.filePath,
            contentLength: parseInt(result.res?.headers?.['content-length'] || '0', 10),
          },
        }
      }
      ctx.logger.info(`Get content: ${args.objectKey}`)
      const result = await client.get(args.objectKey)
      const content = result.content?.toString('utf-8') || ''
      return { success: true, message: t('message.contentRead', 'Content read: {objectKey}').replace('{objectKey}', args.objectKey), data: { content, contentLength: content.length } }
    },
  },
  {
    name: 'oss_get_content',
    label: t('action.getContent.label', 'OSS Get Content'),
    category: t('category', 'Aliyun OSS'),
    icon: 'FileText',
    description: t('action.getContent.description', 'Read OSS file content and return text.'),
    tool: false,
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', children: [{ key: 'content', type: 'string' }, { key: 'contentLength', type: 'number' }] },
    ],
    run: async (ctx, args) => {
      const client = createClient(args)
      ctx.logger.info(`Get content: ${args.objectKey}`)
      const result = await client.get(args.objectKey)
      const content = result.content?.toString('utf-8') || ''
      return { success: true, message: t('message.contentRead', 'Content read: {objectKey}').replace('{objectKey}', args.objectKey), data: { content, contentLength: content.length } }
    },
  },
  {
    name: 'oss_delete',
    label: t('action.delete.label', 'OSS Delete File'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Trash2',
    description: t('action.delete.description', 'Delete one or more files from OSS.'),
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
    ],
    toolProperties: [
      { key: 'objectKey', label: t('field.singleObjectKey.label', 'Single Object Key'), type: 'text', tooltip: t('field.singleObjectKey.tooltip', 'Single file path in OSS.') },
      { key: 'objectKeys', label: t('field.objectKeys.label', 'Object Key List'), type: 'array', schemaType: 'array', items: { type: 'string' }, tooltip: t('field.objectKeys.tooltip', 'Array of file paths in OSS.') },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      const client = createClient(args)
      if (Array.isArray(args.objectKeys) && args.objectKeys.length) {
        ctx.logger.info(`Batch delete: ${args.objectKeys.length} files`)
        const result = await client.deleteMulti(args.objectKeys)
        return { success: true, message: t('message.batchDeleteDone', 'Batch delete completed.'), data: { deleted: result.deleted || [] } }
      }
      if (!args.objectKey) return { success: false, message: t('message.needObjectKeyOrObjectKeys', 'Provide objectKey or objectKeys.') }
      ctx.logger.info(`Delete file: ${args.objectKey}`)
      await client.delete(args.objectKey)
      return { success: true, message: t('message.fileDeleted', 'File deleted: {objectKey}').replace('{objectKey}', args.objectKey) }
    },
  },
  {
    name: 'oss_delete_multi',
    label: t('action.deleteMulti.label', 'OSS Batch Delete'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Trash',
    description: t('action.deleteMulti.description', 'Delete multiple files from OSS.'),
    tool: false,
    properties: [
      { key: 'objectKeys', label: t('field.objectKeys.label', 'Object Key List'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.objectKeysJson.tooltip', 'JSON array, e.g. ["a.txt","b.txt"].') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', children: [{ key: 'deleted', type: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const client = createClient(args)
      const keys = Array.isArray(args.objectKeys) ? args.objectKeys : JSON.parse(args.objectKeys)
      ctx.logger.info(`Batch delete: ${keys.length} files`)
      const result = await client.deleteMulti(keys)
      return { success: true, message: t('message.batchDeleteCount', 'Batch delete completed. Deleted {count} files.').replace('{count}', result.deleted?.length || 0), data: { deleted: result.deleted || [] } }
    },
  },
  {
    name: 'oss_list',
    label: t('action.list.label', 'OSS List Files'),
    category: t('category', 'Aliyun OSS'),
    icon: 'FolderSearch',
    description: t('action.list.description', 'List files with the specified bucket prefix.'),
    properties: [
      { key: 'prefix', label: t('field.prefix.label', 'Prefix'), type: 'text', tooltip: t('field.prefix.tooltip', 'Only list files starting with this prefix.') },
      { key: 'delimiter', label: t('field.delimiter.label', 'Delimiter'), type: 'text', tooltip: t('field.delimiter.tooltip', 'Used for grouping. Usually /.') },
      { key: 'maxKeys', label: t('field.maxKeys.label', 'Max Keys'), type: 'number', default: 100, tooltip: t('field.maxKeys.tooltip', 'Maximum number of results per request.') },
      { key: 'marker', label: t('field.marker.label', 'Marker'), type: 'text', tooltip: t('field.marker.tooltip', 'Pagination marker from the previous nextMarker.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        children: [
          { key: 'objects', type: 'object', children: [] },
          { key: 'prefixes', type: 'object', children: [] },
          { key: 'nextMarker', type: 'string' },
          { key: 'isTruncated', type: 'boolean' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const client = createClient(args)
      const query = {}
      if (args.prefix) query.prefix = args.prefix
      if (args.delimiter) query.delimiter = args.delimiter
      if (args.maxKeys) query['max-keys'] = args.maxKeys
      if (args.marker) query.marker = args.marker

      ctx.logger.info(`List files: prefix=${args.prefix || '(all)'}, max=${args.maxKeys || 100}`)
      const result = await client.list(query)
      const objects = (result.objects || []).map(o => ({
        name: o.name,
        size: o.size,
        lastModified: o.lastModified,
        url: o.url,
      }))
      return {
        success: true,
        message: t('message.listCount', 'Found {count} files.').replace('{count}', objects.length),
        data: {
          objects,
          prefixes: result.prefixes || [],
          nextMarker: result.nextMarker || '',
          isTruncated: result.isTruncated || false,
        },
      }
    },
  },
  {
    name: 'oss_sign_url',
    label: t('action.signUrl.label', 'OSS Signed URL'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Link',
    description: t('action.signUrl.description', 'Generate a temporary signed access URL.'),
    properties: [
      { key: 'objectKey', label: t('field.objectKey.label', 'Object Key'), type: 'text', required: true, tooltip: t('field.objectKey.tooltip', 'Full path in OSS, without bucket name.') },
      { key: 'expires', label: t('field.expires.label', 'Expires In Seconds'), type: 'number', default: 3600, tooltip: t('field.expires.tooltip', 'URL validity period. Default: 1 hour.') },
      {
        key: 'method',
        label: t('field.method.label', 'HTTP Method'),
        type: 'select',
        default: 'GET',
        options: [{ label: 'GET', value: 'GET' }, { label: 'PUT', value: 'PUT' }],
        enum: ['GET', 'PUT'],
        tooltip: t('field.method.tooltip', 'Allowed HTTP method.'),
      },
      { key: 'responseContentType', label: t('field.responseContentType.label', 'Response Content-Type'), type: 'text', tooltip: t('field.responseContentType.tooltip', 'e.g. application/octet-stream') },
      { key: 'responseContentDisposition', label: t('field.responseContentDisposition.label', 'Response Content-Disposition'), type: 'text', tooltip: t('field.responseContentDisposition.tooltip', 'e.g. attachment; filename="file.txt"') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', children: [{ key: 'url', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.objectKey) return { success: false, message: t('message.missingObjectKey', 'Missing objectKey.') }
      const client = createClient(args)
      const options = {}
      if (args.responseContentType) options['response-content-type'] = args.responseContentType
      if (args.responseContentDisposition) options['response-content-disposition'] = args.responseContentDisposition

      ctx.logger.info(`Sign URL: ${args.objectKey}, expires ${args.expires || 3600}s`)
      const url = client.signatureUrl(args.objectKey, {
        expires: args.expires || 3600,
        method: (args.method || 'GET').toUpperCase(),
        ...options,
      })
      return { success: true, message: t('message.signedUrlGenerated', 'Signed URL generated.'), data: { url } }
    },
  },
  {
    name: 'oss_copy',
    label: t('action.copy.label', 'OSS Copy File'),
    category: t('category', 'Aliyun OSS'),
    icon: 'Copy',
    description: t('action.copy.description', 'Copy a file inside OSS. Cross-bucket copy is supported.'),
    properties: [
      { key: 'objectKey', label: t('field.targetObjectKey.label', 'Target Object Key'), type: 'text', required: true, tooltip: t('field.targetObjectKey.tooltip', 'OSS path after copy.') },
      { key: 'sourceKey', label: t('field.sourceObjectKey.label', 'Source Object Key'), type: 'text', required: true, tooltip: t('field.sourceObjectKey.tooltip', 'Source file path in OSS.') },
      { key: 'sourceBucket', label: t('field.sourceBucket.label', 'Source Bucket'), type: 'text', tooltip: t('field.sourceBucket.tooltip', 'Source bucket name. Defaults to the configured bucket.') },
    ],
    configProperties: configProperties(t),
    outputs: uploadOutputs,
    run: async (ctx, args) => {
      if (!args.objectKey || !args.sourceKey) return { success: false, message: t('message.missingObjectKeyOrSourceKey', 'Missing objectKey or sourceKey.') }
      const client = createClient(args)
      const sourceBucket = args.sourceBucket || args.bucket
      const source = `/${sourceBucket}/${args.sourceKey}`
      ctx.logger.info(`Copy file: ${source} -> ${args.objectKey}`)
      const result = await client.copy(args.objectKey, source)
      const out = normalizeResult(result)
      return { success: true, message: t('message.copySuccess', 'Copy succeeded: {sourceKey} -> {objectKey}').replace('{sourceKey}', args.sourceKey).replace('{objectKey}', args.objectKey), data: out }
    },
  },
]
