const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('文件系统插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('文件系统插件已停用')
}
