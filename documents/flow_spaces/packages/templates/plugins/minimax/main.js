const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('MiniMax AI 插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('MiniMax AI 插件已停用')
}
