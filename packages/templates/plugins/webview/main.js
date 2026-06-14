const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('webview plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('webview plugin deactivated')
}
