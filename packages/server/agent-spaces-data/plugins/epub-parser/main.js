const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('EPUB解析器插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('EPUB解析器插件已停用')
}
