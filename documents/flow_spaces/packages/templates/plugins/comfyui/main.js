const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('ComfyUI plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('ComfyUI plugin deactivated')
}
