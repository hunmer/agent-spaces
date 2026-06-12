// ============================================================
// 腾讯云 COS 插件 - 统一 Actions
// 合并自: tools.js, workflow.js
// ============================================================

const { createClient, getBucketParams, getPublicUrl } = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.tencent-cos"]'

function createConfigProperties(t) {
  return [
    { key: 'secretId', label: 'SecretId', type: 'text', required: true, default: `${CONFIG_PREFIX}["secretId"]}}` },
    { key: 'secretKey', label: 'SecretKey', type: 'text', required: true, default: `${CONFIG_PREFIX}["secretKey"]}}` },
    { key: 'bucket', label: 'Bucket', type: 'text', required: true, tooltip: t('config.bucket.tooltip', 'Format: bucket-appid'), default: `${CONFIG_PREFIX}["bucket"]}}` },
    { key: 'region', label: 'Region', type: 'text', required: true, tooltip: t('config.region.tooltip', 'Example: ap-guangzhou'), default: `${CONFIG_PREFIX}["region"]}}` },
  ]
}

module.exports = (t) => {
  const configProperties = createConfigProperties(t)

  return [
  // ─── 上传文件 ─────────────────────────────
  {
    name: 'cos_upload_file',
    label: t('action.uploadFile.label', 'COS Upload File'),
    category: t('category', 'Tencent COS'),
    icon: 'Upload',
    description: t('action.uploadFile.description', 'Upload a local file to COS'),
    tool: false,
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      { key: 'filePath', label: t('field.filePath.label', 'Local File Path'), type: 'text', required: true, tooltip: t('field.filePath.tooltip', 'Full local file path') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'Key', type: 'string' },
        { key: 'ETag', type: 'string' },
        { key: 'Location', type: 'string' },
        { key: 'url', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`上传文件: ${args.filePath} -> ${args.key}`)
      const result = await cos.sliceUploadFile({
        ...base,
        Key: args.key,
        FilePath: args.filePath,
      })
      const url = getPublicUrl(args, args.key)
      ctx.logger.info(`上传成功: ${url}`)
      return {
        success: true,
        message: t('message.uploadSuccess', 'File uploaded: {key}').replace('{key}', args.key),
        data: { Key: result.Key || args.key, ETag: result.ETag, Location: result.Location, url },
      }
    },
  },

  // ─── 上传内容 ─────────────────────────────
  {
    name: 'cos_upload_content',
    label: t('action.uploadContent.label', 'COS Upload Content'),
    category: t('category', 'Tencent COS'),
    icon: 'FileUp',
    description: t('action.uploadContent.description', 'Upload string content to COS'),
    tool: false,
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      { key: 'content', label: t('field.content.label', 'Content'), type: 'textarea', required: true, tooltip: t('field.content.tooltip', 'Text content to upload') },
      { key: 'contentType', label: t('field.contentType.label', 'Content-Type'), type: 'text', tooltip: t('field.contentType.tooltip', 'Example: text/plain, application/json') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'Key', type: 'string' },
        { key: 'ETag', type: 'string' },
        { key: 'Location', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`上传内容: -> ${args.key}`)
      const params = {
        ...base,
        Key: args.key,
        Body: args.content,
      }
      if (args.contentType) params.ContentType = args.contentType
      const result = await cos.putObject(params)
      return {
        success: true,
        message: t('message.contentUploaded', 'Content uploaded: {key}').replace('{key}', args.key),
        data: { Key: result.Key || args.key, ETag: result.ETag, Location: result.Location },
      }
    },
  },

  // ─── 上传 Buffer / Base64 ─────────────────
  {
    name: 'cos_upload_buffer',
    label: t('action.uploadBuffer.label', 'COS Upload Binary'),
    category: t('category', 'Tencent COS'),
    icon: 'Binary',
    description: t('action.uploadBuffer.description', 'Upload Base64-encoded binary data to COS'),
    tool: false,
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      { key: 'base64Data', label: t('field.base64Data.label', 'Base64 Data'), type: 'textarea', required: true, tooltip: t('field.base64Data.tooltip', 'Base64-encoded binary data') },
      { key: 'contentType', label: t('field.contentType.label', 'Content-Type'), type: 'text', tooltip: t('field.contentTypeImage.tooltip', 'Example: image/jpeg, application/pdf') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'Key', type: 'string' },
        { key: 'ETag', type: 'string' },
        { key: 'Location', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`上传二进制: -> ${args.key}`)
      const buffer = Buffer.from(args.base64Data, 'base64')
      const params = {
        ...base,
        Key: args.key,
        Body: buffer,
        ContentLength: buffer.length,
      }
      if (args.contentType) params.ContentType = args.contentType
      const result = await cos.putObject(params)
      return {
        success: true,
        message: t('message.bufferUploaded', 'Binary uploaded: {key}').replace('{key}', args.key),
        data: { Key: result.Key || args.key, ETag: result.ETag, Location: result.Location },
      }
    },
  },

  // ─── 上传（agent tool 合并版）──────────────
  {
    name: 'cos_upload',
    label: t('action.upload.label', 'COS Upload'),
    category: t('category', 'Tencent COS'),
    icon: 'Upload',
    description: t('action.upload.description', 'Upload files or content to Tencent COS. Supports local file paths, text content, and Base64 binary data.'),
    toolOnly: true,
    toolProperties: {
      type: 'object',
      properties: {
        secretId: { type: 'string', description: '腾讯云 SecretId' },
        secretKey: { type: 'string', description: '腾讯云 SecretKey' },
        bucket: { type: 'string', description: '存储桶名称（格式: bucket-appid）' },
        region: { type: 'string', description: '地域，如 ap-guangzhou' },
        key: { type: 'string', description: 'COS 目标路径' },
        filePath: { type: 'string', description: '本地文件路径（与 content/base64Data 三选一）' },
        content: { type: 'string', description: '文本内容（与 filePath/base64Data 三选一）' },
        base64Data: { type: 'string', description: 'Base64 编码的二进制数据（与 filePath/content 三选一）' },
        contentType: { type: 'string', description: 'Content-Type，如 image/jpeg' },
      },
      required: ['secretId', 'secretKey', 'bucket', 'region', 'key'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'Key', type: 'string' },
        { key: 'ETag', type: 'string' },
        { key: 'Location', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      if (!args.key) return { success: false, message: t('message.missingKey', 'Missing key') }
      if (args.filePath) {
        const result = await cos.sliceUploadFile({ ...base, Key: args.key, FilePath: args.filePath })
        return { success: true, message: t('message.uploadOk', 'Upload succeeded: {key}').replace('{key}', args.key), data: { Key: args.key, ETag: result.ETag, Location: result.Location } }
      }
      const params = { ...base, Key: args.key }
      if (args.content) {
        params.Body = args.content
      } else if (args.base64Data) {
        const buf = Buffer.from(args.base64Data, 'base64')
        params.Body = buf
        params.ContentLength = buf.length
      } else {
        return { success: false, message: t('message.needDataSource', 'Provide filePath, content, or base64Data') }
      }
      if (args.contentType) params.ContentType = args.contentType
      const result = await cos.putObject(params)
      return { success: true, message: t('message.uploadOk', 'Upload succeeded: {key}').replace('{key}', args.key), data: { Key: args.key, ETag: result.ETag, Location: result.Location } }
    },
  },

  // ─── 下载文件 ─────────────────────────────
  {
    name: 'cos_download',
    label: t('action.download.label', 'COS Download File'),
    category: t('category', 'Tencent COS'),
    icon: 'Download',
    description: t('action.download.description', 'Download a file from COS to local'),
    tool: false,
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      { key: 'filePath', label: t('field.localSavePath.label', 'Local Save Path'), type: 'text', required: true, tooltip: t('field.localSavePath.tooltip', 'Full local path to save the downloaded file') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'filePath', type: 'string' },
        { key: 'contentLength', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`下载文件: ${args.key} -> ${args.filePath}`)
      const result = await cos.getObject({
        ...base,
        Key: args.key,
        Output: args.filePath,
      })
      return {
        success: true,
        message: t('message.fileDownloaded', 'File downloaded: {key}').replace('{key}', args.key),
        data: {
          filePath: args.filePath,
          contentLength: parseInt(result.headers?.['content-length'] || '0', 10),
        },
      }
    },
  },

  // ─── 获取文件内容 ─────────────────────────
  {
    name: 'cos_get_content',
    label: t('action.getContent.label', 'COS Get Content'),
    category: t('category', 'Tencent COS'),
    icon: 'FileText',
    description: t('action.getContent.description', 'Get file text content from COS'),
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      ...configProperties,
    ],
    toolProperties: {
      type: 'object',
      properties: {
        secretId: { type: 'string', description: '腾讯云 SecretId' },
        secretKey: { type: 'string', description: '腾讯云 SecretKey' },
        bucket: { type: 'string', description: '存储桶名称' },
        region: { type: 'string', description: '地域' },
        key: { type: 'string', description: 'COS 文件路径' },
        filePath: { type: 'string', description: '本地保存路径（不填则返回文本内容）' },
      },
      required: ['secretId', 'secretKey', 'bucket', 'region', 'key'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'content', type: 'string' },
        { key: 'contentType', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      if (args.filePath) {
        ctx.logger.info(`下载文件: ${args.key} -> ${args.filePath}`)
        await cos.getObject({ ...base, Key: args.key, Output: args.filePath })
        return { success: true, message: t('message.downloadedTo', 'Downloaded to: {filePath}').replace('{filePath}', args.filePath), data: { filePath: args.filePath } }
      }
      ctx.logger.info(`获取内容: ${args.key}`)
      const result = await cos.getObject({ ...base, Key: args.key })
      const content = result.Body?.toString('utf-8') || ''
      return {
        success: true,
        message: t('message.contentRead', 'Content read: {key}').replace('{key}', args.key),
        data: { content, contentType: result.headers?.['content-type'] || '' },
      }
    },
  },

  // ─── 删除文件 ─────────────────────────────
  {
    name: 'cos_delete',
    label: t('action.delete.label', 'COS Delete File'),
    category: t('category', 'Tencent COS'),
    icon: 'Trash2',
    description: t('action.delete.description', 'Delete a file from COS'),
    tool: false,
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`删除文件: ${args.key}`)
      await cos.deleteObject({ ...base, Key: args.key })
      return { success: true, message: t('message.fileDeleted', 'File deleted: {key}').replace('{key}', args.key) }
    },
  },

  // ─── 删除（agent tool 合并版）──────────────
  {
    name: 'cos_delete_tool',
    label: t('action.deleteTool.label', 'COS Delete'),
    category: t('category', 'Tencent COS'),
    icon: 'Trash2',
    description: t('action.deleteTool.description', 'Delete files from Tencent COS. Supports single or batch deletion.'),
    toolOnly: true,
    toolProperties: {
      type: 'object',
      properties: {
        secretId: { type: 'string', description: '腾讯云 SecretId' },
        secretKey: { type: 'string', description: '腾讯云 SecretKey' },
        bucket: { type: 'string', description: '存储桶名称' },
        region: { type: 'string', description: '地域' },
        key: { type: 'string', description: '单个文件路径' },
        keys: { type: 'array', items: { type: 'string' }, description: '多个文件路径数组（批量删除）' },
      },
      required: ['secretId', 'secretKey', 'bucket', 'region'],
    },
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      if (args.keys?.length) {
        const result = await cos.deleteMultipleObject({
          ...base,
          Objects: args.keys.map(k => ({ Key: k })),
        })
        return { success: true, message: t('message.batchDeleteDone', 'Batch delete completed'), data: { deleted: result.Deleted || [], errors: result.Error || [] } }
      }
      if (args.key) {
        await cos.deleteObject({ ...base, Key: args.key })
        return { success: true, message: t('message.deleted', 'Deleted: {key}').replace('{key}', args.key) }
      }
      return { success: false, message: t('message.needKeyOrKeys', 'Provide key or keys') }
    },
  },

  // ─── 批量删除 ─────────────────────────────
  {
    name: 'cos_delete_multi',
    label: t('action.deleteMulti.label', 'COS Batch Delete'),
    category: t('category', 'Tencent COS'),
    icon: 'Trash',
    description: t('action.deleteMulti.description', 'Delete multiple files from COS'),
    tool: false,
    properties: [
      { key: 'keys', label: t('field.keys.label', 'Object Path List'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.keys.tooltip', 'JSON array format, e.g. ["a.txt","b.txt"]') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'deleted', type: 'object', children: [] },
        { key: 'errors', type: 'object', children: [] },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      const keyList = Array.isArray(args.keys) ? args.keys : JSON.parse(args.keys)
      ctx.logger.info(`批量删除: ${keyList.length} 个文件`)
      const result = await cos.deleteMultipleObject({
        ...base,
        Objects: keyList.map(k => ({ Key: k })),
      })
      return {
        success: true,
        message: t('message.batchDeleteDone', 'Batch delete completed'),
        data: {
          deleted: result.Deleted || [],
          errors: result.Error || [],
        },
      }
    },
  },

  // ─── 列举文件 ─────────────────────────────
  {
    name: 'cos_list',
    label: t('action.list.label', 'COS List Files'),
    category: t('category', 'Tencent COS'),
    icon: 'FolderSearch',
    description: t('action.list.description', 'List files with a specified prefix in the bucket'),
    properties: [
      { key: 'prefix', label: t('field.prefix.label', 'Prefix'), type: 'text', tooltip: t('field.prefix.tooltip', 'Only list files starting with this prefix') },
      { key: 'delimiter', label: t('field.delimiter.label', 'Delimiter'), type: 'text', tooltip: t('field.delimiter.tooltip', 'Used for grouping (commonly /)') },
      { key: 'maxKeys', label: t('field.maxKeys.label', 'Max Count'), type: 'number', default: 100, tooltip: t('field.maxKeys.tooltip', 'Maximum number of results per request') },
      { key: 'marker', label: t('field.marker.label', 'Marker'), type: 'text', tooltip: t('field.marker.tooltip', 'Pagination marker') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'objects', type: 'object', children: [] },
        { key: 'commonPrefixes', type: 'object', children: [] },
        { key: 'nextMarker', type: 'string' },
        { key: 'isTruncated', type: 'boolean' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      const params = { ...base }
      if (args.prefix) params.Prefix = args.prefix
      if (args.delimiter) params.Delimiter = args.delimiter
      if (args.maxKeys) params.MaxKeys = args.maxKeys
      if (args.marker) params.Marker = args.marker

      ctx.logger.info(`列举文件: prefix=${args.prefix || '(全部)'}, max=${args.maxKeys || 100}`)
      const result = await cos.getBucket(params)
      const objects = (result.Contents || []).map(o => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified,
        etag: o.ETag,
      }))
      ctx.logger.info(`共 ${objects.length} 个文件`)
      return {
        success: true,
        message: t('message.listCount', 'Found {count} files').replace('{count}', String(objects.length)),
        data: {
          objects,
          commonPrefixes: result.CommonPrefixes || [],
          nextMarker: result.NextMarker || '',
          isTruncated: result.IsTruncated === 'true',
        },
      }
    },
  },

  // ─── 签名URL ──────────────────────────────
  {
    name: 'cos_sign_url',
    label: t('action.signUrl.label', 'COS Signed URL'),
    category: t('category', 'Tencent COS'),
    icon: 'Link',
    description: t('action.signUrl.description', 'Generate a temporary signed access URL'),
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      { key: 'expires', label: t('field.expires.label', 'Expires (seconds)'), type: 'number', default: 3600, tooltip: t('field.expires.tooltip', 'URL validity period, default 1 hour') },
      { key: 'method', label: t('field.method.label', 'HTTP Method'), type: 'select', default: 'GET', options: [
        { label: 'GET', value: 'GET' },
        { label: 'PUT', value: 'PUT' },
      ] },
      { key: 'responseContentType', label: t('field.responseContentType.label', 'Response Content-Type'), type: 'text', tooltip: t('field.responseContentType.tooltip', 'Content-Type for forced download') },
      { key: 'responseContentDisposition', label: t('field.responseContentDisposition.label', 'Response Content-Disposition'), type: 'text', tooltip: t('field.responseContentDisposition.tooltip', 'Example: attachment; filename="file.txt"') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'url', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      const params = {
        ...base,
        Key: args.key,
        Sign: true,
        Expires: args.expires || 3600,
        Method: (args.method || 'GET').toUpperCase(),
      }
      if (args.responseContentType) params.ResponseContentType = args.responseContentType
      if (args.responseContentDisposition) params.ResponseContentDisposition = args.responseContentDisposition

      ctx.logger.info(`生成签名URL: ${args.key}, 有效期 ${args.expires || 3600}s`)
      const url = cos.getObjectUrl(params)
      return {
        success: true,
        message: t('message.signedUrlGenerated', 'Signed URL generated'),
        data: { url },
      }
    },
  },

  // ─── 复制文件 ─────────────────────────────
  {
    name: 'cos_copy',
    label: t('action.copy.label', 'COS Copy File'),
    category: t('category', 'Tencent COS'),
    icon: 'Copy',
    description: t('action.copy.description', 'Copy a file within COS (supports cross-bucket)'),
    properties: [
      { key: 'key', label: t('field.targetKey.label', 'Target Object Path'), type: 'text', required: true, tooltip: t('field.targetKey.tooltip', 'COS path after copy') },
      { key: 'sourceKey', label: t('field.sourceKey.label', 'Source Object Path'), type: 'text', required: true, tooltip: t('field.sourceKey.tooltip', 'Source file COS path') },
      { key: 'sourceBucket', label: t('field.sourceBucket.label', 'Source Bucket'), type: 'text', tooltip: t('field.sourceBucket.tooltip', 'Source bucket name (defaults to same bucket)') },
      { key: 'sourceRegion', label: t('field.sourceRegion.label', 'Source Region'), type: 'text', tooltip: t('field.sourceRegion.tooltip', 'Source bucket region (defaults to same region)') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'Key', type: 'string' },
        { key: 'ETag', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      const sourceBucket = args.sourceBucket || args.bucket
      const sourceRegion = args.sourceRegion || args.region
      const copySource = `${sourceBucket}.cos.${sourceRegion}.myqcloud.com/${encodeURI(args.sourceKey)}`
      ctx.logger.info(`复制文件: ${copySource} -> ${args.key}`)
      const result = await cos.putObjectCopy({
        ...base,
        Key: args.key,
        CopySource: copySource,
      })
      return {
        success: true,
        message: t('message.fileCopied', 'File copied: {sourceKey} -> {key}')
          .replace('{sourceKey}', args.sourceKey)
          .replace('{key}', args.key),
        data: { Key: args.key, ETag: result.ETag },
      }
    },
  },

  // ─── 检测文件是否存在 ─────────────────────
  {
    name: 'cos_head',
    label: t('action.head.label', 'COS File Info'),
    category: t('category', 'Tencent COS'),
    icon: 'Info',
    description: t('action.head.description', 'Get COS file metadata (size, type, last modified, etc.)'),
    properties: [
      { key: 'key', label: t('field.key.label', 'Object Path'), type: 'text', required: true, tooltip: t('field.key.tooltip', 'Full path in COS') },
      ...configProperties,
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'exists', type: 'boolean' },
        { key: 'size', type: 'number' },
        { key: 'contentType', type: 'string' },
        { key: 'lastModified', type: 'string' },
        { key: 'etag', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const cos = createClient(args)
      const base = getBucketParams(args)
      ctx.logger.info(`获取文件信息: ${args.key}`)
      try {
        const result = await cos.headObject({ ...base, Key: args.key })
        return {
          success: true,
          message: t('message.fileExists', 'File exists: {key}').replace('{key}', args.key),
          data: {
            exists: true,
            size: parseInt(result.headers?.['content-length'] || '0', 10),
            contentType: result.headers?.['content-type'] || '',
            lastModified: result.headers?.['last-modified'] || '',
            etag: result.headers?.etag || '',
          },
        }
      } catch (e) {
        if (e.statusCode === 404) {
          return { success: true, message: t('message.fileNotExists', 'File does not exist: {key}').replace('{key}', args.key), data: { exists: false } }
        }
        throw e
      }
    },
  },
  ]
}
