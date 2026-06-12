const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('钉钉插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('钉钉插件已停用')
}
