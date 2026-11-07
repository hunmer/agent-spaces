// audio-separator HTTP 服务客户端：无外部 npm 依赖，使用 Node 18+ 内置 fetch/FormData
const fs = require('fs')
const path = require('path')

const DEFAULT_BASE_URL = 'http://127.0.0.1:8365'
const POLL_INTERVAL_MS = 2000

function resolveEndpoint(args) {
  const base = String(args.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  return base || DEFAULT_BASE_URL
}

function authHeaders(args) {
  const token = String(args.apiToken || '').trim()
  return token ? { 'X-API-Token': token } : {}
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  if (typeof fetch === 'undefined') {
    throw new Error('Node 18+ required for built-in fetch')
  }
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text }
  }
  if (!res.ok) {
    const detail = body && body.detail ? body.detail : res.status
    throw new Error(`HTTP ${res.status}: ${detail}`)
  }
  return body
}

async function checkService(ctx, args) {
  const health = await fetchJson(`${resolveEndpoint(args)}/health`, { headers: authHeaders(args) })
  ctx.logger.info(`audio-separator service ok: cuda=${health.cuda_enabled} torch=${health.torch_device} queue=${health.queue_length}`)
  return health
}

async function submitSeparateJob(ctx, args, input, params) {
  const base = resolveEndpoint(args)
  const form = new FormData()

  if (/^https?:\/\//i.test(input)) {
    form.append('url', input)
  } else {
    const buf = await fs.promises.readFile(input)
    form.append('file', new Blob([buf]), path.basename(input))
  }
  if (params.model) form.append('model', params.model)
  if (params.output_format) form.append('output_format', params.output_format)
  if (params.output_bitrate) form.append('output_bitrate', params.output_bitrate)
  if (params.output_single_stem) form.append('output_single_stem', params.output_single_stem)
  if (params.custom_output_names) form.append('custom_output_names', JSON.stringify(params.custom_output_names))

  const job = await fetchJson(
    `${base}/api/separate`,
    { method: 'POST', body: form, headers: authHeaders(args) },
    120000
  )
  ctx.logger.info(`job created: ${job.id} status=${job.status}`)
  return job
}

async function waitJob(ctx, args, jobId, timeoutSec) {
  const base = resolveEndpoint(args)
  const deadline = Date.now() + timeoutSec * 1000
  let job = null
  while (Date.now() < deadline) {
    job = await fetchJson(`${base}/api/jobs/${jobId}`, { headers: authHeaders(args) })
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return job
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`timeout after ${timeoutSec}s, last status=${job ? job.status : 'unknown'} (job id: ${jobId})`)
}

async function downloadOutput(ctx, args, output, savePath) {
  if (ctx?.api?.fetchBuffer) {
    const { buffer } = await ctx.api.fetchBuffer(output.download_url)
    await fs.promises.writeFile(savePath, buffer)
    return
  }
  const res = await fetch(output.download_url, { headers: authHeaders(args), signal: AbortSignal.timeout(300000) })
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.promises.writeFile(savePath, buf)
}

module.exports = {
  DEFAULT_BASE_URL,
  resolveEndpoint,
  authHeaders,
  fetchJson,
  checkService,
  submitSeparateJob,
  waitJob,
  downloadOutput,
}
