// Eagle Folder + Smart Folder 模块
// 文档: docs/folder.md, docs/smart-folder.md
const { eagleGet, eaglePost, configProperties, asArray, asObject } = require('../shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

const ICON_COLORS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink']

function colorOptions(t) {
  return ICON_COLORS.map((c) => ({ label: c, value: c }))
}

module.exports = (t) => [
  // ==================== Folder ====================
  {
    name: 'eagle_folder_list',
    label: t('action.folder_list.label', 'Eagle List Folders'),
    category: t('category', 'Eagle'),
    icon: 'Folder',
    description: t('action.folder_list.description', 'List Eagle folders with optional filters. Returns paginated results.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Folder ID'), type: 'text', dataType: 'string', tooltip: t('field.id.single.tooltip', 'Return a single folder by ID.') },
      { key: 'ids', label: t('field.ids.label', 'Folder IDs'), type: 'textarea', dataType: 'string[]', tooltip: t('field.ids.tooltip', 'JSON array or comma-separated folder IDs.') },
      { key: 'isRecent', label: t('field.isRecent.label', 'Recent Only'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.isRecent.tooltip', 'Return recently used folders.') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'folders', type: 'object', dataType: 'object', children: [] },
          { key: 'total', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const body = {}
      if (args.id) body.id = args.id
      const ids = asArray(args.ids)
      if (ids.length) body.ids = ids
      if (args.isRecent) body.isRecent = true
      if (args.limit !== undefined && args.limit !== '') body.limit = Number(args.limit)
      if (args.offset !== undefined && args.offset !== '') body.offset = Number(args.offset)
      const data = await eaglePost(ctx, args, 'folder/get', body)
      const folders = (data && data.data) || []
      return {
        success: true,
        message: t('message.foldersFound', 'Found {count} folders.').replace('{count}', folders.length),
        data: { folders, total: data.total },
      }
    },
  },

  {
    name: 'eagle_folder_create',
    label: t('action.folder_create.label', 'Eagle Create Folder'),
    category: t('category', 'Eagle'),
    icon: 'FolderPlus',
    description: t('action.folder_create.description', 'Create a new folder in the library. Omit parent for a root-level folder.'),
    properties: [
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string', required: true },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
      { key: 'parent', label: t('field.parent.label', 'Parent Folder ID'), type: 'text', dataType: 'string', tooltip: t('field.parent.tooltip', 'Parent folder ID. Empty for root level.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'folder', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.name) return { success: false, message: t('message.missingName', 'Missing folder name.') }
      const body = { name: args.name }
      if (args.description) body.description = args.description
      if (args.parent) body.parent = args.parent
      const folder = await eaglePost(ctx, args, 'folder/create', body)
      return {
        success: true,
        message: t('message.folderCreated', 'Folder created: {name} ({id})').replace('{name}', args.name).replace('{id}', (folder && folder.id) || ''),
        data: { id: folder && folder.id, folder },
      }
    },
  },

  {
    name: 'eagle_folder_update',
    label: t('action.folder_update.label', 'Eagle Update Folder'),
    category: t('category', 'Eagle'),
    icon: 'FolderEdit',
    description: t('action.folder_update.description', 'Update folder metadata (name, description, tags, iconColor) or move it to another parent.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Folder ID'), type: 'text', dataType: 'string', required: true },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string' },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', tooltip: t('field.tags.replace.tooltip', 'Replaces existing folder tags.') },
      {
        key: 'iconColor', label: t('field.iconColor.label', 'Icon Color'),
        type: 'select', dataType: 'string', options: colorOptions(t), enum: ICON_COLORS,
        tooltip: t('field.iconColor.tooltip', 'Folder icon color.'),
      },
      { key: 'parent', label: t('field.parent.label', 'Parent Folder ID'), type: 'text', dataType: 'string', tooltip: t('field.parent.move.tooltip', 'Move to this parent. Set to null to move to root.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing folder id.') }
      const body = { id: args.id }
      if (args.name) body.name = args.name
      if (args.description !== undefined) body.description = args.description
      const tags = asArray(args.tags)
      if (tags.length) body.tags = tags
      if (args.iconColor) body.iconColor = args.iconColor
      if (args.parent !== undefined && args.parent !== '') {
        body.parent = args.parent === 'null' ? null : args.parent
      }
      const folder = await eaglePost(ctx, args, 'folder/update', body)
      return {
        success: true,
        message: t('message.folderUpdated', 'Folder updated: {id}').replace('{id}', args.id),
        data: folder,
      }
    },
  },

  // ==================== Smart Folder (Build 22+) ====================
  {
    name: 'eagle_smart_folder_list',
    label: t('action.smart_folder_list.label', 'Eagle List Smart Folders'),
    category: t('category', 'Eagle'),
    icon: 'FolderSearch',
    description: t('action.smart_folder_list.description', 'List smart folders, optionally filtered by ID(s). Requires Eagle 4.0 Build 22+.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Smart Folder ID'), type: 'text', dataType: 'string' },
      { key: 'ids', label: t('field.ids.label', 'Smart Folder IDs'), type: 'textarea', dataType: 'string[]' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'smartFolders', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const body = {}
      if (args.id) body.id = args.id
      const ids = asArray(args.ids)
      if (ids.length) body.ids = ids
      const data = await eaglePost(ctx, args, 'smartFolder/get', body)
      const smartFolders = Array.isArray(data) ? data : (data && data.data) || []
      return {
        success: true,
        message: t('message.smartFoldersFound', 'Found {count} smart folders.').replace('{count}', smartFolders.length),
        data: { smartFolders },
      }
    },
  },

  {
    name: 'eagle_smart_folder_get_rules',
    label: t('action.smart_folder_rules.label', 'Eagle Get Smart Folder Rules'),
    category: t('category', 'Eagle'),
    icon: 'ListChecks',
    description: t('action.smart_folder_rules.description', 'Get the available filter rule schema (properties, methods, value types) for building smart folder conditions.'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'rules', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const rules = await eagleGet(ctx, args, 'smartFolder/getRules')
      return {
        success: true,
        message: t('message.rulesLoaded', 'Loaded rule schema.'),
        data: { rules },
      }
    },
  },

  {
    name: 'eagle_smart_folder_create',
    label: t('action.smart_folder_create.label', 'Eagle Create Smart Folder'),
    category: t('category', 'Eagle'),
    icon: 'Sparkles',
    description: t('action.smart_folder_create.description', 'Create a smart folder with filter conditions. Use get-rules first to build valid conditions. Requires Eagle 4.0 Build 22+.'),
    properties: [
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string', required: true },
      { key: 'conditions', label: t('field.conditions.label', 'Conditions'), type: 'textarea', dataType: 'object[]', required: true, tooltip: t('field.conditions.tooltip', 'JSON array of condition groups. See get-rules output for schema.') },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
      {
        key: 'iconColor', label: t('field.iconColor.label', 'Icon Color'),
        type: 'select', dataType: 'string', options: colorOptions(t), enum: ICON_COLORS,
      },
      { key: 'parent', label: t('field.parent.label', 'Parent Smart Folder ID'), type: 'text', dataType: 'string' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'smartFolder', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.name) return { success: false, message: t('message.missingName', 'Missing name.') }
      const conditions = asArray(args.conditions)
      if (!conditions.length) return { success: false, message: t('message.missingConditions', 'Missing conditions.') }
      const body = { name: args.name, conditions }
      if (args.description) body.description = args.description
      if (args.iconColor) body.iconColor = args.iconColor
      if (args.parent) body.parent = args.parent
      const smartFolder = await eaglePost(ctx, args, 'smartFolder/create', body)
      return {
        success: true,
        message: t('message.smartFolderCreated', 'Smart folder created: {id}').replace('{id}', (smartFolder && smartFolder.id) || ''),
        data: { id: smartFolder && smartFolder.id, smartFolder },
      }
    },
  },

  {
    name: 'eagle_smart_folder_update',
    label: t('action.smart_folder_update.label', 'Eagle Update Smart Folder'),
    category: t('category', 'Eagle'),
    icon: 'FolderEdit',
    description: t('action.smart_folder_update.description', 'Update a smart folder. Only provided fields are modified. Requires Eagle 4.0 Build 22+.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Smart Folder ID'), type: 'text', dataType: 'string', required: true },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string' },
      { key: 'conditions', label: t('field.conditions.label', 'Conditions'), type: 'textarea', dataType: 'object[]', tooltip: t('field.conditions.tooltip', 'JSON array of condition groups.') },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
      {
        key: 'iconColor', label: t('field.iconColor.label', 'Icon Color'),
        type: 'select', dataType: 'string', options: colorOptions(t), enum: ICON_COLORS,
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing smart folder id.') }
      const body = { id: args.id }
      if (args.name) body.name = args.name
      const conditions = asArray(args.conditions)
      if (conditions.length) body.conditions = conditions
      if (args.description !== undefined) body.description = args.description
      if (args.iconColor) body.iconColor = args.iconColor
      const smartFolder = await eaglePost(ctx, args, 'smartFolder/update', body)
      return {
        success: true,
        message: t('message.smartFolderUpdated', 'Smart folder updated: {id}').replace('{id}', args.id),
        data: smartFolder,
      }
    },
  },

  {
    name: 'eagle_smart_folder_remove',
    label: t('action.smart_folder_remove.label', 'Eagle Remove Smart Folder'),
    category: t('category', 'Eagle'),
    icon: 'FolderMinus',
    description: t('action.smart_folder_remove.description', 'Delete a smart folder and all its children. Requires Eagle 4.0 Build 22+.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Smart Folder ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing smart folder id.') }
      await eaglePost(ctx, args, 'smartFolder/remove', { id: args.id })
      return { success: true, message: t('message.smartFolderRemoved', 'Smart folder removed.') }
    },
  },

  {
    name: 'eagle_smart_folder_get_items',
    label: t('action.smart_folder_items.label', 'Eagle Get Smart Folder Items'),
    category: t('category', 'Eagle'),
    icon: 'Images',
    description: t('action.smart_folder_items.description', 'Get items matching a smart folder filter conditions. Requires Eagle 4.0 Build 22+.'),
    properties: [
      { key: 'smartFolderId', label: t('field.smartFolderId.label', 'Smart Folder ID'), type: 'text', dataType: 'string', required: true },
      { key: 'orderBy', label: t('field.orderBy.label', 'Order By'), type: 'text', dataType: 'string' },
      { key: 'fields', label: t('field.fields.label', 'Return Fields'), type: 'text', dataType: 'string', tooltip: t('field.fields.tooltip', 'Comma-separated fields.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'items', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.smartFolderId) return { success: false, message: t('message.missingSmartFolderId', 'Missing smartFolderId.') }
      const body = { smartFolderId: args.smartFolderId }
      if (args.orderBy) body.orderBy = args.orderBy
      if (args.fields) body.fields = String(args.fields).split(',').map((s) => s.trim()).filter(Boolean)
      const items = await eaglePost(ctx, args, 'smartFolder/getItems', body)
      const list = Array.isArray(items) ? items : (items && items.data) || []
      return {
        success: true,
        message: t('message.itemsFound', 'Found {count} items.').replace('{count}', list.length),
        data: { items: list },
      }
    },
  },
]
