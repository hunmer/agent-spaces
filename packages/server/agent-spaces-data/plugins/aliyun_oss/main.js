const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('Aliyun OSS plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('Aliyun OSS plugin deactivated')
}
