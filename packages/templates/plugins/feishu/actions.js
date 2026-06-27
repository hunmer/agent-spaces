const fs = require('fs')
const lark = require('@larksuiteoapi/node-sdk')

const CONFIG_PREFIX = '{{ __config__["workflow.feishu"]'

// receive_id_type 取值
const RECEIVE_ID_TYPES = ['chat_id', 'open_id', 'user_id', 'email']
// 飞书支持的 msg_type
const MSG_TYPES = ['text', 'post', 'image', 'interactive', 'share_chat', 'share_user', 'file', 'audio', 'media', 'sticker', 'overflow']

// 解析成字符串数组（兼容逗号分隔字符串、JSON 数组、原始数组）
function toStringArray(val) {
  if (val == null || val === '') return []
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') {
    const s = val.trim()
    // JSON 数组优先
    if (s.startsWith('[')) {
      try { return JSON.parse(s).map(String) } catch (_) { /* fallthrough */ }
    }
    return s.split(/[,\n]/).map(x => x.trim()).filter(Boolean)
  }
  return [String(val)]
}

// JSON 安全解析；解析失败时原样返回字符串
function parseJSON(val, fallback) {
  if (val == null) return fallback
  if (typeof val !== 'string') return val
  const s = val.trim()
  if (!s) return fallback
  try { return JSON.parse(s) } catch (_) { return fallback != null ? fallback : s }
}

// 根据域名配置生成 SDK 的 domain 选项
function resolveDomain(domain) {
  const d = String(domain || '').trim().toLowerCase()
  if (!d || d === 'feishu') return lark.Domain.Feishu
  if (d === 'lark' || d === 'larksuite') return lark.Domain.Lark
  // 其它自定义完整域名（host）
  return d
}

// 构造飞书 SDK client（自建应用）
function createClient(args) {
  const baseConfig = {
    appId: args.appId,
    appSecret: args.appSecret,
    domain: resolveDomain(args.domain),
    appType: lark.AppType.SelfBuild,
  }
  return new lark.Client(baseConfig)
}

// 把节点入参组装成各消息类型的 content 对象
function buildMessageContent(args, ctx) {
  const msgType = args.msgType
  switch (msgType) {
    case 'text': {
      const text = args.text || ''
      const content = { text }
      const atList = toStringArray(args.at)
      if (atList.length || args.atAll) {
        // 飞书 @ 人格式：<at user_id="xxx"></at>，@所有人：<at user_id="all"></at>
        const segs = []
        if (args.atAll) segs.push('<at user_id="all"></at>')
        atList.forEach(u => segs.push(`<at user_id="${u}"></at>`))
        content.text = `${segs.join('')}${text}`
      }
      return content
    }
    case 'post':
    case 'overflow':
      return parseJSON(args.post || args.content, {})
    case 'image':
      return { image_key: args.imageKey }
    case 'interactive':
      return parseJSON(args.card, {})
    case 'share_chat':
      return { share_chat_id: args.shareChatId }
    case 'share_user':
      return { user_id: args.shareUserId }
    case 'file':
      return { file_key: args.fileKey }
    case 'audio':
      return { file_key: args.fileKey }
    case 'media':
      return {
        file_key: args.fileKey,
        ...(args.imgKey && { image_key: args.imgKey }),
      }
    case 'sticker':
      return { file_key: args.fileKey }
    default:
      throw new Error(`unsupported msg_type: ${msgType}`)
  }
}

