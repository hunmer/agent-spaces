// electron/services/window-manager.ts
import { BrowserWindow, screen } from 'electron'

interface ManagedWindow {
  id: number
  window: BrowserWindow
  title: string
  url: string
  createdAt: number
}

class WindowManager {
  private windows: Map<number, ManagedWindow> = new Map()

  async createWindow(opts: {
    url: string
    title?: string
    width?: number
    height?: number
  }): Promise<{ id: number; webContentsId: number }> {
    const { width = 1280, height = 800 } = opts
    const point = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(point)
    const x = Math.round(display.bounds.x + (display.bounds.width - width) / 2)
    const y = Math.round(display.bounds.y + (display.bounds.height - height) / 2)

    const win = new BrowserWindow({
      width,
      height,
      x,
      y,
      title: opts.title || 'Agent Spaces Window',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const id = win.id
    const managed: ManagedWindow = {
      id,
      window: win,
      title: opts.title || 'Agent Spaces Window',
      url: opts.url,
      createdAt: Date.now(),
    }

    this.windows.set(id, managed)

    win.on('closed', () => {
      this.windows.delete(id)
    })

    await win.loadURL(opts.url)
    return { id, webContentsId: win.webContents.id }
  }

  async closeWindow(windowId: number): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    managed.window.close()
    this.windows.delete(windowId)
  }

  async navigateWindow(windowId: number, url: string): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    managed.url = url
    await managed.window.loadURL(url)
  }

  async focusWindow(windowId: number): Promise<void> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    if (managed.window.isMinimized()) managed.window.restore()
    managed.window.focus()
  }

  async screenshotWindow(windowId: number): Promise<string> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    const image = await managed.window.webContents.capturePage()
    return image.toDataURL()
  }

  async getWindowDetail(windowId: number): Promise<Record<string, any>> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    const bounds = managed.window.getBounds()
    return {
      id: managed.id,
      title: managed.window.getTitle(),
      url: managed.window.webContents.getURL(),
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMinimized: managed.window.isMinimized(),
      isMaximized: managed.window.isMaximized(),
      webContentsId: managed.window.webContents.id,
      createdAt: managed.createdAt,
    }
  }

  async listWindows(): Promise<Array<Record<string, any>>> {
    const result: Array<Record<string, any>> = []
    for (const [id, managed] of this.windows) {
      const bounds = managed.window.getBounds()
      result.push({
        id,
        title: managed.window.getTitle(),
        url: managed.window.webContents.getURL(),
        width: bounds.width,
        height: bounds.height,
        webContentsId: managed.window.webContents.id,
      })
    }
    return result
  }

  async injectJS(windowId: number, code: string): Promise<any> {
    const managed = this.windows.get(windowId)
    if (!managed) throw new Error(`窗口 ${windowId} 不存在`)
    return managed.window.webContents.executeJavaScript(code)
  }

  closeAll(): void {
    for (const [, managed] of this.windows) {
      if (!managed.window.isDestroyed()) {
        managed.window.close()
      }
    }
    this.windows.clear()
  }
}

export const windowManager = new WindowManager()
