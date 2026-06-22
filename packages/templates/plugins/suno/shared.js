/**
 * Suno 插件共享网络工具
 *
 * 集中 HTTP（含代理隧道）、鉴权、任务轮询逻辑，
 * actions.js 通过 require('./shared') 引用。
 */
const https = require('https')
const http = require('http')
const { URL } = require('url')
const tls = require('tls')
const net = require('net')

const SUNO_BASE_URL = 'https://api.sunoapi.org'

// ---------- Config ----------

let _config = {}

function setConfig(config) {
  _config = config || {}
}

// ---------- Proxy Support ----------

/**
 * 通过 HTTP 代理建立 HTTPS CONNECT 隧道：TCP -> proxy -> CONNECT -> 200 -> TLS upgrade
 */
function createHttpsTunnel(proxyUrl, targetHost, targetPort) {
  const proxy = new URL(proxyUrl)
  const proxyPort = parseInt(proxy.port) || 8080
  const proxyHost = proxy.hostname

  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxyHost)
    const onError = (err) => { socket.destroy(); reject(err) }

    socket.once('error', onError)

    socket.once('connect', () => {
      let authHeader = ''
      if (proxy.username || proxy.password) {
        const credentials = Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`
        ).toString('base64')
        authHeader = `Proxy-Authorization: Basic ${credentials}\r\n`
      }

      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
        `Host: ${targetHost}:${targetPort}\r\n` +
        authHeader +
        '\r\n'
      )
    })

    let response = ''
    const onData = (chunk) => {
      response += chunk.toString()
      if (response.indexOf('\r\n\r\n') === -1) return

      socket.removeListener('data', onData)

      const statusLine = response.substring(0, response.indexOf('\r\n'))
      const statusCode = parseInt(statusLine.split(' ')[1])

      if (statusCode !== 200) {
        socket.destroy()
        return reject(new Error(`代理连接失败: ${statusLine}`))
      }

      const tlsSocket = tls.connect({ socket, servername: targetHost }, () => resolve(tlsSocket))
      tlsSocket.once('error', onError)
    }

    socket.on('data', onData)
    socket.once('timeout', () => onError(new Error('代理连接超时')))
  })
}

/**
 * 创建 HTTP(S) 请求，支持可选代理
 */
async function createProxiedRequest(url, method, headers, timeout, proxy) {
  const parsed = new URL(url)

  if (proxy && parsed.protocol === 'https:') {
    const targetPort = parseInt(parsed.port) || 443
    const tunnel = await createHttpsTunnel(proxy, parsed.hostname, targetPort)
    const agent = new https.Agent({ keepAlive: false })
    agent.createConnection = () => tunnel
    return https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers,
      timeout,
      agent,
    })
  }

  if (proxy && parsed.protocol === 'http:') {
    const proxyParsed = new URL(proxy)
    return http.request({
      hostname: proxyParsed.hostname,
      port: proxyParsed.port || 8080,
      path: url,
      method,
      headers,
      timeout,
    })
  }

  const mod = parsed.protocol === 'https:' ? https : http
  return mod.request(url, { method, headers, timeout })
}

// ---------- HTTP 工具 ----------

/**
 * 通用 JSON 请求，返回解析后的响应体。
 * HTTP 层错误（>=400）抛异常；业务层 code 交由调用方判断。
 */
async function requestJson(method, url, options = {}) {
  const body = options.body ? JSON.stringify(options.body) : ''
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'workflow/1.0',
    ...options.headers,
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Length'] = Buffer.byteLength(body)
  }
  const timeout = options.timeout || 60000
  const req = await createProxiedRequest(url, method, headers, timeout, options.proxy || null)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
      if (res.statusCode === 401) {
        res.resume()
        return reject(new Error('认证失败：API Key 无效或已过期'))
      }
      if (res.statusCode === 402) {
        res.resume()
        return reject(new Error('余额不足：请检查 Suno 账户额度'))
      }
      if (res.statusCode >= 400) {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
        })
        return
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
        } catch (e) {
          reject(new Error('响应解析失败'))
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    if (method !== 'GET' && method !== 'HEAD') req.write(body)
    req.end()
  })
}

async function postJson(url, options) {
  return requestJson('POST', url, options)
}

async function getJson(url, options) {
  return requestJson('GET', url, options)
}

// ---------- 任务轮询 ----------

/**
 * 查询任务状态：GET /api/v1/generate/record-info?taskId=
 * 返回 { code, msg, data: { taskId, status, response, errorMessage } }
 */
async function getTaskStatus(baseUrl, apiKey, taskId, proxy) {
  const url = `${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`
  return getJson(url, { headers: buildAuthHeader(apiKey), proxy, timeout: 30000 })
}

/**
 * 轮询任务直到 SUCCESS / FAILED，或超过 maxWaitMs。
 *
 * @param {object} opts - { baseUrl, apiKey, proxy, taskId, intervalMs, maxWaitMs, logger }
 * @returns {Promise<object>} Suno record-info 的 data 字段
 */
async function waitForTask(opts) {
  const {
    baseUrl,
    apiKey,
    proxy,
    taskId,
    intervalMs = 15000,
    maxWaitMs = 600000,
    logger,
  } = opts

  const start = Date.now()
  let lastStatus = ''

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const elapsed = Date.now() - start
    if (elapsed > maxWaitMs) {
      throw new Error(`轮询超时（${Math.round(maxWaitMs / 1000)}s），最后状态：${lastStatus || 'UNKNOWN'}，taskId=${taskId}`)
    }

    const resp = await getTaskStatus(baseUrl, apiKey, taskId, proxy)
    if (resp.code !== 200) {
      throw new Error(`查询任务状态失败：${resp.msg || JSON.stringify(resp).slice(0, 200)}`)
    }

    const data = resp.data || {}
    lastStatus = data.status || ''

    if (logger) {
      logger.info(`Poll taskId=${taskId} status=${lastStatus} elapsed=${Math.round(elapsed / 1000)}s`)
    }

    if (data.status === 'SUCCESS') {
      return data
    }
    if (data.status === 'FAILED' || data.status === 'ERROR') {
      throw new Error(`任务失败：${data.errorMessage || data.error || 'unknown error'}`)
    }

    await sleep(intervalMs)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ---------- 鉴权与地址解析 ----------

function buildAuthHeader(apiKey) {
  if (!apiKey) throw new Error('缺少 apiKey（请在插件配置中设置 Suno API Key）')
  return { 'Authorization': `Bearer ${apiKey}` }
}

function resolveBaseUrl(args) {
  return args.baseUrl || _config.baseUrl || SUNO_BASE_URL
}

function resolveProxy(args) {
  return args.proxy || _config.httpProxy || ''
}

function resolveCallBackUrl(args) {
  return args.callBackUrl || _config.callBackUrl || ''
}

function resolveDefaultModel(args) {
  return args.model || _config.defaultModel || 'V4_5'
}

/**
 * 提交任务后，根据 args.wait 决定是否轮询到完成。
 * - wait=false（默认）：返回 { taskId, status, waited: false }
 * - wait=true：轮询，返回 { taskId, status:'SUCCESS', response, waited: true }
 */
async function maybeWait({ baseUrl, apiKey, proxy, taskId, args, logger, t }) {
  const wait = args.wait === true || args.wait === 'true'
  if (!wait) {
    return {
      success: true,
      waited: false,
      taskId,
      status: 'GENERATING',
      message: t('message.taskSubmitted', 'Task submitted, taskId={taskId}').replace('{taskId}', taskId),
      data: { taskId, status: 'GENERATING' },
    }
  }

  const data = await waitForTask({
    baseUrl,
    apiKey,
    proxy,
    taskId,
    intervalMs: parseInt(args.pollInterval) > 0 ? parseInt(args.pollInterval) * 1000 : 15000,
    maxWaitMs: parseInt(args.maxWait) > 0 ? parseInt(args.maxWait) * 1000 : 600000,
    logger,
  })

  return {
    success: true,
    waited: true,
    taskId,
    status: data.status,
    response: data.response,
    message: t('message.taskDone', 'Task completed, taskId={taskId}').replace('{taskId}', taskId),
    data: data.response || data,
  }
}

module.exports = {
  setConfig,
  postJson,
  getJson,
  getTaskStatus,
  waitForTask,
  maybeWait,
  buildAuthHeader,
  resolveBaseUrl,
  resolveProxy,
  resolveCallBackUrl,
  resolveDefaultModel,
}
