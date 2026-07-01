const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('mcp-bridge plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('mcp-bridge plugin deactivated')
}
