const { MiraClient } = require('mira-app-core/shared/sdk')

let _client = null
let _clientKey = null

function makeKey(config) {
  // 配置（地址/账号/token）任一变化都重建 client，避免单例串台
  return [config.baseUrl || '', config.username || '', config.token || ''].join('|')
}

function hasCredentials(config) {
  return !!(config && config.username && config.password)
}

/**
 * 判断是否为认证类错误（token 缺失或失效）
 * HttpClient 对非 2xx 响应 reject 出 { error: 'HTTP_ERROR', message }
 * 服务端 401 的 message 形如「未提供认证令牌」/「无效或过期的认证令牌」
 */
function isAuthError(err) {
  if (!err) return false
  if (err.error !== 'HTTP_ERROR') return false
  const msg = String(err.message || '')
  return /认证令牌|token/i.test(msg)
}

/**
 * 获取或创建 MiraClient 单例（按配置 key 缓存）
 * - 配置了 token：直接使用 token
 * - 仅配置了账号密码：首次创建时自动登录一次，拿回 token
 */
async function getClient(config) {
  const key = makeKey(config)
  if (_client && _clientKey === key) return _client

  const baseUrl = (config.baseUrl || 'http://localhost:8081').trim()
  const timeout = Number(config.timeout) || 15000
  const client = new MiraClient(baseUrl, { timeout })

  if (config.token) {
    client.auth().setToken(config.token)
  } else if (hasCredentials(config)) {
    await client.auth().login(config.username, config.password)
  }

  _client = client
  _clientKey = key
  return client
}

/**
 * 重置客户端（配置变更、强制重新登录时调用）
 */
function resetClient() {
  _client = null
  _clientKey = null
}

/**
 * 用配置中的账号密码重新登录，刷新 client 上的 token
 */
async function loginWithConfig(client, config) {
  if (!hasCredentials(config)) return
  await client.auth().login(config.username, config.password)
}

/**
 * 执行一次受认证保护的请求。
 * - 正常情况：直接执行 fn
 * - token 失效（401）：若配置了账号密码，自动重新登录后重试一次；否则原样抛出
 *
 * 所有节点统一通过它发起请求，无需手动登录节点。
 */
async function request(config, fn) {
  const client = await getClient(config)
  try {
    return await fn(client)
  } catch (err) {
    if (isAuthError(err) && hasCredentials(config)) {
      // token 失效 → 用账号密码重新登录后重试一次
      await loginWithConfig(client, config)
      return await fn(client)
    }
    throw err
  }
}

/**
 * 调用 SDK 尚未封装的 API，复用 MiraClient 的 axios 实例以保持鉴权、baseURL 和超时配置。
 */
async function requestRaw(config, method, path, body, query) {
  return request(config, async client => {
    const http = client.getHttpClient()
    const axios = http.getAxiosInstance()
    const response = await axios.request({
      method: String(method || 'GET').toLowerCase(),
      url: path,
      params: query && typeof query === 'object' ? query : undefined,
      data: body,
    })
    const data = response.data
    return data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'data')
      ? data.data
      : data
  })
}

module.exports = { getClient, resetClient, request, requestRaw, isAuthError, hasCredentials }
