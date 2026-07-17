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

  clientPlugins: {
    listWorkflowPlugins: (): Promise<unknown> =>
      ipcRenderer.invoke('clientPlugin:listWorkflowPlugins'),
    getWorkflowNodes: (pluginId: string): Promise<unknown> =>
      ipcRenderer.invoke('clientPlugin:getWorkflowNodes', pluginId),
    installFromStore: (pluginId: string, sourceUrl: string, md5?: string): Promise<unknown> =>
      ipcRenderer.invoke('clientPlugin:installFromStore', pluginId, sourceUrl, md5),
    uninstall: (pluginId: string): Promise<unknown> =>
      ipcRenderer.invoke('clientPlugin:uninstall', pluginId),
    executeNode: (pluginId: string, nodeType: string, args: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('clientPlugin:executeNode', pluginId, nodeType, args),
  },

  fs: {
    openInExplorer: (targetPath: string): Promise<void> =>
      ipcRenderer.invoke('fs:openInExplorer', targetPath),
  },

  setup: {
    checkStatus: (): Promise<{ installed: boolean; running: boolean }> =>
      ipcRenderer.invoke('setup:checkStatus'),
    install: (registry?: string): Promise<{ started: boolean }> =>
      ipcRenderer.invoke('setup:install', registry),
    start: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('setup:start'),
    getRegistries: (): Promise<Array<{ value: string; label: string }>> =>
      ipcRenderer.invoke('setup:getRegistries'),
    onInstallProgress: (cb: (e: { stream: 'stdout' | 'stderr'; line: string }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { stream: 'stdout' | 'stderr'; line: string }): void => cb(payload)
      ipcRenderer.on('setup:install-progress', handler)
      return () => ipcRenderer.removeListener('setup:install-progress', handler)
    },
    onInstallDone: (cb: (e: { success: boolean; error?: string }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { success: boolean; error?: string }): void => cb(payload)
      ipcRenderer.on('setup:install-done', handler)
      return () => ipcRenderer.removeListener('setup:install-done', handler)
    },
    onServerLog: (cb: (e: { stream: 'stdout' | 'stderr'; line: string }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: { stream: 'stdout' | 'stderr'; line: string }): void => cb(payload)
      ipcRenderer.on('setup:server-log', handler)
      return () => ipcRenderer.removeListener('setup:server-log', handler)
    },
  },

  onShortcut: (cb: (id: string) => void): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
    ipcRenderer.on('shortcut', handler)
    return () => ipcRenderer.removeListener('shortcut', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
