'use strict'

const actions = require('./actions')

exports.activate = (context) => {
  context.registerActions(actions)
  context.logger.info('feed-parser plugin activated')
}

exports.deactivate = (context) => {
  context.logger.info('feed-parser plugin deactivated')
}
