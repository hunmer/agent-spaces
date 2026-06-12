const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('custom view demo plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('custom view demo plugin deactivated')
}
