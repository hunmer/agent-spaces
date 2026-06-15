import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { createServer, type Server } from 'http'
import { join, extname, dirname, resolve, relative, isAbsolute } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { electronApp, optimizer } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './ipc/shortcut.js'
import { registerFsIpcHandlers } from './ipc/fs.js'
import { getWindowMaximized, setWindowMaximized } from './services/store.js'
import { executeClientPluginNode, getClientWorkflowNodes, installClientPluginFromStore, listClientWorkflowPlugins, uninstallClientPlugin } from './services/client-plugin-runner.js'

const RENDERER_DIR = join(__dirname, '../renderer')

let mainWindow: BrowserWindow | null = null
let rendererServer: Server | null = null
let productionRendererUrl: string | undefined

function createWindow(rendererUrl?: string): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: true,
    icon: join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload/index.js'),
      sandbox: false,
      spellcheck: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    if (getWindowMaximized()) {
      mainWindow!.maximize()
    }
    mainWindow!.show()
  })

  mainWindow.on('maximize', () => setWindowMaximized(true))
  mainWindow.on('unmaximize', () => setWindowMaximized(false))

  // 开发态：直连 web dev server（http://127.0.0.1:3000）；生产态：本地 HTTP 服务加载静态导出。
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL('http://127.0.0.1:3000')
  } else if (rendererUrl ?? productionRendererUrl) {
    mainWindow.loadURL(rendererUrl ?? productionRendererUrl!)
  }
}

function registerDevToolsShortcut(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    const isToggleDevTools =
      input.code === 'F12' ||
      (input.code === 'KeyI' && input.control && input.shift)

    if (!isToggleDevTools) return

    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools()
    } else {
      window.webContents.openDevTools({ mode: 'undocked' })
    }
    event.preventDefault()
  })
}

app.whenReady().then(async () => {
  // MIME 表：app:// 服务 Next 静态导出需要 html/js/css/json/wasm 等全部 web 类型，
  // local:// 服务用户本地音视频（含 Range 请求）。缺失的扩展名会回落到
  // application/octet-stream，导致 Chromium 把页面当成下载弹出"另存为"对话框。
  const MIME_MAP: Record<string, string> = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
    '.wma': 'audio/x-ms-wma', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.map': 'application/json; charset=utf-8',
  }

  protocol.handle('local', (request) => {
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)
    if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(filePath)) {
      filePath = filePath.slice(1)
    }

    if (!existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }

    const stat = statSync(filePath)
    const ext = extname(filePath).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    const rangeHeader = request.headers.get('Range')
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1])
        const end = match[2] ? parseInt(match[2]) : stat.size - 1
        const length = end - start + 1
        const buf = Buffer.alloc(length)
        const fd = openSync(filePath, 'r')
        try { readSync(fd, buf, 0, length, start) } finally { closeSync(fd) }
        return new Response(buf, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': length.toString(),
            'Accept-Ranges': 'bytes',
          },
        })
      }
    }

    const buf = readFileSync(filePath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
      },
    })
  })

  const isInsideRendererDir = (filePath: string): boolean => {
    const rel = relative(RENDERER_DIR, filePath)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }

  // 本地 HTTP 服务：把请求映射到 renderer 静态导出目录，让绝对路径 /_next/...
  // 与各路由 HTML 正确命中。支持 Next 导出的 index.html / *.html 两种布局。
  // 动态路由（如 /mini-apps/[id]）只预渲染了占位 _，真实 id 靠回退到 _ 的 shell，
  // 由客户端 useParams() 读取真实 id。
  const resolveRendererFile = (pathname: string): string | null => {
    const tryCandidates = (...rels: string[]): string | null => {
      for (const rel of rels) {
        const safeRel = rel.replace(/^\/+/, '')
        const p = resolve(RENDERER_DIR, safeRel)
        if (!isInsideRendererDir(p)) continue
        try {
          if (existsSync(p) && statSync(p).isFile()) return p
        } catch {}
      }
      return null
    }

    let clean = decodeURIComponent(pathname).replace(/\.html$/i, '').replace(/\/+$/, '')
    if (!clean) clean = '/index.html'

    // 1. 精确命中：path / path/index.html / path.html
    const exact = tryCandidates(clean, `${clean}/index.html`, `${clean}.html`)
    if (exact) return exact

    // 2. 动态段落回退：把最后一段换成占位 _（Next generateStaticParams 占位产物，
    //    导出为 {parent}/_.html 或 {parent}/_/index.html 两种形态）
    const segs = clean.split('/').filter(Boolean)
    if (segs.length >= 2) {
      const dyn = [...segs.slice(0, -1), '_'].join('/')
      const fallback = tryCandidates(`${dyn}.html`, `${dyn}/index.html`, dyn)
      if (fallback) return fallback
    }
    return null
  }

  const startRendererServer = (): Promise<string> => new Promise((resolveUrl, reject) => {
    rendererServer = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end('Bad Request')
        return
      }

      const url = new URL(req.url, 'http://127.0.0.1')
      const pathname = url.pathname === '' ? '/index.html' : url.pathname
      const filePath = resolveRendererFile(pathname)
      if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found')
        return
      }

      const stat = statSync(filePath)
      const ext = extname(filePath).toLowerCase()
      const contentType = MIME_MAP[ext] || 'application/octet-stream'
      const buf = readFileSync(filePath)
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
      })
      res.end(buf)
    })

    rendererServer.once('error', reject)
    rendererServer.listen(0, '127.0.0.1', () => {
      const address = rendererServer!.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to bind renderer server'))
        return
      }
      resolveUrl(`http://127.0.0.1:${address.port}/index.html`)
    })
  })

  electronApp.setAppUserModelId('com.agent-spaces.app')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    registerDevToolsShortcut(window)
  })

  registerFsIpcHandlers()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })

  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  })
  ipcMain.handle('clientPlugin:executeNode', (_e, pluginId: string, nodeType: string, args: Record<string, unknown>) =>
    executeClientPluginNode(pluginId, nodeType, args),
  )
  ipcMain.handle('clientPlugin:listWorkflowPlugins', () => listClientWorkflowPlugins())
  ipcMain.handle('clientPlugin:getWorkflowNodes', (_e, pluginId: string) => getClientWorkflowNodes(pluginId))
  ipcMain.handle('clientPlugin:installFromStore', (_e, pluginId: string, sourceUrl: string, md5?: string) =>
    installClientPluginFromStore({ pluginId, sourceUrl, md5 }),
  )
  ipcMain.handle('clientPlugin:uninstall', (_e, pluginId: string) => {
    uninstallClientPlugin(pluginId)
    return { success: true }
  })

  productionRendererUrl = process.env.ELECTRON_RENDERER_URL ? undefined : await startRendererServer()
  createWindow(productionRendererUrl)
  registerGlobalShortcuts()

  // 自动更新：仅打包版从 GitHub Release 拉取（dev 跳过）。下载完成后退出时静默安装。
  if (app.isPackaged) {
    const { autoUpdater } = electronUpdater
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', (err) => console.error('[autoUpdater] error:', err))
    autoUpdater.on('update-downloaded', (info) =>
      console.log('[autoUpdater] downloaded', info.version, '— installs on quit'),
    )
    autoUpdater.checkForUpdates().catch((err) => console.error('[autoUpdater] check failed:', err))
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  unregisterGlobalShortcuts()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  rendererServer?.close()
  rendererServer = null
})
