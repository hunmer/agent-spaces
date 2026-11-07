const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('阿里云AI插件已激活!')
}

exports.deactivate = (context) => {
  context.logger.info('阿里云AI插件已停用!')
}
