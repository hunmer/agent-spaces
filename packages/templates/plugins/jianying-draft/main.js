const actions = require('./actions')
const shared = require('./shared')

exports.activate = (context) => {
  shared.setConfig(context.config)
  context.registerActions(actions(context.t))
  context.logger.info('JianYing Draft plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('JianYing Draft plugin deactivated')
}
