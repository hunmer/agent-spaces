const crypto = require('crypto')

function sign(secret) {
  const timestamp = Date.now()
  const stringToSign = `${timestamp}\n${secret}`
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(stringToSign)
  const sign = encodeURIComponent(hmac.update(stringToSign).digest('base64'))
  return { timestamp, sign }
}

function buildBody(args) {
  const msgtype = args.msgtype || 'text'
  const body = { msgtype }

  switch (msgtype) {
    case 'text':
      body.text = { content: args.content }
      if (args.atMobiles || args.atUserIds || args.isAtAll) {
        body.at = {
          isAtAll: args.isAtAll === true || args.isAtAll === 'true',
          ...(args.atMobiles && { atMobiles: parseList(args.atMobiles) }),
          ...(args.atUserIds && { atUserIds: parseList(args.atUserIds) }),
        }
      }
      break
    case 'link':
      body.link = {
        text: args.content,
        title: args.title,
        messageUrl: args.messageUrl,
        ...(args.picUrl && { picUrl: args.picUrl }),
      }
      break
    case 'markdown':
      body.markdown = { text: args.content, title: args.title }
      break
    case 'actionCard': {
      const card = {
        text: args.content,
        title: args.title,
        ...(args.hideAvatar && { hideAvatar: String(args.hideAvatar) }),
        ...(args.btnOrientation && { btnOrientation: String(args.btnOrientation) }),
      }
      if (args.singleTitle && args.singleURL) {
        card.singleTitle = args.singleTitle
        card.singleURL = args.singleURL
      } else if (args.btns) {
        const btns = typeof args.btns === 'string' ? JSON.parse(args.btns) : args.btns
        card.btns = btns
      }
      body.actionCard = card
      break
    }
    case 'feedCard': {
      const links = typeof args.links === 'string' ? JSON.parse(args.links) : args.links
      body.feedCard = { links }
      break
    }
  }

  return body
}

function parseList(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean)
  return val
}

const CONFIG_PREFIX = '{{ __config__["workflow.dingtalk"]'

module.exports = (t) => [
  {
    name: 'dingtalk_send',
    label: t('action.send.label', 'Send DingTalk Message'),
    category: t('category', 'DingTalk'),
    icon: 'MessageSquare',
    description: t('action.send.description', 'Send group messages via DingTalk custom robot webhook'),
    properties: [
      { key: 'accessToken', label: t('field.accessToken.label', 'Access Token'), type: 'text', required: true, default: `${CONFIG_PREFIX}["accessToken"]}}`, tooltip: t('field.accessToken.tooltip', 'access_token from the custom robot webhook URL') },
      { key: 'secret', label: t('field.secret.label', 'Sign Secret'), type: 'text', default: `${CONFIG_PREFIX}["secret"]}}`, tooltip: t('field.secret.tooltip', 'Signing secret. Leave empty if not enabled') },
      { key: 'msgtype', label: t('field.msgtype.label', 'Message Type'), type: 'select', required: true, default: 'text', options: ['text', 'markdown', 'link', 'actionCard', 'feedCard'] },
      { key: 'content', label: t('field.content.label', 'Message Content'), type: 'textarea', required: true, tooltip: t('field.content.tooltip', 'Plain text for text, Markdown for markdown type') },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', tooltip: t('field.title.tooltip', 'Title for markdown/link/actionCard') },
      { key: 'atMobiles', label: t('field.atMobiles.label', '@Phone Numbers'), type: 'text', tooltip: t('field.atMobiles.tooltip', 'Phone numbers, comma-separated') },
      { key: 'atUserIds', label: t('field.atUserIds.label', '@User IDs'), type: 'text', tooltip: t('field.atUserIds.tooltip', 'User IDs, comma-separated') },
      { key: 'isAtAll', label: t('field.isAtAll.label', '@All'), type: 'boolean', default: false },
      { key: 'messageUrl', label: t('field.messageUrl.label', 'Jump URL'), type: 'text', tooltip: t('field.messageUrl.tooltip', 'Click-through URL') },
      { key: 'picUrl', label: t('field.picUrl.label', 'Image URL'), type: 'text', tooltip: t('field.picUrl.tooltip', 'Image URL for link type') },
      { key: 'singleTitle', label: t('field.singleTitle.label', 'Button Title'), type: 'text', tooltip: t('field.singleTitle.tooltip', 'Single-button text') },
      { key: 'singleURL', label: t('field.singleURL.label', 'Button URL'), type: 'text', tooltip: t('field.singleURL.tooltip', 'Single-button click URL') },
      { key: 'btns', label: t('field.btns.label', 'Multiple Buttons'), type: 'textarea', dataType: 'object[]', tooltip: t('field.btns.tooltip', 'Buttons JSON array') },
      { key: 'links', label: t('field.links.label', 'Feed List'), type: 'textarea', dataType: 'object[]', tooltip: t('field.links.tooltip', 'feedCard links JSON array') },
      { key: 'hideAvatar', label: t('field.hideAvatar.label', 'Hide Avatar'), type: 'boolean', default: false, tooltip: t('field.hideAvatar.tooltip', 'Hide sender avatar') },
      { key: 'btnOrientation', label: t('field.btnOrientation.label', 'Horizontal Buttons'), type: 'boolean', default: false, tooltip: t('field.btnOrientation.tooltip', 'Horizontal button layout') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'errcode', type: 'number' },
        { key: 'errmsg', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      let url = `https://oapi.dingtalk.com/robot/send?access_token=${args.accessToken}`

      if (args.secret) {
        const s = sign(args.secret)
        url += `&timestamp=${s.timestamp}&sign=${s.sign}`
      }

      const body = buildBody(args)
      ctx.logger.info(`dingtalk send: type=${body.msgtype}`)

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await resp.json()

      if (result.errcode !== 0) {
        ctx.logger.error(`dingtalk error: ${result.errcode} ${result.errmsg}`)
        return {
          success: false,
          message: t('message.failed', 'DingTalk send failed: [{code}] {msg}')
            .replace('{code}', result.errcode)
            .replace('{msg}', result.errmsg),
          data: { errcode: result.errcode, errmsg: result.errmsg },
        }
      }

      return {
        success: true,
        message: t('message.sent', 'DingTalk message sent successfully'),
        data: { errcode: result.errcode, errmsg: result.errmsg },
      }
    },
  },
]
