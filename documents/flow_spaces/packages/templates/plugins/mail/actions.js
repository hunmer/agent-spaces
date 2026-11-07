const nodemailer = require('nodemailer')

function createTransporter(config) {
  const port = Number(config.port) || 465
  return nodemailer.createTransport({
    host: config.host,
    port,
    secure: port === 465,
    auth: { user: config.user, pass: config.pass },
  })
}

const CONFIG_PREFIX = '{{ __config__["workflow.mail"]'

module.exports = (t) => [
  {
    name: 'mail_send',
    label: t('action.send.label', 'Send Email'),
    category: t('category', 'Email'),
    icon: 'Mail',
    description: t('action.send.description', 'Send email via SMTP'),
    properties: [
      { key: 'host', label: t('field.host.label', 'SMTP Server'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["host"]}}` },
      { key: 'port', label: t('field.port.label', 'Port'), type: 'number', dataType: 'number', default: `${CONFIG_PREFIX}["port"] || 465}}` },
      { key: 'user', label: t('field.user.label', 'Username'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["user"]}}` },
      { key: 'pass', label: t('field.pass.label', 'Password / Auth Code'), type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["pass"]}}` },
      { key: 'from', label: t('field.from.label', 'From'), type: 'text', dataType: 'string', default: `${CONFIG_PREFIX}["from"]}}`, tooltip: t('field.from.tooltip', '"Name <address>" or plain address') },
      { key: 'to', label: t('field.to.label', 'To'), type: 'text', dataType: 'string', required: true, tooltip: t('field.to.tooltip', 'Separate multiple with commas') },
      { key: 'cc', label: t('field.cc.label', 'CC'), type: 'text', dataType: 'string', tooltip: t('field.cc.tooltip', 'Separate multiple with commas') },
      { key: 'bcc', label: t('field.bcc.label', 'BCC'), type: 'text', dataType: 'string', tooltip: t('field.bcc.tooltip', 'Separate multiple with commas') },
      { key: 'subject', label: t('field.subject.label', 'Subject'), type: 'text', dataType: 'string', required: true },
      { key: 'body', label: t('field.body.label', 'Body'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.body.tooltip', 'Plain text or HTML (enable the HTML toggle below)') },
      { key: 'html', label: t('field.html.label', 'HTML Body'), type: 'boolean', dataType: 'boolean', default: false, tooltip: t('field.html.tooltip', 'Enable to render body as HTML') },
      { key: 'attachments', label: t('field.attachments.label', 'Attachment Paths'), type: 'textarea', dataType: 'string[]', tooltip: t('field.attachments.tooltip', 'JSON array of file paths, e.g. ["/path/to/file.pdf"]') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'messageId', type: 'string' },
        { key: 'response', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const config = { host: args.host, port: args.port, user: args.user, pass: args.pass }
      const transporter = createTransporter(config)

      const mailOptions = {
        from: args.from || args.user,
        to: args.to,
        subject: args.subject,
        ...(args.cc && { cc: args.cc }),
        ...(args.bcc && { bcc: args.bcc }),
      }

      mailOptions[args.html ? 'html' : 'text'] = args.body

      if (args.attachments) {
        const paths = Array.isArray(args.attachments) ? args.attachments : JSON.parse(args.attachments)
        mailOptions.attachments = paths.map(p => ({ path: p }))
      }

      ctx.logger.info(`发送邮件: ${mailOptions.from} -> ${mailOptions.to}, 主题: ${mailOptions.subject}`)
      const info = await transporter.sendMail(mailOptions)
      ctx.logger.info(`发送成功: ${info.messageId}`)
      transporter.close()

      return {
        success: true,
        message: t('message.mailSent', 'Email sent to {to}').replace('{to}', mailOptions.to),
        data: { messageId: info.messageId, response: info.response },
      }
    },
  },
]
