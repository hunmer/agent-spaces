const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('Rembg plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Rembg plugin deactivated')
}
