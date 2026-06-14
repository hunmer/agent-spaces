module.exports = (t) => [
  {
    name: 'create_window',
    label: t('action.create_window.label', 'Create Window'),
    category: t('category', 'Window Manager'),
    icon: 'AppWindow',
    description: t('action.create_window.description', 'Create an independent browser window'),
    toolProperties: [
      { key: 'url', type: 'string', description: '要打开的 URL', required: true },
      { key: 'title', type: 'string', description: '窗口标题' },
      { key: 'width', type: 'number', description: '窗口宽度，默认 1280' },
      { key: 'height', type: 'number', description: '窗口高度，默认 800' },
    ],
    properties: [
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', required: true, tooltip: t('field.url.tooltip', 'The URL to open') },
      { key: 'title', label: t('field.title.label', 'Window Title'), type: 'text', tooltip: t('field.title.tooltip', 'Window title') },
      { key: 'width', label: t('field.width.label', 'Width'), type: 'number', default: 1280, tooltip: t('field.width.tooltip', 'Window width') },
      { key: 'height', label: t('field.height.label', 'Height'), type: 'number', default: 800, tooltip: t('field.height.tooltip', 'Window height') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'id', type: 'number' },
        { key: 'webContentsId', type: 'number' },
        { key: 'url', type: 'string' },
        { key: 'title', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const result = await ctx.api.createWindow(args)
      return { success: true, message: t('message.windowCreated', 'Window created: {id}').replace('{id}', result.id), data: result }
    },
  },
  {
    name: 'inject_js',
    label: t('action.inject_js.label', 'Inject JS Code'),
    category: t('category', 'Window Manager'),
    icon: 'Code',
    description: t('action.inject_js.description', 'Inject and execute JavaScript code in a specified window'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '目标窗口 ID', required: true },
      { key: 'code', type: 'string', description: '要注入的 JavaScript 代码', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowId.tooltip', 'Target window ID') },
      { key: 'code', label: t('field.code.label', 'JS Code'), type: 'code', required: true, tooltip: t('field.code.tooltip', 'JavaScript code to inject') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'result', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const result = await ctx.api.injectJS(args.windowId, args.code)
      return { success: true, message: t('message.jsExecuted', 'JS code executed'), data: { result } }
    },
  },
  {
    name: 'navigate_window',
    label: t('action.navigate_window.label', 'Navigate Window'),
    category: t('category', 'Window Manager'),
    icon: 'Navigation',
    description: t('action.navigate_window.description', 'Navigate an independent window to a specified URL'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '目标窗口 ID', required: true },
      { key: 'url', type: 'string', description: '目标 URL', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowId.tooltip', 'Target window ID') },
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', required: true, tooltip: t('field.targetUrl.tooltip', 'The target URL') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'windowId', type: 'number' },
        { key: 'url', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.navigateWindow(args.windowId, args.url)
      return { success: true, message: t('message.windowNavigated', 'Window {windowId} navigated to {url}').replace('{windowId}', args.windowId).replace('{url}', args.url) }
    },
  },
  {
    name: 'close_window',
    label: t('action.close_window.label', 'Close Window'),
    category: t('category', 'Window Manager'),
    icon: 'X',
    description: t('action.close_window.description', 'Close a specified independent browser window'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '要关闭的窗口 ID', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowIdToClose.tooltip', 'Window ID to close') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      await ctx.api.closeWindow(args.windowId)
      return { success: true, message: t('message.windowClosed', 'Window {windowId} closed').replace('{windowId}', args.windowId) }
    },
  },
  {
    name: 'list_windows',
    label: t('action.list_windows.label', 'List Windows'),
    category: t('category', 'Window Manager'),
    icon: 'LayoutList',
    description: t('action.list_windows.description', 'List all open browser windows'),
    properties: [],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'windows', type: 'object', children: [
          { key: 'id', type: 'number' },
          { key: 'title', type: 'string' },
          { key: 'url', type: 'string' },
        ] },
        { key: 'count', type: 'number' },
      ] },
    ],
    run: async (ctx) => {
      const windows = await ctx.api.listWindows()
      return { success: true, message: t('message.windowCount', '{count} window(s) found').replace('{count}', windows.length), data: { windows } }
    },
  },
  {
    name: 'focus_window',
    label: t('action.focus_window.label', 'Focus Window'),
    category: t('category', 'Window Manager'),
    icon: 'Maximize',
    description: t('action.focus_window.description', 'Bring a specified window to the foreground'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '目标窗口 ID', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowId.tooltip', 'Target window ID') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
    ],
    run: async (ctx, args) => {
      await ctx.api.focusWindow(args.windowId)
      return { success: true, message: t('message.windowFocused', 'Window {windowId} focused').replace('{windowId}', args.windowId) }
    },
  },
  {
    name: 'screenshot_window',
    label: t('action.screenshot_window.label', 'Window Screenshot'),
    category: t('category', 'Window Manager'),
    icon: 'Camera',
    description: t('action.screenshot_window.description', 'Take a screenshot of an independent window'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '目标窗口 ID', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowId.tooltip', 'Target window ID') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'screenshot', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const dataUrl = await ctx.api.screenshotWindow(args.windowId)
      return { success: true, message: t('message.screenshotDone', 'Screenshot completed'), data: { screenshot: dataUrl } }
    },
  },
  {
    name: 'get_window_detail',
    label: t('action.get_window_detail.label', 'Window Details'),
    category: t('category', 'Window Manager'),
    icon: 'Info',
    description: t('action.get_window_detail.description', 'Get detailed information about a window'),
    toolProperties: [
      { key: 'windowId', type: 'number', description: '目标窗口 ID', required: true },
    ],
    properties: [
      { key: 'windowId', label: t('field.windowId.label', 'Window ID'), type: 'number', required: true, tooltip: t('field.windowId.tooltip', 'Target window ID') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'id', type: 'number' },
        { key: 'title', type: 'string' },
        { key: 'url', type: 'string' },
        { key: 'width', type: 'number' },
        { key: 'height', type: 'number' },
      ] },
    ],
    run: async (ctx, args) => {
      const detail = await ctx.api.getWindowDetail(args.windowId)
      return { success: true, message: t('message.windowDetailGot', 'Window details retrieved'), data: detail }
    },
  },
]
