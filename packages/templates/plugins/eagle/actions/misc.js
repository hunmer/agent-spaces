// Eagle Library + App + AI Search 模块
// 文档: docs/library.md, docs/app.md, docs/ai-search.md
const { eagleGet, eaglePost, configProperties } = require('../shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

module.exports = (t) => [
  // ==================== App ====================
  {
    name: 'eagle_app_info',
    label: t('action.app_info.label', 'Eagle App Info'),
    category: t('category', 'Eagle'),
    icon: 'Info',
    description: t('action.app_info.description', 'Get running Eagle application info: version, prerelease, build, platform. Useful to check Eagle is running.'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'version', type: 'string' },
          { key: 'prereleaseVersion', type: 'string' },
          { key: 'buildVersion', type: 'string' },
          { key: 'platform', type: 'string' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const info = await eagleGet(ctx, args, 'app/info')
      return {
        success: true,
        message: t('message.appInfo', 'Eagle {version} on {platform}').replace('{version}', info.version).replace('{platform}', info.platform),
        data: info,
      }
    },
  },

  // ==================== Library ====================
  {
    name: 'eagle_library_info',
    label: t('action.library_info.label', 'Eagle Library Info'),
    category: t('category', 'Eagle'),
    icon: 'Library',
    description: t('action.library_info.description', 'Get metadata of the currently open Eagle library (name, path, folders, smart folders, tag groups).'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const info = await eagleGet(ctx, args, 'library/info')
      return {
        success: true,
        message: t('message.libraryInfo', 'Library: {name}').replace('{name}', (info && info.name) || ''),
        data: info,
      }
    },
  },

  {
    name: 'eagle_library_history',
    label: t('action.library_history.label', 'Eagle Library History'),
    category: t('category', 'Eagle'),
    icon: 'History',
    description: t('action.library_history.description', 'Get the list of historical libraries. Returns paginated results.'),
    tool: false,
    properties: [
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'libraries', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const data = await eagleGet(ctx, args, 'library/history', {
        limit: args.limit, offset: args.offset,
      })
      const libraries = (data && data.data) || []
      return {
        success: true,
        message: t('message.libraryHistory', 'Found {count} libraries.').replace('{count}', libraries.length),
        data: { libraries },
      }
    },
  },

  {
    name: 'eagle_library_switch',
    label: t('action.library_switch.label', 'Eagle Switch Library'),
    category: t('category', 'Eagle'),
    icon: 'RefreshCw',
    description: t('action.library_switch.description', 'Switch to another library by its path.'),
    tool: false,
    properties: [
      { key: 'libraryPath', label: t('field.libraryPath.label', 'Library Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.libraryPath.tooltip', 'Full path to the .library directory.') },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.libraryPath) return { success: false, message: t('message.missingLibraryPath', 'Missing libraryPath.') }
      await eaglePost(ctx, args, 'library/switch', { libraryPath: args.libraryPath })
      return { success: true, message: t('message.librarySwitched', 'Switched library: {path}').replace('{path}', args.libraryPath) }
    },
  },

  // ==================== AI Search ====================
  {
    name: 'eagle_ai_status',
    label: t('action.ai_status.label', 'Eagle AI Search Status'),
    category: t('category', 'Eagle'),
    icon: 'Activity',
    description: t('action.ai_status.description', 'Check AI Search availability: installed, ready, starting, syncing, sync progress, service health. Recommended before any AI search.'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'isInstalled', type: 'boolean', dataType: 'boolean' },
          { key: 'isReady', type: 'boolean', dataType: 'boolean' },
          { key: 'isStarting', type: 'boolean', dataType: 'boolean' },
          { key: 'isSyncing', type: 'boolean', dataType: 'boolean' },
          { key: 'syncStatus', type: 'object', dataType: 'object', children: [] },
          { key: 'serviceHealth', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      const [isInstalled, isReady, isStarting, isSyncing, syncStatus, serviceHealth] = await Promise.all([
        eagleGet(ctx, args, 'aiSearch/isInstalled'),
        eagleGet(ctx, args, 'aiSearch/isReady'),
        eagleGet(ctx, args, 'aiSearch/isStarting'),
        eagleGet(ctx, args, 'aiSearch/isSyncing'),
        eagleGet(ctx, args, 'aiSearch/getSyncStatus'),
        eagleGet(ctx, args, 'aiSearch/checkServiceHealth'),
      ])
      return {
        success: true,
        message: t('message.aiStatus', 'AI Search ready: {ready}').replace('{ready}', isReady ? 'yes' : 'no'),
        data: { isInstalled, isReady, isStarting, isSyncing, syncStatus, serviceHealth },
      }
    },
  },

  {
    name: 'eagle_ai_search_text',
    label: t('action.ai_search_text.label', 'Eagle AI Search By Text'),
    category: t('category', 'Eagle'),
    icon: 'Search',
    description: t('action.ai_search_text.description', 'Semantic search by natural language text description. Requires the AI Search plugin installed and ready.'),
    properties: [
      { key: 'query', label: t('field.query.label', 'Query'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.query.ai.tooltip', 'Natural language description, e.g. "an orange cat on a windowsill".') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 20, toolRequired: false },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'results', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.query) return { success: false, message: t('message.missingQuery', 'Missing query.') }
      const options = {}
      if (args.limit !== undefined && args.limit !== '') options.limit = Number(args.limit)
      const data = await eaglePost(ctx, args, 'aiSearch/searchByText', { query: args.query, options })
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Search returned {count} items.').replace('{count}', results.length),
        data: { results },
      }
    },
  },

  {
    name: 'eagle_ai_search_base64',
    label: t('action.ai_search_base64.label', 'Eagle AI Search By Image'),
    category: t('category', 'Eagle'),
    icon: 'ImageSearch',
    description: t('action.ai_search_base64.description', 'Find visually similar items via a Base64-encoded image. Requires the AI Search plugin.'),
    tool: false,
    properties: [
      { key: 'base64', label: t('field.base64.label', 'Base64 Image'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.base64.image.tooltip', 'Base64-encoded image data.') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 20 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'results', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.base64) return { success: false, message: t('message.missingBase64', 'Missing base64.') }
      const options = {}
      if (args.limit !== undefined && args.limit !== '') options.limit = Number(args.limit)
      const data = await eaglePost(ctx, args, 'aiSearch/searchByBase64', { base64: args.base64, options })
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Search returned {count} items.').replace('{count}', results.length),
        data: { results },
      }
    },
  },

  {
    name: 'eagle_ai_search_item',
    label: t('action.ai_search_item.label', 'Eagle AI Search Similar Items'),
    category: t('category', 'Eagle'),
    icon: 'Copy',
    description: t('action.ai_search_item.description', 'Find items visually similar to an existing library item. Requires the AI Search plugin.'),
    properties: [
      { key: 'itemId', label: t('field.itemId.label', 'Item ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.itemId.similar.tooltip', 'Find items similar to this one.') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 20, toolRequired: false },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'results', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.itemId) return { success: false, message: t('message.missingItemId', 'Missing itemId.') }
      const options = {}
      if (args.limit !== undefined && args.limit !== '') options.limit = Number(args.limit)
      const data = await eaglePost(ctx, args, 'aiSearch/searchByItemId', { itemId: args.itemId, options })
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Search returned {count} items.').replace('{count}', results.length),
        data: { results },
      }
    },
  },
]
