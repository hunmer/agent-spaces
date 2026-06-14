// electron/services/desktop-native.ts
import { clipboard, nativeImage, Notification, shell, dialog } from 'electron'

class DesktopNative {
  readClipboardText(): string {
    return clipboard.readText()
  }

  writeClipboardText(text: string): void {
    clipboard.writeText(text)
  }

  readClipboardImage(): string {
    const image = clipboard.readImage()
    if (image.isEmpty()) return ''
    return image.toDataURL()
  }

  writeClipboardImage(dataUrl: string): void {
    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)
  }

  clearClipboard(): void {
    clipboard.clear()
  }

  showNotification(opts: { title: string; body?: string; silent?: boolean }): void {
    const notification = new Notification({
      title: opts.title,
      body: opts.body || '',
      silent: opts.silent ?? false,
    })
    notification.show()
  }

  showItemInFolder(fullPath: string): void {
    shell.showItemInFolder(fullPath)
  }

  async openPath(path: string): Promise<void> {
    await shell.openPath(path)
  }

  async openExternal(url: string): Promise<void> {
    await shell.openExternal(url)
  }

  beep(): void {
    // Electron does not expose process.beep(); use shell.beep() instead
    if (process.type === 'browser') {
      shell.beep()
    }
  }

  showOpenDialogSync(opts: Electron.OpenDialogSyncOptions): string[] | undefined {
    return dialog.showOpenDialogSync(opts)
  }

  showSaveDialogSync(opts: Electron.SaveDialogSyncOptions): string | undefined {
    return dialog.showSaveDialogSync(opts)
  }

  showMessageBoxSync(opts: Electron.MessageBoxSyncOptions): number {
    return dialog.showMessageBoxSync(opts)
  }

  showErrorBox(title: string, content: string): void {
    dialog.showErrorBox(title, content)
  }
}

export const desktopNative = new DesktopNative()
