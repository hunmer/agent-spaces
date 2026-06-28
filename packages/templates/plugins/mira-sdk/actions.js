const { request } = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.mira-sdk"]'

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

function createConfigProperties(t) {
  return [
    { key: 'baseUrl', label: 'Server URL', type: 'text', dataType: 'string', required: true, default: `${CONFIG_PREFIX}["baseUrl"]}}` },
    { key: 'username', label: 'Username', type: 'text', dataType: 'string', default: `${CONFIG_PREFIX}["username"]}}` },
    { key: 'password', label: 'Password', type: 'text', dataType: 'string', default: `${CONFIG_PREFIX}["password"]}}` },
    { key: 'token', label: 'Token', type: 'text', dataType: 'string', default: `${CONFIG_PREFIX}["token"]}}` },
    { key: 'timeout', label: 'Timeout (ms)', type: 'number', dataType: 'number', default: `${CONFIG_PREFIX}["timeout"]}}` },
  ]
}

// 认证说明：所有节点都通过 request() 发起请求，token 有效直接使用；
// token 失效（401）会自动用配置里的账号密码重新登录并重试一次，无需手动登录节点。

module.exports = (t) => {
  const configProperties = createConfigProperties(t)

  return [
    // ─── 1. 系统健康检查 ────────────────────────────────────
    {
      name: 'mira_system_health',
      label: t('action.health.label', 'System Health Check'),
      category: t('category', 'Mira SDK'),
      icon: 'Heart',
      description: t('action.health.description', 'Check Mira server health status.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'status', type: 'string' },
          { key: 'uptime', type: 'number', dataType: 'number' },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Checking system health')
        const health = await request(args, client => client.system().getHealth())
        return { success: true, message: t('message.healthOk', 'Server is healthy'), data: health }
      },
    },

    // ─── 2. 获取系统信息 ────────────────────────────────────
    {
      name: 'mira_system_info',
      label: t('action.systemInfo.label', 'System Info'),
      category: t('category', 'Mira SDK'),
      icon: 'Info',
      description: t('action.systemInfo.description', 'Get Mira server system information.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching system info')
        const info = await request(args, client => client.system().getSystemInfo())
        return { success: true, message: t('message.infoFetched', 'System info fetched'), data: info }
      },
    },

    // ─── 4. 获取用户信息 ────────────────────────────────────
    {
      name: 'mira_user_info',
      label: t('action.userInfo.label', 'Get User Info'),
      category: t('category', 'Mira SDK'),
      icon: 'User',
      description: t('action.userInfo.description', 'Get current logged-in user information.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'id', type: 'number', dataType: 'number' },
          { key: 'username', type: 'string' },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching user info')
        const info = await request(args, client => client.user().getInfo())
        return { success: true, message: t('message.userInfoOk', 'User info fetched'), data: info }
      },
    },

    // ─── 5. 获取所有素材库 ──────────────────────────────────
    {
      name: 'mira_libraries_list',
      label: t('action.librariesList.label', 'List Libraries'),
      category: t('category', 'Mira SDK'),
      icon: 'Library',
      description: t('action.librariesList.description', 'Get all material libraries.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'libraries', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching libraries')
        const libraries = await request(args, client => client.libraries().getAll())
        return { success: true, message: t('message.librariesCount', 'Found {count} libraries').replace('{count}', String(Array.isArray(libraries) ? libraries.length : 0)), data: { libraries } }
      },
    },

    // ─── 6. 创建本地素材库 ──────────────────────────────────
    {
      name: 'mira_library_create_local',
      label: t('action.createLocalLib.label', 'Create Local Library'),
      category: t('category', 'Mira SDK'),
      icon: 'FolderPlus',
      description: t('action.createLocalLib.description', 'Create a local material library.'),
      properties: [
        { key: 'name', label: 'Name', type: 'text', dataType: 'string', required: true, tooltip: t('field.libName.tooltip', 'Library name.') },
        { key: 'path', label: 'Path', type: 'text', dataType: 'string', required: true, tooltip: t('field.libPath.tooltip', 'Local directory path.') },
        { key: 'description', label: 'Description', type: 'text', dataType: 'string', tooltip: t('field.libDesc.tooltip', 'Library description.') },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.name || !args.path) {
          return { success: false, message: t('message.needNameAndPath', 'Name and path required.') }
        }
        ctx.logger.info(`Creating local library: ${args.name}`)
        await request(args, client => client.libraries().createLocal(args.name, args.path, args.description || ''))
        return { success: true, message: t('message.libCreated', 'Library created: {name}').replace('{name}', args.name) }
      },
    },

    // ─── 7. 创建远程素材库 ──────────────────────────────────
    {
      name: 'mira_library_create_remote',
      label: t('action.createRemoteLib.label', 'Create Remote Library'),
      category: t('category', 'Mira SDK'),
      icon: 'Globe',
      description: t('action.createRemoteLib.description', 'Create a remote material library.'),
      properties: [
        { key: 'name', label: 'Name', type: 'text', dataType: 'string', required: true },
        { key: 'path', label: 'Path', type: 'text', dataType: 'string', required: true, tooltip: t('field.libPath.tooltip', 'Remote path.') },
        { key: 'host', label: 'Host', type: 'text', dataType: 'string', required: true, tooltip: t('field.libHost.tooltip', 'Remote server host.') },
        { key: 'port', label: 'Port', type: 'number', dataType: 'number', default: 8080 },
        { key: 'description', label: 'Description', type: 'text', dataType: 'string' },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.name || !args.path || !args.host) {
          return { success: false, message: t('message.needNamePathHost', 'Name, path, and host required.') }
        }
        ctx.logger.info(`Creating remote library: ${args.name}`)
        await request(args, client => client.libraries().createRemote(args.name, args.path, args.host, args.port || 8080, args.description || ''))
        return { success: true, message: t('message.libCreated', 'Library created: {name}').replace('{name}', args.name) }
      },
    },

    // ─── 8. 启动/停止/重启素材库 ────────────────────────────
    {
      name: 'mira_library_start',
      label: t('action.libStart.label', 'Start Library'),
      category: t('category', 'Mira SDK'),
      icon: 'Play',
      description: t('action.libStart.description', 'Start a material library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.libraryId) return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        ctx.logger.info(`Starting library: ${args.libraryId}`)
        await request(args, client => client.libraries().start(args.libraryId))
        return { success: true, message: t('message.libStarted', 'Library started.') }
      },
    },
    {
      name: 'mira_library_stop',
      label: t('action.libStop.label', 'Stop Library'),
      category: t('category', 'Mira SDK'),
      icon: 'Square',
      description: t('action.libStop.description', 'Stop a material library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: commonOutputs,
      tool: false,
      run: async (ctx, args) => {
        if (!args.libraryId) return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        ctx.logger.info(`Stopping library: ${args.libraryId}`)
        await request(args, client => client.libraries().stop(args.libraryId))
        return { success: true, message: t('message.libStopped', 'Library stopped.') }
      },
    },
    {
      name: 'mira_library_restart',
      label: t('action.libRestart.label', 'Restart Library'),
      category: t('category', 'Mira SDK'),
      icon: 'RotateCcw',
      description: t('action.libRestart.description', 'Restart a material library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.libraryId) return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        ctx.logger.info(`Restarting library: ${args.libraryId}`)
        await request(args, client => client.libraries().restart(args.libraryId))
        return { success: true, message: t('message.libRestarted', 'Library restarted.') }
      },
    },

    // ─── 9. 上传文件 ───────────────────────────────────────
    {
      name: 'mira_file_upload',
      label: t('action.fileUpload.label', 'Upload File'),
      category: t('category', 'Mira SDK'),
      icon: 'Upload',
      description: t('action.fileUpload.description', 'Upload a file to a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'filePath', label: 'File Path', type: 'text', dataType: 'string', required: true, tooltip: t('field.filePath.tooltip', 'Local file path to upload.') },
        { key: 'tags', label: 'Tags', type: 'text', dataType: 'string', tooltip: t('field.tags.tooltip', 'Comma-separated tags.') },
        { key: 'folderId', label: 'Folder ID', type: 'text', dataType: 'string', tooltip: t('field.folderId.tooltip', 'Target folder ID.') },
      ],
      toolProperties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', required: true },
        { key: 'filePath', label: 'File Path', type: 'text', required: true },
        { key: 'tags', label: 'Tags', type: 'text', tooltip: 'Comma-separated tags.' },
        { key: 'folderId', label: 'Folder ID', type: 'text' },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'fileId', type: 'string' },
          { key: 'fileName', type: 'string' },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.libraryId || !args.filePath) {
          return { success: false, message: t('message.needLibraryAndFile', 'Library ID and file path required.') }
        }

        ctx.logger.info(`Uploading file: ${args.filePath} -> library ${args.libraryId}`)

        // 使用 fs 读取本地文件并构造 File-like 对象供 SDK 使用
        const fs = require('fs')
        const path = require('path')
        const buffer = fs.readFileSync(args.filePath)
        const fileName = path.basename(args.filePath)
        const fileBlob = new Blob([buffer])
        const file = new File([fileBlob], fileName)

        const options = {}
        if (args.tags) options.tags = args.tags.split(',').map(s => s.trim()).filter(Boolean)
        if (args.folderId) options.folderId = args.folderId

        const result = await request(args, client => client.files().uploadFile(file, args.libraryId, options))
        return { success: true, message: t('message.fileUploaded', 'File uploaded: {name}').replace('{name}', fileName), data: result }
      },
    },

    // ─── 10. 下载文件 ───────────────────────────────────────
    {
      name: 'mira_file_download',
      label: t('action.fileDownload.label', 'Download File'),
      category: t('category', 'Mira SDK'),
      icon: 'Download',
      description: t('action.fileDownload.description', 'Download a file from a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'fileId', label: 'File ID', type: 'text', dataType: 'string', required: true },
        { key: 'savePath', label: 'Save Path', type: 'text', dataType: 'string', tooltip: t('field.savePath.tooltip', 'Local path to save. Leave empty to return content.') },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'filePath', type: 'string' },
          { key: 'contentLength', type: 'number', dataType: 'number' },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.libraryId || !args.fileId) {
          return { success: false, message: t('message.needLibraryAndFileId', 'Library ID and file ID required.') }
        }
        ctx.logger.info(`Downloading file: ${args.fileId} from library ${args.libraryId}`)

        if (args.savePath) {
          await request(args, client => client.files().downloadAndSave(args.libraryId, args.fileId, args.savePath))
          return { success: true, message: t('message.fileDownloaded', 'File downloaded.'), data: { filePath: args.savePath } }
        }

        const text = await request(args, async client => {
          const blob = await client.files().download(args.libraryId, args.fileId)
          return blob.text()
        })
        return { success: true, message: t('message.fileDownloaded', 'File downloaded.'), data: { content: text, contentLength: text.length } }
      },
    },

    // ─── 11. 删除文件 ───────────────────────────────────────
    {
      name: 'mira_file_delete',
      label: t('action.fileDelete.label', 'Delete File'),
      category: t('category', 'Mira SDK'),
      icon: 'Trash2',
      description: t('action.fileDelete.description', 'Delete a file from a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'fileId', label: 'File ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.libraryId || !args.fileId) {
          return { success: false, message: t('message.needLibraryAndFileId', 'Library ID and file ID required.') }
        }
        ctx.logger.info(`Deleting file: ${args.fileId} from library ${args.libraryId}`)
        await request(args, client => client.files().delete(args.libraryId, args.fileId))
        return { success: true, message: t('message.fileDeleted', 'File deleted.') }
      },
    },

    // ─── 12. 搜索文件 ───────────────────────────────────────
    {
      name: 'mira_file_search',
      label: t('action.fileSearch.label', 'Search Files'),
      category: t('category', 'Mira SDK'),
      icon: 'Search',
      description: t('action.fileSearch.description', 'Search / filter files in a library. All filters are optional and combined with AND.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'keyword', label: t('field.keyword.label', 'Keyword'), type: 'text', dataType: 'string', tooltip: t('field.keyword.tooltip', 'Fuzzy match on file title. Optional.') },
        { key: 'folderId', label: t('field.folderId.label', 'Folder ID'), type: 'text', dataType: 'string', tooltip: t('field.folderId.tooltip', 'Filter by folder.') },
        { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'text', dataType: 'string', tooltip: t('field.tags.tooltip', 'Comma-separated tag names.') },
        { key: 'extension', label: t('field.extension.label', 'Extension'), type: 'text', dataType: 'string', tooltip: t('field.extension.tooltip', 'File extension, e.g. png, mp4.') },
        { key: 'isUrlFile', label: t('field.isUrlFile.label', 'Is URL File'), type: 'select', dataType: 'string', default: '', options: [
          { label: t('field.isUrlFile.any', 'Any'), value: '' },
          { label: t('field.isUrlFile.yes', 'URL only'), value: 'true' },
          { label: t('field.isUrlFile.no', 'Local only'), value: 'false' },
        ], tooltip: t('field.isUrlFile.tooltip', 'Filter URL/local files.') },
        { key: 'minSize', label: t('field.minSize.label', 'Min Size (bytes)'), type: 'number', dataType: 'number', tooltip: t('field.minSize.tooltip', 'Minimum file size in bytes.') },
        { key: 'maxSize', label: t('field.maxSize.label', 'Max Size (bytes)'), type: 'number', dataType: 'number', tooltip: t('field.maxSize.tooltip', 'Maximum file size in bytes.') },
        { key: 'createdAfter', label: t('field.createdAfter.label', 'Created After'), type: 'text', dataType: 'string', tooltip: t('field.createdAfter.tooltip', 'ISO date, e.g. 2026-01-01.') },
        { key: 'createdBefore', label: t('field.createdBefore.label', 'Created Before'), type: 'text', dataType: 'string', tooltip: t('field.createdBefore.tooltip', 'ISO date, e.g. 2026-12-31.') },
        { key: 'page', label: t('field.page.label', 'Page'), type: 'number', dataType: 'number', default: 1, tooltip: t('field.page.tooltip', 'Page number, starts at 1.') },
        { key: 'pageSize', label: t('field.pageSize.label', 'Page Size'), type: 'number', dataType: 'number', default: 20, tooltip: t('field.pageSize.tooltip', 'Items per page.') },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'files', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.libraryId) {
          return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        }

        const filters = {}
        if (args.keyword) filters.title = args.keyword
        if (args.folderId) filters.folder_id = args.folderId
        if (args.tags) filters.tags = args.tags.split(',').map(s => s.trim()).filter(Boolean)
        if (args.extension) filters.extension = args.extension
        if (args.minSize != null && args.minSize !== '') filters.size_min = Number(args.minSize)
        if (args.maxSize != null && args.maxSize !== '') filters.size_max = Number(args.maxSize)
        if (args.createdAfter) filters.created_after = args.createdAfter
        if (args.createdBefore) filters.created_before = args.createdBefore

        const page = Number(args.page) > 0 ? Number(args.page) : 1
        const pageSize = Number(args.pageSize) > 0 ? Number(args.pageSize) : 20
        filters.limit = pageSize
        filters.offset = (page - 1) * pageSize

        const reqBody = { libraryId: args.libraryId, filters }
        if (args.isUrlFile === 'true') reqBody.isUrlFile = true
        else if (args.isUrlFile === 'false') reqBody.isUrlFile = false

        ctx.logger.info(`Searching files in library ${args.libraryId}: ${JSON.stringify(filters)}`)
        const results = await request(args, client => client.files().getFiles(reqBody))
        // SDK getFiles 返回 { result: [...], total?, ... }，兼容纯数组返回
        const files = Array.isArray(results) ? results : (Array.isArray(results?.result) ? results.result : [])
        const count = files.length
        return { success: true, message: t('message.filesFound', 'Found {count} files').replace('{count}', String(count)), data: { files: results } }
      },
    },

    // ─── 13. 获取所有插件 ───────────────────────────────────
    {
      name: 'mira_plugins_list',
      label: t('action.pluginsList.label', 'List Plugins'),
      category: t('category', 'Mira SDK'),
      icon: 'Puzzle',
      description: t('action.pluginsList.description', 'Get all installed plugins.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'plugins', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching plugins')
        const plugins = await request(args, client => client.plugins().getAll())
        return { success: true, message: t('message.pluginsCount', 'Found {count} plugins').replace('{count}', String(Array.isArray(plugins) ? plugins.length : 0)), data: { plugins } }
      },
    },

    // ─── 14. 启用/禁用插件 ──────────────────────────────────
    {
      name: 'mira_plugin_toggle',
      label: t('action.pluginToggle.label', 'Toggle Plugin'),
      category: t('category', 'Mira SDK'),
      icon: 'ToggleRight',
      description: t('action.pluginToggle.description', 'Enable or disable a plugin.'),
      properties: [
        { key: 'pluginId', label: 'Plugin ID', type: 'text', dataType: 'string', required: true },
        {
          key: 'action',
          label: 'Action',
          type: 'select', dataType: 'string',
          required: true,
          default: 'enable',
          options: [{ label: 'Enable', value: 'enable' }, { label: 'Disable', value: 'disable' }],
        },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.pluginId || !args.action) {
          return { success: false, message: t('message.needPluginAndAction', 'Plugin ID and action required.') }
        }
        const action = args.action === 'enable' ? 'enable' : 'disable'
        ctx.logger.info(`${action} plugin: ${args.pluginId}`)
        await request(args, client => client.plugins()[action](args.pluginId))
        return { success: true, message: t('message.pluginToggled', 'Plugin {action}: {id}').replace('{action}', action).replace('{id}', args.pluginId) }
      },
    },

    // ─── 15. 获取数据库表 ───────────────────────────────────
    {
      name: 'mira_database_tables',
      label: t('action.dbTables.label', 'List Database Tables'),
      category: t('category', 'Mira SDK'),
      icon: 'Database',
      description: t('action.dbTables.description', 'Get all database tables.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'tables', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching database tables')
        const tables = await request(args, client => client.database().getTables())
        return { success: true, message: t('message.tablesCount', 'Found {count} tables').replace('{count}', String(Array.isArray(tables) ? tables.length : 0)), data: { tables } }
      },
    },

    // ─── 16. 查询数据库表数据 ───────────────────────────────
    {
      name: 'mira_database_query',
      label: t('action.dbQuery.label', 'Query Table Data'),
      category: t('category', 'Mira SDK'),
      icon: 'Table',
      description: t('action.dbQuery.description', 'Get data from a database table.'),
      properties: [
        { key: 'tableName', label: 'Table Name', type: 'text', dataType: 'string', required: true, tooltip: t('field.tableName.tooltip', 'Database table name.') },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'rows', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.tableName) {
          return { success: false, message: t('message.needTableName', 'Table name required.') }
        }
        ctx.logger.info(`Querying table: ${args.tableName}`)
        const data = await request(args, client => client.database().getTableData(args.tableName))
        return { success: true, message: t('message.dataFetched', 'Table data fetched'), data: { rows: data } }
      },
    },

    // ─── 17. 获取设备列表 ───────────────────────────────────
    {
      name: 'mira_devices_list',
      label: t('action.devicesList.label', 'List Devices'),
      category: t('category', 'Mira SDK'),
      icon: 'Smartphone',
      description: t('action.devicesList.description', 'Get all connected devices.'),
      properties: [],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'devices', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        ctx.logger.info('Fetching devices')
        const devices = await request(args, client => client.devices().getAll())
        return { success: true, message: t('message.devicesCount', 'Found {count} devices').replace('{count}', String(Array.isArray(devices) ? devices.length : 0)), data: { devices } }
      },
    },

    // ─── 18. 发送设备消息 ───────────────────────────────────
    {
      name: 'mira_device_send_message',
      label: t('action.deviceSend.label', 'Send Device Message'),
      category: t('category', 'Mira SDK'),
      icon: 'Send',
      description: t('action.deviceSend.description', 'Send a message to a connected device.'),
      properties: [
        { key: 'clientId', label: 'Client ID', type: 'text', dataType: 'string', required: true },
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'message', label: 'Message', type: 'textarea', dataType: 'object', required: true, tooltip: t('field.message.tooltip', 'Message to send. Can be JSON string.') },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.clientId || !args.libraryId || !args.message) {
          return { success: false, message: t('message.needClientLibMsg', 'Client ID, Library ID, and message required.') }
        }
        let msgData = args.message
        try { msgData = JSON.parse(args.message) } catch {}
        ctx.logger.info(`Sending message to device: ${args.clientId}`)
        await request(args, client => client.devices().sendMessage(args.clientId, args.libraryId, msgData))
        return { success: true, message: t('message.messageSent', 'Message sent.') }
      },
    },

    // ─── 19. 广播消息到素材库 ───────────────────────────────
    {
      name: 'mira_device_broadcast',
      label: t('action.broadcast.label', 'Broadcast to Library'),
      category: t('category', 'Mira SDK'),
      icon: 'Radio',
      description: t('action.broadcast.description', 'Broadcast a message to all devices in a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'message', label: 'Message', type: 'textarea', dataType: 'object', required: true },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.libraryId || !args.message) {
          return { success: false, message: t('message.needLibraryAndMsg', 'Library ID and message required.') }
        }
        let msgData = args.message
        try { msgData = JSON.parse(args.message) } catch {}
        ctx.logger.info(`Broadcasting to library: ${args.libraryId}`)
        await request(args, client => client.devices().broadcastToLibrary(args.libraryId, msgData))
        return { success: true, message: t('message.broadcastOk', 'Broadcast sent.') }
      },
    },

    // ─── 20. 获取标签列表 ───────────────────────────────────
    {
      name: 'mira_tags_list',
      label: t('action.tagsList.label', 'List Tags'),
      category: t('category', 'Mira SDK'),
      icon: 'Tag',
      description: t('action.tagsList.description', 'Get all tags in a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'tags', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.libraryId) return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        ctx.logger.info(`Fetching tags for library: ${args.libraryId}`)
        const result = await request(args, client => client.tags().getAll(args.libraryId))
        return { success: true, message: t('message.tagsFetched', 'Tags fetched'), data: { tags: result } }
      },
    },

    // ─── 21. 获取文件夹列表 ─────────────────────────────────
    {
      name: 'mira_folders_list',
      label: t('action.foldersList.label', 'List Folders'),
      category: t('category', 'Mira SDK'),
      icon: 'FolderTree',
      description: t('action.foldersList.description', 'Get all folders in a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
      ],
      configProperties,
      outputs: [
        ...commonOutputs,
        { key: 'data', type: 'object', dataType: 'object', children: [
          { key: 'folders', type: 'object', dataType: 'object', children: [] },
        ] },
      ],
      run: async (ctx, args) => {
        if (!args.libraryId) return { success: false, message: t('message.needLibraryId', 'Library ID required.') }
        ctx.logger.info(`Fetching folders for library: ${args.libraryId}`)
        const result = await request(args, client => client.folders().getAll(args.libraryId))
        return { success: true, message: t('message.foldersFetched', 'Folders fetched'), data: { folders: result } }
      },
    },

    // ─── 22. 创建文件夹 ─────────────────────────────────────
    {
      name: 'mira_folder_create',
      label: t('action.folderCreate.label', 'Create Folder'),
      category: t('category', 'Mira SDK'),
      icon: 'FolderPlus',
      description: t('action.folderCreate.description', 'Create a folder in a library.'),
      properties: [
        { key: 'libraryId', label: 'Library ID', type: 'text', dataType: 'string', required: true },
        { key: 'name', label: 'Folder Name', type: 'text', dataType: 'string', required: true },
        { key: 'parentId', label: 'Parent Folder ID', type: 'text', dataType: 'string', tooltip: t('field.parentId.tooltip', 'Leave empty for root folder.') },
      ],
      configProperties,
      outputs: commonOutputs,
      run: async (ctx, args) => {
        if (!args.libraryId || !args.name) {
          return { success: false, message: t('message.needLibAndName', 'Library ID and folder name required.') }
        }
        ctx.logger.info(`Creating folder: ${args.name} in library ${args.libraryId}`)
        await request(args, client => client.folders().createFolder(args.libraryId, args.name, args.parentId || undefined))
        return { success: true, message: t('message.folderCreated', 'Folder created: {name}').replace('{name}', args.name) }
      },
    },
  ]
}
