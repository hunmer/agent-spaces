const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('Mira SDK plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Mira SDK plugin deactivated')
}