// 从本地文件路径或 URL 上传文件，得到 file_key
async function uploadFile(ctx, client, args) {
  const fileType = args.fileType || 'stream'
  const fileName = args.fileName || 'file'
  const path = args.filePath
  if (!path) throw new Error('filePath is required for upload')
  ctx.logger.info(`feishu upload: type=${fileType} name=${fileName} src=${path}`)

  const isHttp = /^https?:\/\//i.test(path)
  if (isHttp) {
    const resp = await fetch(path)
    if (!resp.ok) throw new Error(`fetch ${path} failed: ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const res = await client.im.file.create({
      data: { file_type: fileType, file_name: fileName, file: buf },
    })
    if (!res?.file_key) throw new Error(`upload response missing file_key: ${JSON.stringify(res)}`)
    return res.file_key
  }

  const buf = fs.readFileSync(path)
  const res = await client.im.file.create({
    data: { file_type: fileType, file_name: fileName, file: buf },
  })
  if (!res?.file_key) throw new Error(`upload response missing file_key: ${JSON.stringify(res)}`)
  return res.file_key
}

module.exports = (t) => [
  {
    name: 'feishu_send_message',
    label: t('action.send.label', 'Send Feishu Message'),
    category: t('category', 'Feishu'),
    icon: 'MessageSquare',
    description: t('action.send.description', 'Send a message to a chat/user via Feishu Open Platform SDK'),
    properties: [
      { key: 'appId', label: t('field.appId.label', 'App ID'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["appId"]}}`, tooltip: t('field.appId.tooltip', 'Feishu self-built app id (cli_xxx)') },
      { key: 'appSecret', label: t('field.appSecret.label', 'App Secret'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["appSecret"]}}`, tooltip: t('field.appSecret.tooltip', 'Feishu self-built app secret') },
      { key: 'domain', label: t('field.domain.label', 'Domain'), type: 'select', dataType: 'string', default: `${CONFIG_PREFIX}["domain"] || "feishu"}}`, options: ['feishu', 'lark'], tooltip: t('field.domain.tooltip', 'feishu for China, lark for overseas') },
      { key: 'receiveIdType', label: t('field.receiveIdType.label', 'Receive ID Type'), type: 'select', dataType: 'string', required: true, default: 'chat_id', options: RECEIVE_ID_TYPES, tooltip: t('field.receiveIdType.tooltip', 'Type of the receive_id') },
      { key: 'receiveId', label: t('field.receiveId.label', 'Receive ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.receiveId.tooltip', 'chat_id / open_id / user_id / email of the target') },
      { key: 'msgType', label: t('field.msgType.label', 'Message Type'), type: 'select', dataType: 'string', required: true, default: 'text', options: MSG_TYPES, tooltip: t('field.msgType.tooltip', 'Feishu msg_type') },
      // text
      { key: 'text', label: t('field.text.label', 'Text Content'), type: 'textarea', dataType: 'string', tooltip: t('field.text.tooltip', 'Plain text for text type') },
      { key: 'at', label: t('field.at.label', '@User IDs'), type: 'text', dataType: 'string[]', tooltip: t('field.at.tooltip', 'open_id list to @mention, comma-separated') },
      { key: 'atAll', label: t('field.atAll.label', '@All'), type: 'boolean', dataType: 'boolean', default: false },
      // post / interactive
      { key: 'post', label: t('field.post.label', 'Post Content'), type: 'textarea', dataType: 'object', tooltip: t('field.post.tooltip', 'Rich text JSON (post/overflow)') },
      { key: 'card', label: t('field.card.label', 'Card JSON'), type: 'textarea', dataType: 'object', tooltip: t('field.card.tooltip', 'Interactive message card JSON') },
      // file/image/media keys
      { key: 'imageKey', label: t('field.imageKey.label', 'Image Key'), type: 'text', dataType: 'string', tooltip: t('field.imageKey.tooltip', 'image_key for image type') },
      { key: 'fileKey', label: t('field.fileKey.label', 'File Key'), type: 'text', dataType: 'string', tooltip: t('field.fileKey.tooltip', 'file_key for file/audio/media/sticker') },
      { key: 'imgKey', label: t('field.imgKey.label', 'Media Cover Key'), type: 'text', dataType: 'string', tooltip: t('field.imgKey.tooltip', 'cover image_key for media type (video)') },
      { key: 'shareChatId', label: t('field.shareChatId.label', 'Share Chat ID'), type: 'text', dataType: 'string', tooltip: t('field.shareChatId.tooltip', 'share_chat_id for share_chat') },
      { key: 'shareUserId', label: t('field.shareUserId.label', 'Share User ID'), type: 'text', dataType: 'string', tooltip: t('field.shareUserId.tooltip', 'user_id for share_user') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'message_id', type: 'string' },
        { key: 'receive_id', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      if (!args.appId || !args.appSecret) {
        return { success: false, message: t('message.missingConfig', 'Missing App ID or App Secret'), data: {} }
      }
      if (!args.receiveId) {
        return { success: false, message: t('message.missingReceiveId', 'Missing receive id'), data: {} }
      }

      const client = createClient(args)
      let content
      try {
        content = buildMessageContent(args, ctx)
      } catch (e) {
        ctx.logger.error(`feishu build content error: ${e.message}`)
        return { success: false, message: String(e.message), data: {} }
      }

      ctx.logger.info(`feishu send: type=${args.msgType} to=${args.receiveIdType}:${args.receiveId}`)

      try {
        const res = await client.im.message.create({
          params: { receive_id_type: args.receiveIdType },
          data: {
            receive_id: args.receiveId,
            content: JSON.stringify(content),
            msg_type: args.msgType,
          },
        })

        // SDK 成功时 code 为 0
        const code = res?.code
        const msg = res?.msg
        if (code !== 0 && code !== undefined) {
          ctx.logger.error(`feishu error: ${code} ${msg}`)
          return {
            success: false,
            message: t('message.failed', 'Feishu send failed: [{code}] {msg}').replace('{code}', code).replace('{msg}', msg || ''),
            data: { message_id: res?.data?.message_id, receive_id: res?.data?.receive_id },
          }
        }

        const messageId = res?.data?.message_id
        return {
          success: true,
          message: t('message.sent', 'Feishu message sent successfully'),
          data: { message_id: messageId, receive_id: res?.data?.receive_id },
        }
      } catch (e) {
        ctx.logger.error(`feishu send exception: ${e?.message || e}`)
        return { success: false, message: String(e?.message || e), data: {} }
      }
    },
  },

  {
    name: 'feishu_upload_file',
    label: t('action.upload.label', 'Upload Feishu File'),
    category: t('category', 'Feishu'),
    icon: 'Upload',
    description: t('action.upload.description', 'Upload a file to Feishu and return the file_key (for image/file/media/sticker messages)'),
    properties: [
      { key: 'appId', label: t('field.appId.label', 'App ID'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["appId"]}}` },
      { key: 'appSecret', label: t('field.appSecret.label', 'App Secret'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["appSecret"]}}` },
      { key: 'domain', label: t('field.domain.label', 'Domain'), type: 'select', dataType: 'string', default: `${CONFIG_PREFIX}["domain"] || "feishu"}}`, options: ['feishu', 'lark'] },
      { key: 'filePath', label: t('field.filePath.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.filePath.tooltip', 'Local path or http(s) URL of the file to upload') },
      { key: 'fileType', label: t('field.fileType.label', 'File Type'), type: 'select', dataType: 'string', default: 'stream', options: ['opus', 'mp4', 'pdf', 'doc', 'xls', 'ppt', 'stream'], tooltip: t('field.fileType.tooltip', 'opus=audio, mp4=video, stream=others (image uses image upload)') },
      { key: 'fileName', label: t('field.fileName.label', 'File Name'), type: 'text', dataType: 'string', tooltip: t('field.fileName.tooltip', 'File name with extension; defaults to "file"') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'file_key', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      if (!args.appId || !args.appSecret) {
        return { success: false, message: t('message.missingConfig', 'Missing App ID or App Secret'), data: {} }
      }
      const client = createClient(args)
      try {
        const fileKey = await uploadFile(ctx, client, args)
        return {
          success: true,
          message: t('message.uploaded', 'Feishu file uploaded: {key}').replace('{key}', fileKey),
          data: { file_key: fileKey },
        }
      } catch (e) {
        ctx.logger.error(`feishu upload exception: ${e?.message || e}`)
        return { success: false, message: String(e?.message || e), data: {} }
      }
    },
  },
]
