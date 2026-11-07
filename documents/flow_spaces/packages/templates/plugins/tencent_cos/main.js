const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('腾讯云COS插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('腾讯云COS插件已停用')
}
