const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('Baidu AI Image plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Baidu AI Image plugin deactivated')
}
