const MiraClient = require('mira-app-core/shared/sdk').MiraClient

let _client = null

/**
 * 获取或创建 MiraClient 单例
 */
async function getClient(config) {
  if (_client) return _client

  const baseUrl = config.baseUrl || 'http://localhost:8081'
  const timeout = config.timeout || 15000

  const client = new MiraClient(baseUrl, { timeout })

  // Token 优先，否则用用户名密码登录
  if (config.token) {
    client.auth().setToken(config.token)
  } else if (config.username && config.password) {
    await client.auth().login(config.username, config.password)
  }

  _client = client
  return client
}

/**
 * 重置客户端（配置变更时调用）
 */
function resetClient() {
  _client = null
}

module.exports = { getClient, resetClient }
