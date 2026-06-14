module.exports = (t) => [
  {
    name: 'read_clipboard',
    label: t('action.read_clipboard.label', 'Read Clipboard'),
    category: t('category', 'Desktop Native'),
    icon: 'Clipboard',
    description: t('action.read_clipboard.description', 'Read text content from system clipboard'),
    properties: [],
    outputs: [
      { key: 'text', type: 'string' },
    ],
    run: async (ctx, args) => {
      const text = await ctx.api.readClipboardText()
      return { success: true, message: t('action.read_clipboard.message.success', 'Clipboard read'), data: { text } }
    },
  },
  {
    name: 'write_clipboard',
    label: t('action.write_clipboard.label', 'Write Clipboard'),
    category: t('category', 'Desktop Native'),
    icon: 'ClipboardCopy',
    description: t('action.write_clipboard.description', 'Write text to system clipboard'),
    properties: [
      { key: 'text', label: t('field.text.label', 'Text Content'), type: 'text', required: true, tooltip: t('field.text.tooltip', 'Text to write to clipboard') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.writeClipboardText(args.text)
      return { success: true, message: t('action.write_clipboard.message.success', 'Clipboard written') }
    },
  },
  {
    name: 'read_clipboard_image',
    label: t('action.read_clipboard_image.label', 'Read Clipboard Image'),
    category: t('category', 'Desktop Native'),
    icon: 'Image',
    description: t('action.read_clipboard_image.description', 'Read image from system clipboard, returns base64 data URL'),
    properties: [],
    outputs: [
      { key: 'dataUrl', type: 'string' },
    ],
    run: async (ctx, args) => {
      const dataUrl = await ctx.api.readClipboardImage()
      return { success: true, message: t('action.read_clipboard_image.message.success', 'Clipboard image read'), data: { dataUrl } }
    },
  },
  {
    name: 'write_clipboard_image',
    label: t('action.write_clipboard_image.label', 'Write Clipboard Image'),
    category: t('category', 'Desktop Native'),
    icon: 'ImagePlus',
    description: t('action.write_clipboard_image.description', 'Write image to system clipboard'),
    properties: [
      { key: 'dataUrl', label: t('field.dataUrl.label', 'Image Data'), type: 'text', required: true, tooltip: t('field.dataUrl.tooltip', 'Image in base64 data URL format') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.writeClipboardImage(args.dataUrl)
      return { success: true, message: t('action.write_clipboard_image.message.success', 'Clipboard image written') }
    },
  },
  {
    name: 'clear_clipboard',
    label: t('action.clear_clipboard.label', 'Clear Clipboard'),
    category: t('category', 'Desktop Native'),
    icon: 'ClipboardX',
    description: t('action.clear_clipboard.description', 'Clear system clipboard content'),
    properties: [],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.clearClipboard()
      return { success: true, message: t('action.clear_clipboard.message.success', 'Clipboard cleared') }
    },
  },
  {
    name: 'show_notification',
    label: t('action.show_notification.label', 'Send Notification'),
    category: t('category', 'Desktop Native'),
    icon: 'Bell',
    description: t('action.show_notification.description', 'Send a system desktop notification'),
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', required: true, tooltip: t('field.title.tooltip', 'Notification title') },
      { key: 'body', label: t('field.body.label', 'Content'), type: 'text', tooltip: t('field.body.tooltip', 'Notification body text') },
      { key: 'silent', label: t('field.silent.label', 'Silent'), type: 'checkbox', default: false, tooltip: t('field.silent.tooltip', 'Send silently (no sound)') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.showNotification(args)
      return { success: true, message: t('action.show_notification.message.success', 'Notification sent: {title}').replace('{title}', args.title) }
    },
  },
  {
    name: 'show_item_in_folder',
    label: t('action.show_item_in_folder.label', 'Show in Folder'),
    category: t('category', 'Desktop Native'),
    icon: 'FolderSearch',
    description: t('action.show_item_in_folder.description', 'Show a file in the file manager'),
    properties: [
      { key: 'fullPath', label: t('field.fullPath.label', 'File Path'), type: 'text', required: true, tooltip: t('field.fullPath.tooltip', 'Full path of the file') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.showItemInFolder(args.fullPath)
      return { success: true, message: t('action.show_item_in_folder.message.success', 'Shown in folder: {path}').replace('{path}', args.fullPath) }
    },
  },
  {
    name: 'open_path',
    label: t('action.open_path.label', 'Open Path'),
    category: t('category', 'Desktop Native'),
    icon: 'FolderOpen',
    description: t('action.open_path.description', 'Open a file or folder with the system default application'),
    properties: [
      { key: 'path', label: t('field.path.label', 'Path'), type: 'text', required: true, tooltip: t('field.path.tooltip', 'File or folder path') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.openPath(args.path)
      return { success: true, message: t('action.open_path.message.success', 'Opened: {path}').replace('{path}', args.path) }
    },
  },
  {
    name: 'open_external',
    label: t('action.open_external.label', 'Open External Link'),
    category: t('category', 'Desktop Native'),
    icon: 'ExternalLink',
    description: t('action.open_external.description', 'Open a URL with the system default browser'),
    properties: [
      { key: 'url', label: t('field.url.label', 'URL'), type: 'text', required: true, tooltip: t('field.url.tooltip', 'URL to open') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.openExternal(args.url)
      return { success: true, message: t('action.open_external.message.success', 'Opened: {url}').replace('{url}', args.url) }
    },
  },
  {
    name: 'beep',
    label: t('action.beep.label', 'System Beep'),
    category: t('category', 'Desktop Native'),
    icon: 'Volume2',
    description: t('action.beep.description', 'Play a system beep sound'),
    properties: [],
    outputs: [],
    run: async (ctx, args) => {
      await ctx.api.beep()
      return { success: true, message: t('action.beep.message.success', 'Beep sound played') }
    },
  },
  {
    name: 'show_open_dialog',
    label: t('action.show_open_dialog.label', 'Open File Dialog'),
    category: t('category', 'Desktop Native'),
    icon: 'FileSearch',
    description: t('action.show_open_dialog.description', 'Show system file selection dialog, returns selected file paths'),
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', tooltip: t('field.title.tooltip', 'Notification title') },
      { key: 'filters', label: t('field.filters.label', 'File Filters'), type: 'text', tooltip: t('field.filters.tooltip', 'JSON array, e.g. [{"name":"Images","extensions":["png","jpg"]}]') },
      { key: 'properties', label: t('field.properties.label', 'Options'), type: 'text', tooltip: t('field.properties.tooltip', 'JSON array, e.g. ["openFile","multiSelections"]') },
    ],
    outputs: [
      { key: 'filePaths', type: 'object' },
    ],
    run: async (ctx, args) => {
      const opts = {}
      if (args.title) opts.title = args.title
      if (args.filters) opts.filters = JSON.parse(args.filters)
      if (args.properties) opts.properties = JSON.parse(args.properties)
      const filePaths = ctx.api.showOpenDialogSync(opts)
      return { success: true, message: filePaths?.length ? t('action.show_open_dialog.message.selected', 'Selected {count} file(s)').replace('{count}', filePaths.length) : t('action.show_open_dialog.message.none', 'No file selected'), data: { filePaths: filePaths || [] } }
    },
  },
  {
    name: 'show_save_dialog',
    label: t('action.show_save_dialog.label', 'Save File Dialog'),
    category: t('category', 'Desktop Native'),
    icon: 'FileDown',
    description: t('action.show_save_dialog.description', 'Show system save file dialog, returns save path'),
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', tooltip: t('field.title.tooltip', 'Notification title') },
      { key: 'defaultPath', label: t('field.defaultPath.label', 'Default Path'), type: 'text', tooltip: t('field.defaultPath.tooltip', 'Default file name or path') },
      { key: 'filters', label: t('field.filters.label', 'File Filters'), type: 'text', tooltip: t('field.filters.tooltip', 'JSON array, e.g. [{"name":"Images","extensions":["png","jpg"]}]') },
    ],
    outputs: [
      { key: 'filePath', type: 'string' },
    ],
    run: async (ctx, args) => {
      const opts = {}
      if (args.title) opts.title = args.title
      if (args.defaultPath) opts.defaultPath = args.defaultPath
      if (args.filters) opts.filters = JSON.parse(args.filters)
      const filePath = ctx.api.showSaveDialogSync(opts)
      return { success: true, message: filePath ? t('action.show_save_dialog.message.success', 'Save path: {path}').replace('{path}', filePath) : t('action.show_save_dialog.message.none', 'No path selected'), data: { filePath: filePath || '' } }
    },
  },
  {
    name: 'show_message_box',
    label: t('action.show_message_box.label', 'Message Dialog'),
    category: t('category', 'Desktop Native'),
    icon: 'MessageSquare',
    description: t('action.show_message_box.description', 'Show a system message dialog'),
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', required: true, tooltip: t('field.title.tooltip', 'Notification title') },
      { key: 'message', label: t('field.message.label', 'Message'), type: 'text', required: true, tooltip: t('field.message.tooltip', 'Message content') },
      { key: 'type', label: t('field.type.label', 'Type'), type: 'select', default: 'none', tooltip: t('field.type.tooltip', 'Dialog icon type'), options: ['none', 'info', 'warning', 'error', 'question'] },
      { key: 'buttons', label: t('field.buttons.label', 'Buttons'), type: 'text', tooltip: t('field.buttons.tooltip', 'JSON array, e.g. ["OK","Cancel"]') },
    ],
    outputs: [
      { key: 'response', type: 'number' },
    ],
    run: async (ctx, args) => {
      const opts = { title: args.title, message: args.message, type: args.type || 'none' }
      if (args.buttons) opts.buttons = JSON.parse(args.buttons)
      const response = ctx.api.showMessageBoxSync(opts)
      return { success: true, message: t('action.show_message_box.message.success', 'User clicked button {response}').replace('{response}', response), data: { response } }
    },
  },
  {
    name: 'show_error_box',
    label: t('action.show_error_box.label', 'Error Dialog'),
    category: t('category', 'Desktop Native'),
    icon: 'AlertTriangle',
    description: t('action.show_error_box.description', 'Show a system error dialog'),
    properties: [
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', required: true, tooltip: t('field.title.tooltip', 'Notification title') },
      { key: 'content', label: t('field.content.label', 'Content'), type: 'text', required: true, tooltip: t('field.content.tooltip', 'Error content') },
    ],
    outputs: [],
    run: async (ctx, args) => {
      ctx.api.showErrorBox(args.title, args.content)
      return { success: true, message: t('action.show_error_box.message.success', 'Error dialog shown: {title}').replace('{title}', args.title) }
    },
  },
]
