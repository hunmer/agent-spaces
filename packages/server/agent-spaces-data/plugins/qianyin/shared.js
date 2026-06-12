/**
 * 千音插件共享网络与鉴权工具
 *
 * 鉴权: MD5(appkey + "+" + secret + "+" + timestamp)
 * TTS: POST /api/tts/Submit → 返回 fileUrl → 下载音频
 */
const https = require('https')
const http = require('http')
const zlib = require('zlib')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { URL } = require('url')

const QIANYIN_BASE_URL = 'https://open.qianyin123.com'

// ---------- Config ----------

let _config = {}

function setConfig(config) {
  _config = config
}

// ---------- Auth ----------

/**
 * 生成鉴权签名: MD5(appkey + "+" + secret + "+" + timestamp)
 */
function generateSign(appkey, secret, timestamp) {
  const raw = `${appkey}+${secret}+${timestamp}`
  return crypto.createHash('md5').update(raw).digest('hex')
}

/**
 * 构建鉴权请求头
 */
function buildAuthHeaders(appkey, secret) {
  if (!appkey || !secret) {
    throw new Error('缺少 appkey 或 secret（请在插件配置中设置千音 AppKey 和 Secret）')
  }
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = generateSign(appkey, secret, timestamp)
  return {
    'appkey': appkey,
    'timestamp': timestamp.toString(),
    'sign': sign,
  }
}

function resolveBaseUrl(args) {
  return args.baseUrl || _config.baseUrl || QIANYIN_BASE_URL
}

// ---------- HTTP ----------

function request(url, method, headers, body, timeout) {
  const parsed = new URL(url)
  const mod = parsed.protocol === 'https:' ? https : http
  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + (parsed.search || ''),
    method,
    headers,
    timeout: timeout || 60000,
  }

  return new Promise((resolve, reject) => {
    const req = mod.request(opts, (res) => {
      const chunks = []
      let stream = res
      const encoding = res.headers['content-encoding']
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip())
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate())
      } else if (encoding === 'br') {
        stream = res.pipe(zlib.createBrotliDecompress())
      }
      stream.on('data', c => chunks.push(c))
      stream.on('end', () => {
        const buf = Buffer.concat(chunks)
        resolve({ statusCode: res.statusCode, headers: res.headers, body: buf })
      })
      stream.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
    if (body) req.write(body)
    req.end()
  })
}

/**
 * POST JSON，返回解析后的 JSON
 */
async function postJSON(url, data, headers, timeout) {
  const body = JSON.stringify(data)
  const resp = await request(url, 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'workflow/1.0',
    ...headers,
  }, body, timeout)

  const text = resp.body.toString('utf-8')
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`千音 API 响应解析失败: ${text.slice(0, 300)}`)
  }

  if (json.code !== 200) {
    const err = new Error(`千音 API 错误: ${json.message || '未知错误'} (code: ${json.code})`)
    err.code = json.code
    throw err
  }

  return json
}

/**
 * GET JSON
 */
async function getJSON(url, headers, timeout) {
  const resp = await request(url, 'GET', {
    'User-Agent': 'workflow/1.0',
    ...headers,
  }, null, timeout)

  const text = resp.body.toString('utf-8')
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`千音 API 响应解析失败: ${text.slice(0, 300)}`)
  }

  return json
}

/**
 * 下载二进制文件到 Buffer
 */
async function downloadBuffer(url, timeout) {
  const resp = await request(url, 'GET', {
    'User-Agent': 'workflow/1.0',
  }, null, timeout || 30000)

  if (resp.statusCode >= 400) {
    throw new Error(`音频下载失败: HTTP ${resp.statusCode}`)
  }

  return resp.body
}

// ---------- File ----------

function saveToTempFile(buffer, ext) {
  const tmpDir = path.join(os.tmpdir(), 'workflow-qianyin')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
  const filePath = path.join(tmpDir, `tts_${Date.now()}.${ext}`)
  fs.writeFileSync(filePath, buffer)
  return filePath
}

function getFormatExt(format) {
  const map = { mp3: 'mp3', wav: 'wav' }
  return map[format] || 'mp3'
}

module.exports = {
  setConfig,
  buildAuthHeaders,
  resolveBaseUrl,
  postJSON,
  getJSON,
  downloadBuffer,
  saveToTempFile,
  getFormatExt,
}
