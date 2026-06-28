#!/usr/bin/env node
// 启动 openviking-server（带 bot），并将 .openviking/ov.conf 里的 workspace 字段更新为本地项目路径。
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_DIR = resolve(__dirname, '..')
const CONF_DIR = join(PROJECT_DIR, '.openviking')
const CONF_FILE = join(CONF_DIR, 'ov.conf')
const WORKSPACE_DIR = join(PROJECT_DIR, '.openviking', 'data')

// 配置目录缺失则创建
if (!existsSync(CONF_DIR)) {
  mkdirSync(CONF_DIR, { recursive: true })
}

function updateWorkspace() {
  if (!existsSync(CONF_FILE)) {
    console.warn(`[openviking] 配置文件不存在，跳过更新: ${CONF_FILE}`)
    return
  }
  const raw = readFileSync(CONF_FILE, 'utf8')
  const conf = JSON.parse(raw)
  conf.storage = conf.storage || {}
  const prev = conf.storage.workspace
  conf.storage.workspace = WORKSPACE_DIR
  // 保持 2 空格缩进，便于与现有风格一致
  writeFileSync(CONF_FILE, JSON.stringify(conf, null, 2) + '\n', 'utf8')
  console.log(`[openviking] workspace: ${prev} -> ${WORKSPACE_DIR}`)
}

updateWorkspace()

const env = { ...process.env, OPENVIKING_CONFIG_FILE: CONF_FILE }
console.log(`[openviking] OPENVIKING_CONFIG_FILE=${CONF_FILE}`)
console.log(`[openviking] 启动: openviking-server --with-bot`)

// 继承 stdio，让 server 正常输出 / 接收信号
const child = spawn('openviking-server', ['--with-bot', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('[openviking] 未找到 openviking-server，请确认已安装并在 PATH 中。')
  } else {
    console.error('[openviking] 启动失败:', err.message)
  }
  process.exit(1)
})

// 转发退出码
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
