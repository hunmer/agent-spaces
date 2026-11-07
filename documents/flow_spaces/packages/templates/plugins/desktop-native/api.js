module.exports = {
  createApi: ({ desktopNative }) => ({
    readClipboardText: () => desktopNative.readClipboardText(),
    writeClipboardText: (text) => desktopNative.writeClipboardText(text),
    readClipboardImage: () => desktopNative.readClipboardImage(),
    writeClipboardImage: (dataUrl) => desktopNative.writeClipboardImage(dataUrl),
    clearClipboard: () => desktopNative.clearClipboard(),
    showNotification: (opts) => desktopNative.showNotification(opts),
    showItemInFolder: (fullPath) => desktopNative.showItemInFolder(fullPath),
    openPath: (path) => desktopNative.openPath(path),
    openExternal: (url) => desktopNative.openExternal(url),
    beep: () => desktopNative.beep(),
    showOpenDialogSync: (opts) => desktopNative.showOpenDialogSync(opts),
    showSaveDialogSync: (opts) => desktopNative.showSaveDialogSync(opts),
    showMessageBoxSync: (opts) => desktopNative.showMessageBoxSync(opts),
    showErrorBox: (title, content) => desktopNative.showErrorBox(title, content),
  }),
}
