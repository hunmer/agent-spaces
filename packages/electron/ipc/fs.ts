import { ipcMain, shell } from 'electron'

export function registerFsIpcHandlers(): void {
  ipcMain.handle('fs:openInExplorer', async (_e, targetPath: string): Promise<void> => {
    shell.showItemInFolder(targetPath)
  })
}
