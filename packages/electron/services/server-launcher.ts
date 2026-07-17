// electron/services/server-launcher.ts
// 检测 / 安装 / 启动 @agent-spaces-server 全局命令。
// 主进程持有子进程句柄，退出时由 main.ts 的 before-quit 钩子清理。
import { app, BrowserWindow, ipcMain } from 'electron'
import { spawn, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'

const SERVER_BIN = 'agent-spaces-server'
const SERVER_PORT = '3100'
const SERVER_HOST = '127.0.0.1'
const HEALTH_URL = `http://${SERVER_HOST}:${SERVER_PORT}/api/health`

const DEFAULT_REGISTRY = 'https://registry.npmmirror.com'
const OFFICIAL_REGISTRY = 'https://registry.npmjs.org'

// npm 安装子进程：单例，避免并发触发。
let installChild: ReturnType<typeof spawn> | null = null
// server 运行子进程：单例，整个应用生命周期持有一个。
let serverChild: ReturnType<typeof spawn> | null = null

function broadcast(event: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, payload)
  }
}

/** 跨平台检测全局 agent-spaces-server 命令是否存在。 */
function isServerBinaryInstalled(): boolean {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    execFileSync(cmd, [SERVER_BIN], { stdio: 'ignore', shell: false })
    return true
  } catch {
    return false
  }
}

/** 拉取 /api/health，判断 server 是否在线。 */
async function isServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' })
    clearTimeout(timer)
    return res.ok
  } catch {
    return false
  }
}

/** 启动 server，轮询 /api/health 直到就绪或超时。 */
function startServer(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (serverChild && !serverChild.killed) {
      resolve({ ok: true })
      return
    }

    let bin: string = SERVER_BIN
    // Windows 上 spawn 直接调用全局 shim 脚本会失败，需要走 shell 解析 PATHEXT。
    const useShell = process.platform === 'win32'
    try {
      serverChild = spawn(bin, [], {
        env: { ...process.env, PORT: SERVER_PORT, HOST: SERVER_HOST },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: useShell,
        detached: false,
      })
    } catch (e) {
      resolve({ ok: false, error: `spawn 失败：${(e as Error).message}` })
      return
    }

    const pushLine = (chunk: Buffer | string, stream: 'stdout' | 'stderr'): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) broadcast('setup:server-log', { stream, line })
      }
    }
    serverChild.stdout?.on('data', (c: Buffer) => pushLine(c, 'stdout'))
    serverChild.stderr?.on('data', (c: Buffer) => pushLine(c, 'stderr'))
    serverChild.on('error', (err) => {
      broadcast('setup:server-log', { stream: 'stderr', line: `进程错误：${err.message}` })
    })
    serverChild.on('exit', (code) => {
      broadcast('setup:server-log', { stream: 'stderr', line: `server 进程退出，code=${code}` })
      serverChild = null
    })

    // 轮询健康检查（最长 ~30s）。
    let attempts = 0
    const maxAttempts = 60
    const timer = setInterval(async () => {
      attempts += 1
      if (await isServerRunning()) {
        clearInterval(timer)
        resolve({ ok: true })
      } else if (attempts >= maxAttempts) {
        clearInterval(timer)
        resolve({ ok: false, error: '启动超时：30s 内 /api/health 未就绪' })
      }
    }, 500)
  })
}

/** 全局安装 server，流式推送 npm 输出。 */
function installServer(registry: string): void {
  if (installChild) {
    broadcast('setup:install-done', { success: false, error: '已有安装任务在执行' })
    return
  }

  const args = ['i', '@agent-spaces/server', '-g', `--registry=${registry}`]
  installChild = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  })

  const pushLine = (chunk: Buffer, stream: 'stdout' | 'stderr'): void => {
    const text = chunk.toString('utf8')
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) broadcast('setup:install-progress', { stream, line })
    }
  }
  installChild.stdout?.on('data', (c: Buffer) => pushLine(c, 'stdout'))
  installChild.stderr?.on('data', (c: Buffer) => pushLine(c, 'stderr'))

  installChild.on('error', (err) => {
    broadcast('setup:install-done', { success: false, error: `安装进程错误：${err.message}` })
    installChild = null
  })
  installChild.on('exit', (code) => {
    installChild = null
    if (code === 0) {
      broadcast('setup:install-done', { success: true })
    } else {
      broadcast('setup:install-done', { success: false, error: `npm 退出码 ${code}` })
    }
  })
}

/** 应用退出时杀掉 server 子进程。 */
export function stopServer(): void {
  if (serverChild && !serverChild.killed) {
    try {
      // Windows 下 kill() 默认终止整个进程树。
      if (process.platform === 'win32') {
        // taskkill 兜底，确保 cmd /c 启动的 node 子进程也被回收。
        try {
          execFileSync('taskkill', ['/PID', String(serverChild.pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {}
      }
      serverChild.kill()
    } catch {}
  }
  serverChild = null
}

/** 注册 setup 相关 IPC。仅注册一次。 */
export function registerServerLauncherIpc(): void {
  ipcMain.handle('setup:checkStatus', async () => ({
    installed: isServerBinaryInstalled(),
    running: await isServerRunning(),
  }))

  ipcMain.handle('setup:install', (_e, registry?: string) => {
    const reg = registry === OFFICIAL_REGISTRY ? OFFICIAL_REGISTRY : DEFAULT_REGISTRY
    installServer(reg)
    return { started: true }
  })

  ipcMain.handle('setup:start', async () => startServer())

  ipcMain.handle('setup:getRegistries', () => [
    { value: DEFAULT_REGISTRY, label: 'npmmirror 国内镜像（推荐）' },
    { value: OFFICIAL_REGISTRY, label: 'npm 官方源' },
  ])

  // 记录一条启动日志，便于调试。
  console.log(`[server-launcher] ready. home=${homedir()}, platform=${process.platform}, packaged=${app.isPackaged}`)
}
