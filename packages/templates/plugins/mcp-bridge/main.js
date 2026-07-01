const actions = require('./actions')
const pool = require('./lib/connection-pool')

exports.activate = (context) => {
  context.registerActions(actions(context.t))
  context.logger.info('mcp-bridge plugin activated')
}

exports.deactivate = (context) => {
  // 关闭所有常驻 MCP 连接，释放 stdio 子进程
  try {
    pool.closeAll()
  } catch {
    /* ignore */
  }
  context.logger.info('mcp-bridge plugin deactivated')
}
