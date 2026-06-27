const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('feishu plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('feishu plugin deactivated')
}
