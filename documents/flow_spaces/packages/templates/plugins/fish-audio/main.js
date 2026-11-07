const actions = require('./actions')
const shared = require('./shared')

exports.activate = (context) => {
  shared.setConfig(context.config)
  context.registerActions(actions)
  context.logger.info('FishAudio 语音合成插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('FishAudio 语音合成插件已停用')
}
