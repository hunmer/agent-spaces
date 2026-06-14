import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的桥接 API。
// window.electronAPI 的存在同时作为 isElectronEnvironment() 的判定位。
const electronAPI = {
  isElectron: true,
  platform: process.platform,

  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  },

  window: {
    minimize: (): void => {
      ipcRenderer.send('window:minimize')
    },
    toggleMaximize: (): void => {
      ipcRenderer.send('window:maximize')
    },
    close: (): void => {
      ipcRenderer.send('window:close')
    },
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  },

  desktopNative: {
    readClipboardText: (): Promise<string> => ipcRenderer.invoke('desktopNative:readClipboardText'),
    writeClipboardText: (text: string): Promise<void> => ipcRenderer.invoke('desktopNative:writeClipboardText', text),
    readClipboardImage: (): Promise<string> => ipcRenderer.invoke('desktopNative:readClipboardImage'),
    writeClipboardImage: (dataUrl: string): Promise<void> => ipcRenderer.invoke('desktopNative:writeClipboardImage', dataUrl),
    clearClipboard: (): Promise<void> => ipcRenderer.invoke('desktopNative:clearClipboard'),
    showNotification: (opts: { title: string; body?: string; silent?: boolean }): Promise<void> =>
      ipcRenderer.invoke('desktopNative:showNotification', opts),
    showItemInFolder: (fullPath: string): Promise<void> => ipcRenderer.invoke('desktopNative:showItemInFolder', fullPath),
    openPath: (path: string): Promise<void> => ipcRenderer.invoke('desktopNative:openPath', path),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('desktopNative:openExternal', url),
    beep: (): Promise<void> => ipcRenderer.invoke('desktopNative:beep'),
    showOpenDialogSync: (opts: Electron.OpenDialogSyncOptions): Promise<string[] | undefined> =>
      ipcRenderer.invoke('desktopNative:showOpenDialogSync', opts),
    showSaveDialogSync: (opts: Electron.SaveDialogSyncOptions): Promise<string | undefined> =>
      ipcRenderer.invoke('desktopNative:showSaveDialogSync', opts),
    showMessageBoxSync: (opts: Electron.MessageBoxSyncOptions): Promise<number> =>
      ipcRenderer.invoke('desktopNative:showMessageBoxSync', opts),
    showErrorBox: (title: string, content: string): Promise<void> =>
      ipcRenderer.invoke('desktopNative:showErrorBox', title, content),
  },

  fs: {
    openInExplorer: (targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:openInExplorer', targetPath),
  },

  onShortcut: (cb: (id: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
    ipcRenderer.on('shortcut', handler)
    return () => ipcRenderer.removeListener('shortcut', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
