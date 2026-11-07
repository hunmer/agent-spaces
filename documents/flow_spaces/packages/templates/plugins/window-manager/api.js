module.exports = {
  createApi: ({ windowManager }) => ({
    createWindow: (opts) => windowManager.createWindow(opts),
    closeWindow: (wid) => windowManager.closeWindow(wid),
    navigateWindow: (wid, url) => windowManager.navigateWindow(wid, url),
    focusWindow: (wid) => windowManager.focusWindow(wid),
    screenshotWindow: (wid) => windowManager.screenshotWindow(wid),
    getWindowDetail: (wid) => windowManager.getWindowDetail(wid),
    listWindows: () => windowManager.listWindows(),
    injectJS: (wid, code) => windowManager.injectJS(wid, code),
  }),
}
