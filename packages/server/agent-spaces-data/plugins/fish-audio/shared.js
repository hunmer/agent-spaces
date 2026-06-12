/**
 * FishAudio 插件共享网络与文件工具
 *
 * 将 TTS/STT 共用的 HTTP 和文件操作集中于此，
 * tools.js 和 workflow.js 均通过 require('./shared') 引用。
 */
const https = require('https')
const http = require('http')
const { URL } = require('url')
const fs = require('fs')
const path = require('path')
const os = require('os')
const tls = require('tls')
const net = require('net')

const FISH_AUDIO_BASE_URL = 'https://api.fish.audio'

// ---------- Config ----------

let _config = {}

function setConfig(config) {
  _config = config
}

// ---------- Proxy Support ----------

/**
 * 通过 HTTP 代理建立 HTTPS CONNECT 隧道
 *
 * 流程：TCP -> proxy -> CONNECT host:port -> 200 -> TLS upgrade
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
 * POST JSON 并返回二进制 Buffer（用于 TTS 音频流）
 */
async function postForBuffer(url, options) {
  const body = options.body ? JSON.stringify(options.body) : ''
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'workflow/1.0',
    ...options.headers,
  }
  const req = await createProxiedRequest(url, 'POST', headers, options.timeout || 120000, options.proxy || null)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
      if (res.statusCode === 401) {
        res.resume()
        return reject(new Error('认证失败：API Key 无效或已过期'))
      }
      if (res.statusCode === 402) {
        res.resume()
        return reject(new Error('余额不足：请检查 FishAudio 账户余额'))
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
      res.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        mimeType: res.headers['content-type'] || 'audio/mpeg',
      }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    req.write(body)
    req.end()
  })
}

/**
 * POST multipart/form-data（用于 STT 音频上传）
 */
async function postFormData(url, options) {
  const boundary = '----workflowBoundary' + Date.now()
  const parts = []

  if (options.file) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n` +
      `Content-Type: ${options.file.mimeType || 'audio/wav'}\r\n\r\n`
    )
  }
  if (options.language) {
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${options.language}\r\n`
    )
  }
  parts.push(`--${boundary}--\r\n`)

  let totalLength = 0
  const encodedParts = parts.map(p => {
    const buf = Buffer.from(p, 'utf-8')
    totalLength += buf.length
    return buf
  })
  if (options.file) {
    totalLength += options.file.buffer.length + 2
  }

  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': totalLength,
    'User-Agent': 'workflow/1.0',
    ...options.headers,
  }
  const req = await createProxiedRequest(url, 'POST', headers, options.timeout || 120000, options.proxy || null)

  return new Promise((resolve, reject) => {
    req.on('response', (res) => {
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

    for (const part of encodedParts) {
      req.write(part)
      if (part.toString().includes('name="audio"')) {
        req.write(options.file.buffer)
        req.write('\r\n')
      }
    }
    req.end()
  })
}

// ---------- 文件工具 ----------

function saveToTempFile(buffer, ext) {
  const tmpDir = path.join(os.tmpdir(), 'workflow-fish-audio')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, `tts_${Date.now()}.${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function readAudioFile(filePath) {
  try {
    return fs.readFileSync(filePath)
  } catch (e) {
    throw new Error(`无法读取音频文件: ${e.message}`)
  }
}

// ---------- 格式工具 ----------

function getFormatExt(format) {
  const map = { mp3: 'mp3', wav: 'wav', pcm: 'pcm', opus: 'opus' }
  return map[format] || 'mp3'
}

function getMimeType(ext) {
  const map = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg' }
  return map[ext] || 'audio/wav'
}

function buildAuthHeader(apiKey) {
  if (!apiKey) throw new Error('缺少 apiKey（请在插件配置中设置 FishAudio API Key）')
  return { 'Authorization': `Bearer ${apiKey}` }
}

function resolveBaseUrl(args) {
  return args.baseUrl || FISH_AUDIO_BASE_URL
}

/**
 * 解析代理地址：优先使用节点/工具参数，其次使用全局插件配置
 */
function resolveProxy(args) {
  return args.proxy || _config.httpProxy || ''
}

module.exports = {
  setConfig,
  postForBuffer,
  postFormData,
  saveToTempFile,
  readAudioFile,
  getFormatExt,
  getMimeType,
  buildAuthHeader,
  resolveBaseUrl,
  resolveProxy,
}
