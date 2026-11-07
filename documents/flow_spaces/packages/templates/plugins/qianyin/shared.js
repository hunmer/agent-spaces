/**
 * 千音插件共享鉴权与接口工具
 *
 * 网络请求统一走 ctx.api（plugin-runtime-api 注入），不自行实现 HTTP：
 *   ctx.api.postJson(url, { body, headers, timeout })   POST JSON，返回解析后的 JSON
 *   ctx.api.fetchJson(url, { headers, timeout })         GET，返回解析后的 JSON（别名 getJson）
 *   ctx.api.fetchBuffer(url, { timeout })                GET 二进制，返回 { buffer, size, mimeType }
 * 鉴权: MD5(appkey + "+" + secret + "+" + timestamp)
 * TTS: POST /api/tts/Submit → 返回 fileUrl → 下载音频
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

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
// 统一走 ctx.api（postJson/fetchJson/fetchBuffer），不再自行实现 HTTP。
// api 由 actions.js 的 run(ctx, args) 透传 ctx.api。

/**
 * POST JSON，返回解析后的 JSON；业务 code !== 200 抛错
 */
async function postJSON(api, url, data, headers, timeout) {
  const json = await api.postJson(url, { body: data, headers, timeout: timeout || 60000 })

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
async function getJSON(api, url, headers, timeout) {
  return api.fetchJson(url, { headers, timeout: timeout || 30000 })
}

/**
 * 下载二进制文件到 Buffer
 */
async function downloadBuffer(api, url, timeout) {
  const { buffer } = await api.fetchBuffer(url, { timeout: timeout || 30000 })
  return buffer
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
