const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('Eagle plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Eagle plugin deactivated')
}
