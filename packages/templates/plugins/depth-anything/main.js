const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('Depth Anything plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Depth Anything plugin deactivated')
}
