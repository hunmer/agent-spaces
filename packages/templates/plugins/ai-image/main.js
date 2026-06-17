const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('AI图片生成与编辑插件已激活')
}

exports.deactivate = (context) => {
  context.logger.info('AI图片生成与编辑插件已停用')
}
