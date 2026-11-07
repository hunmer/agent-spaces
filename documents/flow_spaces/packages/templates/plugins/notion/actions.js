// Notion 插件动作定义
// 涵盖：搜索、页面 CRUD（创建/获取/更新/移动/归档）、数据库 CRUD（创建/更新/查询）、块/属性辅助
// 文档: https://developers.notion.com/reference/intro
const {
  notionGet,
  notionPost,
  notionPatch,
  notionDelete,
  configProperties,
  asArray,
  asObject,
  MOVE_PAGE_MIN_VERSION,
} = require('./shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

module.exports = (t) => [
  // ==================== Search ====================
  {
    name: 'notion_search',
    label: t('action.search.label', 'Notion Search'),
    category: t('category', 'Notion'),
    icon: 'Search',
    description: t('action.search.description', 'Search all pages and databases the integration can access. Filter by type, sort, and query text.'),
    properties: [
      { key: 'query', label: t('field.query.label', 'Query'), type: 'text', dataType: 'string', tooltip: t('field.query.search.tooltip', 'Text to search in titles.') },
      {
        key: 'filterType',
        label: t('field.filterType.label', 'Filter Type'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.filterType.all', 'All'), value: '' },
          { label: t('field.filterType.page', 'Page'), value: 'page' },
          { label: t('field.filterType.database', 'Database'), value: 'database' },
        ],
        default: '',
        tooltip: t('field.filterType.tooltip', 'Restrict results to page or database.'),
      },
      {
        key: 'sortDirection',
        label: t('field.sortDirection.label', 'Sort Direction'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.sortDirection.ascending', 'Ascending'), value: 'ascending' },
          { label: t('field.sortDirection.descending', 'Descending'), value: 'descending' },
        ],
        default: 'descending',
      },
      {
        key: 'sortTimestamp',
        label: t('field.sortTimestamp.label', 'Sort Timestamp'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: 'last_edited_time', value: 'last_edited_time' },
          { label: 'created_time', value: 'created_time' },
        ],
        default: 'last_edited_time',
      },
      { key: 'startCursor', label: t('field.startCursor.label', 'Start Cursor'), type: 'text', dataType: 'string', tooltip: t('field.startCursor.tooltip', 'Pagination cursor from a previous next_cursor.') },
      { key: 'pageSize', label: t('field.pageSize.label', 'Page Size'), type: 'number', dataType: 'number', default: 10, tooltip: t('field.pageSize.tooltip', 'Max 100.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'results', type: 'object', dataType: 'object', children: [] },
          { key: 'next_cursor', type: 'string' },
          { key: 'has_more', type: 'boolean', dataType: 'boolean' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const body = {}
      if (args.query) body.query = String(args.query)
      const filterType = asObject(args.filterType) || (args.filterType ? { property: 'object', value: args.filterType } : undefined)
      if (filterType && filterType.value) body.filter = filterType
      const sortDir = args.sortDirection || 'descending'
      const sortTs = args.sortTimestamp || 'last_edited_time'
      body.sort = { direction: sortDir, timestamp: sortTs }
      if (args.startCursor) body.start_cursor = args.startCursor
      if (args.pageSize !== undefined && args.pageSize !== '') body.page_size = Number(args.pageSize)

      const data = await notionPost(ctx, args, 'search', body)
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Found {count} results.').replace('{count}', results.length),
        data: { results, next_cursor: data.next_cursor, has_more: data.has_more },
      }
    },
  },

  // ==================== Page ====================
  {
    name: 'notion_page_create',
    label: t('action.page_create.label', 'Notion Create Page'),
    category: t('category', 'Notion'),
    icon: 'FilePlus',
    description: t('action.page_create.description', 'Create a page. parent must be a page_id or database_id. For database parent, properties must match the DB schema; for page parent, title is auto-built from title.'),
    properties: [
      {
        key: 'parentType',
        label: t('field.parentType.label', 'Parent Type'),
        type: 'select',
        dataType: 'string',
        required: true,
        options: [
          { label: 'page_id', value: 'page_id' },
          { label: 'database_id', value: 'database_id' },
        ],
        default: 'page_id',
      },
      { key: 'parentId', label: t('field.parentId.label', 'Parent ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.parentId.tooltip', 'The page or database ID to create under.') },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', dataType: 'string', tooltip: t('field.title.tooltip', 'Page title. For database parent this sets the title property named "Name".') },
      { key: 'properties', label: t('field.properties.label', 'Properties (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.properties.tooltip', 'Full properties object per Notion schema. For database parent overrides title field. Example: {"Status":{"select":{"name":"Done"}}}') },
      { key: 'children', label: t('field.children.label', 'Children Blocks (JSON)'), type: 'textarea', dataType: 'object[]', tooltip: t('field.children.tooltip', 'JSON array of block objects for the page body. Example: [{"object":"block","type":"paragraph","paragraph":{"rich_text":[{"type":"text","text":{"content":"Hello"}}]}}]') },
      { key: 'icon', label: t('field.icon.label', 'Icon (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.icon.tooltip', 'Icon object, e.g. {"type":"emoji","emoji":"🚀"} or {"type":"external","external":{"url":"https://..."}}') },
      { key: 'cover', label: t('field.cover.label', 'Cover (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.cover.tooltip', 'Cover image object, e.g. {"type":"external","external":{"url":"https://..."}}') },
    ],
    toolProperties: [
      { key: 'parentType', label: t('field.parentType.label', 'Parent Type'), type: 'select' },
      { key: 'parentId', label: t('field.parentId.label', 'Parent ID'), type: 'text' },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text' },
      { key: 'properties', label: t('field.properties.label', 'Properties (JSON)'), type: 'textarea', tooltip: t('field.properties.tooltip', 'Full properties object per Notion schema.') },
      { key: 'children', label: t('field.children.label', 'Children Blocks (JSON)'), type: 'textarea', tooltip: t('field.children.tooltip', 'JSON array of block objects.') },
      { key: 'icon', label: t('field.icon.label', 'Icon (JSON)'), type: 'textarea' },
      { key: 'cover', label: t('field.cover.label', 'Cover (JSON)'), type: 'textarea' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'url', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.parentId) return { success: false, message: t('message.missingParentId', 'Missing parentId.') }
      const parentType = args.parentType === 'database_id' ? 'database_id' : 'page_id'
      const body = { parent: { [parentType]: args.parentId } }

      const properties = asObject(args.properties)
      if (properties && typeof properties === 'object') {
        body.properties = properties
      } else if (args.title) {
        // 页面父级：title 属性；数据库父级：默认 "Name" 属性
        const titleKey = parentType === 'database_id' ? 'Name' : 'title'
        body.properties = {
          [titleKey]: { title: [{ text: { content: String(args.title) } }] },
        }
      }

      const children = asArray(args.children)
      if (children.length) body.children = children

      const icon = asObject(args.icon)
      if (icon) body.icon = icon
      const cover = asObject(args.cover)
      if (cover) body.cover = cover

      const data = await notionPost(ctx, args, 'pages', body)
      return {
        success: true,
        message: t('message.pageCreated', 'Page created: {id}').replace('{id}', data.id),
        data: { id: data.id, url: data.url },
      }
    },
  },

  {
    name: 'notion_page_get',
    label: t('action.page_get.label', 'Notion Get Page'),
    category: t('category', 'Notion'),
    icon: 'FileText',
    description: t('action.page_get.description', 'Retrieve a page by ID, including all properties.'),
    properties: [
      { key: 'pageId', label: t('field.pageId.label', 'Page ID'), type: 'text', dataType: 'string', required: true },
      {
        key: 'filterProperties',
        label: t('field.filterProperties.label', 'Filter Properties'),
        type: 'textarea',
        dataType: 'string[]',
        tooltip: t('field.filterProperties.tooltip', 'JSON array or comma-separated property IDs/names to return (reduces payload).'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'url', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.pageId) return { success: false, message: t('message.missingPageId', 'Missing pageId.') }
      const query = {}
      const props = asArray(args.filterProperties)
      if (props.length) query.filter_properties = props
      const data = await notionGet(ctx, args, `pages/${args.pageId}`, query)
      return {
        success: true,
        message: t('message.pageRetrieved', 'Page retrieved: {id}').replace('{id}', data.id),
        data,
      }
    },
  },

  {
    name: 'notion_page_update',
    label: t('action.page_update.label', 'Notion Update Page'),
    category: t('category', 'Notion'),
    icon: 'FilePen',
    description: t('action.page_update.description', 'Update page properties, archived flag, icon, cover, or in Trash (archived=true). Only provided fields are modified.'),
    properties: [
      { key: 'pageId', label: t('field.pageId.label', 'Page ID'), type: 'text', dataType: 'string', required: true },
      { key: 'properties', label: t('field.properties.label', 'Properties (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.properties.update.tooltip', 'Properties to update. Example: {"Status":{"select":{"name":"Done"}}}') },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', dataType: 'string', tooltip: t('field.title.update.tooltip', 'Shortcut to update the title property (page parent) or "Name" (database parent).') },
      { key: 'icon', label: t('field.icon.label', 'Icon (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.icon.update.tooltip', 'Set icon, or pass {"clear":true} to remove.') },
      { key: 'cover', label: t('field.cover.label', 'Cover (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.cover.update.tooltip', 'Set cover, or pass {"clear":true} to remove.') },
      {
        key: 'archived',
        label: t('field.archived.label', 'Archived (Trash)'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.archived.keep', 'Keep as-is'), value: '' },
          { label: t('field.archived.archive', 'Archive (Trash)'), value: 'true' },
          { label: t('field.archived.restore', 'Restore'), value: 'false' },
        ],
        default: '',
        tooltip: t('field.archived.tooltip', 'Archive moves the page to Trash; restore brings it back.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.pageId) return { success: false, message: t('message.missingPageId', 'Missing pageId.') }
      const body = {}

      const properties = asObject(args.properties)
      if (properties) {
        body.properties = properties
      } else if (args.title) {
        body.properties = { title: { title: [{ text: { content: String(args.title) } }] } }
      }

      const icon = asObject(args.icon)
      if (icon) {
        body.icon = icon.clear ? null : icon
      }
      const cover = asObject(args.cover)
      if (cover) {
        body.cover = cover.clear ? null : cover
      }
      if (args.archived === 'true') body.archived = true
      else if (args.archived === 'false') body.archived = false

      const data = await notionPatch(ctx, args, `pages/${args.pageId}`, body)
      return {
        success: true,
        message: t('message.pageUpdated', 'Page updated: {id}').replace('{id}', data.id),
        data,
      }
    },
  },

  {
    name: 'notion_page_move',
    label: t('action.page_move.label', 'Notion Move Page'),
    category: t('category', 'Notion'),
    icon: 'FolderInput',
    description: t('action.page_move.description', 'Move a page to a new parent (page or workspace). Requires Notion-Version 2026-03-11 or later.'),
    properties: [
      { key: 'pageId', label: t('field.pageId.label', 'Page ID'), type: 'text', dataType: 'string', required: true },
      {
        key: 'parentType',
        label: t('field.parentType.label', 'Parent Type'),
        type: 'select',
        dataType: 'string',
        required: true,
        options: [
          { label: 'page_id', value: 'page_id' },
          { label: 'workspace', value: 'workspace' },
        ],
        default: 'page_id',
      },
      { key: 'parentId', label: t('field.parentId.label', 'Parent ID'), type: 'text', dataType: 'string', tooltip: t('field.parentId.move.tooltip', 'Target page ID. Leave empty when parent type is workspace.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'parent', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.pageId) return { success: false, message: t('message.missingPageId', 'Missing pageId.') }
      const parentType = args.parentType === 'workspace' ? 'workspace' : 'page_id'
      const parent = parentType === 'workspace' ? { type: 'workspace' } : { page_id: args.parentId }
      if (parentType === 'page_id' && !args.parentId) {
        return { success: false, message: t('message.missingParentId', 'Missing parentId.') }
      }
      const body = { parent }
      const data = await notionPatch(ctx, args, `pages/${args.pageId}`, body, { minVersion: MOVE_PAGE_MIN_VERSION })
      return {
        success: true,
        message: t('message.pageMoved', 'Page moved: {id}').replace('{id}', data.id),
        data: { id: data.id, parent: data.parent },
      }
    },
  },

  {
    name: 'notion_page_archive',
    label: t('action.page_archive.label', 'Notion Archive (Trash) Page'),
    category: t('category', 'Notion'),
    icon: 'Trash2',
    description: t('action.page_archive.description', 'Move a page to the Trash (archive=true) or restore it (archive=false).'),
    properties: [
      { key: 'pageId', label: t('field.pageId.label', 'Page ID'), type: 'text', dataType: 'string', required: true },
      {
        key: 'archive',
        label: t('field.archive.label', 'Action'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.archive.trash', 'Move to Trash'), value: 'true' },
          { label: t('field.archive.restore', 'Restore from Trash'), value: 'false' },
        ],
        default: 'true',
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'archived', type: 'boolean', dataType: 'boolean' }] },
    ],
    run: async (ctx, args) => {
      if (!args.pageId) return { success: false, message: t('message.missingPageId', 'Missing pageId.') }
      const archive = args.archive !== 'false'
      const data = await notionPatch(ctx, args, `pages/${args.pageId}`, { archived: archive })
      return {
        success: true,
        message: archive
          ? t('message.pageArchived', 'Page moved to Trash: {id}').replace('{id}', data.id)
          : t('message.pageRestored', 'Page restored: {id}').replace('{id}', data.id),
        data: { id: data.id, archived: data.archived },
      }
    },
  },

  // ==================== Database ====================
  {
    name: 'notion_database_create',
    label: t('action.database_create.label', 'Notion Create Database'),
    category: t('category', 'Notion'),
    icon: 'Database',
    description: t('action.database_create.description', 'Create a database as a subpage of a parent page. Requires title and at least one property schema.'),
    properties: [
      { key: 'parentId', label: t('field.parentId.label', 'Parent Page ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.parentId.db.tooltip', 'The page under which the database is created.') },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', dataType: 'string', required: true },
      {
        key: 'titleType',
        label: t('field.titleType.label', 'Title Type'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: 'plain text', value: 'text' },
          { label: 'emoji + text', value: 'emoji' },
        ],
        default: 'text',
        tool: false,
      },
      { key: 'icon', label: t('field.icon.label', 'Icon Emoji'), type: 'text', dataType: 'string', tooltip: t('field.icon.db.tooltip', 'Emoji for the database icon.') },
      { key: 'properties', label: t('field.properties.schema.label', 'Properties Schema (JSON)'), type: 'textarea', dataType: 'object', required: true, tooltip: t('field.properties.schema.tooltip', 'Schema object. Example: {"Tags":{"multi_select":{"options":[{"name":"A"}]}},"Done":{"checkbox":{}}}') },
      { key: 'isInline', label: t('field.isInline.label', 'Inline'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.isInline.tooltip', 'Create as an inline database.') },
    ],
    toolProperties: [
      { key: 'parentId', label: t('field.parentId.label', 'Parent Page ID'), type: 'text' },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text' },
      { key: 'icon', label: t('field.icon.label', 'Icon Emoji'), type: 'text' },
      { key: 'properties', label: t('field.properties.schema.label', 'Properties Schema (JSON)'), type: 'textarea' },
      { key: 'isInline', label: t('field.isInline.label', 'Inline'), type: 'checkbox' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'url', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.parentId) return { success: false, message: t('message.missingParentId', 'Missing parentId.') }
      if (!args.title) return { success: false, message: t('message.missingTitle', 'Missing title.') }
      const properties = asObject(args.properties)
      if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
        return { success: false, message: t('message.missingSchema', 'Missing or empty properties schema.') }
      }

      const body = {
        parent: { page_id: args.parentId },
        title: [{ text: { content: String(args.title) } }],
        properties,
      }
      if (args.icon) body.icon = { type: 'emoji', emoji: String(args.icon) }
      if (args.isInline) body.is_inline = true

      const data = await notionPost(ctx, args, 'databases', body)
      return {
        success: true,
        message: t('message.databaseCreated', 'Database created: {id}').replace('{id}', data.id),
        data: { id: data.id, url: data.url },
      }
    },
  },

  {
    name: 'notion_database_update',
    label: t('action.database_update.label', 'Notion Update Database'),
    category: t('category', 'Notion'),
    icon: 'DatabaseZap',
    description: t('action.database_update.description', 'Update database title, description, icon, or property schema. Only provided fields are modified.'),
    properties: [
      { key: 'databaseId', label: t('field.databaseId.label', 'Database ID'), type: 'text', dataType: 'string', required: true },
      { key: 'title', label: t('field.title.label', 'Title'), type: 'text', dataType: 'string', tooltip: t('field.title.db.update.tooltip', 'Replaces the database title.') },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string', tooltip: t('field.description.tooltip', 'Replaces the description (plain text).') },
      { key: 'icon', label: t('field.icon.label', 'Icon Emoji'), type: 'text', dataType: 'string', tooltip: t('field.icon.update.tooltip', 'Set emoji icon, or pass "null" to clear.') },
      { key: 'properties', label: t('field.properties.schema.update.label', 'Properties Schema (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.properties.schema.update.tooltip', 'Schema to add/update. Example: {"Priority":{"select":{"options":[{"name":"High"}]}}}') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.databaseId) return { success: false, message: t('message.missingDatabaseId', 'Missing databaseId.') }
      const body = {}
      if (args.title) body.title = [{ text: { content: String(args.title) } }]
      if (args.description !== undefined && args.description !== '') {
        body.description = [{ text: { content: String(args.description) } }]
      }
      if (args.icon !== undefined && args.icon !== '') {
        body.icon = args.icon === 'null' ? null : { type: 'emoji', emoji: String(args.icon) }
      }
      const properties = asObject(args.properties)
      if (properties) body.properties = properties

      const data = await notionPatch(ctx, args, `databases/${args.databaseId}`, body)
      return {
        success: true,
        message: t('message.databaseUpdated', 'Database updated: {id}').replace('{id}', data.id),
        data,
      }
    },
  },

  {
    name: 'notion_database_get',
    label: t('action.database_get.label', 'Notion Get Database'),
    category: t('category', 'Notion'),
    icon: 'Database',
    description: t('action.database_get.description', 'Retrieve a database object (schema, title, parent) by ID.'),
    properties: [
      { key: 'databaseId', label: t('field.databaseId.label', 'Database ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'title', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.databaseId) return { success: false, message: t('message.missingDatabaseId', 'Missing databaseId.') }
      const data = await notionGet(ctx, args, `databases/${args.databaseId}`)
      return {
        success: true,
        message: t('message.databaseRetrieved', 'Database retrieved: {id}').replace('{id}', data.id),
        data,
      }
    },
  },

  {
    name: 'notion_database_query',
    label: t('action.database_query.label', 'Notion Query Database'),
    category: t('category', 'Notion'),
    icon: 'DatabaseZap',
    description: t('action.database_query.description', 'Query a database for rows (pages). Supports filter, sort, and pagination.'),
    properties: [
      { key: 'databaseId', label: t('field.databaseId.label', 'Database ID'), type: 'text', dataType: 'string', required: true },
      { key: 'filter', label: t('field.filter.label', 'Filter (JSON)'), type: 'textarea', dataType: 'object', tooltip: t('field.filter.tooltip', 'Filter object. Example: {"property":"Status","select":{"equals":"Done"}}') },
      { key: 'sorts', label: t('field.sorts.label', 'Sorts (JSON)'), type: 'textarea', dataType: 'object[]', tooltip: t('field.sorts.tooltip', 'JSON array of sort objects.') },
      { key: 'startCursor', label: t('field.startCursor.label', 'Start Cursor'), type: 'text', dataType: 'string' },
      { key: 'pageSize', label: t('field.pageSize.label', 'Page Size'), type: 'number', dataType: 'number', default: 10, tooltip: t('field.pageSize.tooltip', 'Max 100.') },
    ],
    toolProperties: [
      { key: 'databaseId', label: t('field.databaseId.label', 'Database ID'), type: 'text' },
      { key: 'filter', label: t('field.filter.label', 'Filter (JSON)'), type: 'textarea' },
      { key: 'sorts', label: t('field.sorts.label', 'Sorts (JSON)'), type: 'textarea' },
      { key: 'startCursor', label: t('field.startCursor.label', 'Start Cursor'), type: 'text' },
      { key: 'pageSize', label: t('field.pageSize.label', 'Page Size'), type: 'number' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'results', type: 'object', dataType: 'object', children: [] },
          { key: 'next_cursor', type: 'string' },
          { key: 'has_more', type: 'boolean', dataType: 'boolean' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.databaseId) return { success: false, message: t('message.missingDatabaseId', 'Missing databaseId.') }
      const body = {}
      const filter = asObject(args.filter)
      if (filter) body.filter = filter
      const sorts = asArray(args.sorts)
      if (sorts.length) body.sorts = sorts
      if (args.startCursor) body.start_cursor = args.startCursor
      if (args.pageSize !== undefined && args.pageSize !== '') body.page_size = Number(args.pageSize)

      const data = await notionPost(ctx, args, `databases/${args.databaseId}/query`, body)
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.queryResults', 'Query returned {count} rows.').replace('{count}', results.length),
        data: { results, next_cursor: data.next_cursor, has_more: data.has_more },
      }
    },
  },

  // ==================== Block (children) ====================
  {
    name: 'notion_block_append_children',
    label: t('action.block_append_children.label', 'Notion Append Blocks'),
    category: t('category', 'Notion'),
    icon: 'ListPlus',
    description: t('action.block_append_children.description', 'Append block children to a page or block. Use to add content (paragraphs, headings, lists, etc.) to a page body.'),
    properties: [
      { key: 'blockId', label: t('field.blockId.label', 'Block/Page ID'), type: 'text', dataType: 'string', required: true, tooltip: t('field.blockId.tooltip', 'The page or block ID to append children to.') },
      { key: 'children', label: t('field.children.label', 'Children Blocks (JSON)'), type: 'textarea', dataType: 'object[]', required: true, tooltip: t('field.children.append.tooltip', 'JSON array of block objects. Example: [{"object":"block","type":"heading_2","heading_2":{"rich_text":[{"type":"text","text":{"content":"Section"}}]}}]') },
      { key: 'after', label: t('field.after.label', 'After Block ID'), type: 'text', dataType: 'string', tooltip: t('field.after.tooltip', 'Insert after this existing block ID.') },
    ],
    toolProperties: [
      { key: 'blockId', label: t('field.blockId.label', 'Block/Page ID'), type: 'text' },
      { key: 'children', label: t('field.children.label', 'Children Blocks (JSON)'), type: 'textarea' },
      { key: 'after', label: t('field.after.label', 'After Block ID'), type: 'text' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'results', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.blockId) return { success: false, message: t('message.missingBlockId', 'Missing blockId.') }
      const children = asArray(args.children)
      if (!children.length) return { success: false, message: t('message.missingChildren', 'Missing children blocks.') }
      const body = { children }
      if (args.after) body.after = args.after
      const data = await notionPatch(ctx, args, `blocks/${args.blockId}/children`, body)
      return {
        success: true,
        message: t('message.blocksAppended', 'Appended {count} blocks.').replace('{count}', (data.results || []).length),
        data,
      }
    },
  },

  {
    name: 'notion_block_get_children',
    label: t('action.block_get_children.label', 'Notion Get Block Children'),
    category: t('category', 'Notion'),
    icon: 'List',
    description: t('action.block_get_children.description', 'Retrieve the children blocks of a page or block. Useful to read a page body.'),
    properties: [
      { key: 'blockId', label: t('field.blockId.label', 'Block/Page ID'), type: 'text', dataType: 'string', required: true },
      { key: 'startCursor', label: t('field.startCursor.label', 'Start Cursor'), type: 'text', dataType: 'string' },
      { key: 'pageSize', label: t('field.pageSize.label', 'Page Size'), type: 'number', dataType: 'number', default: 100, tooltip: t('field.pageSize.tooltip', 'Max 100.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'results', type: 'object', dataType: 'object', children: [] },
          { key: 'next_cursor', type: 'string' },
          { key: 'has_more', type: 'boolean', dataType: 'boolean' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.blockId) return { success: false, message: t('message.missingBlockId', 'Missing blockId.') }
      const query = {}
      if (args.startCursor) query.start_cursor = args.startCursor
      if (args.pageSize !== undefined && args.pageSize !== '') query.page_size = Number(args.pageSize)
      const data = await notionGet(ctx, args, `blocks/${args.blockId}/children`, query)
      const results = (data && data.results) || []
      return {
        success: true,
        message: t('message.childrenLoaded', 'Loaded {count} blocks.').replace('{count}', results.length),
        data: { results, next_cursor: data.next_cursor, has_more: data.has_more },
      }
    },
  },

  {
    name: 'notion_block_delete',
    label: t('action.block_delete.label', 'Notion Delete Block'),
    category: t('category', 'Notion'),
    icon: 'Trash2',
    description: t('action.block_delete.description', 'Delete (archive) a block by ID. Works for any block type, including pages when using the page ID.'),
    properties: [
      { key: 'blockId', label: t('field.blockId.label', 'Block/Page ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'archived', type: 'boolean', dataType: 'boolean' }] },
    ],
    run: async (ctx, args) => {
      if (!args.blockId) return { success: false, message: t('message.missingBlockId', 'Missing blockId.') }
      const data = await notionDelete(ctx, args, `blocks/${args.blockId}`)
      return {
        success: true,
        message: t('message.blockDeleted', 'Block deleted: {id}').replace('{id}', data.id),
        data: { id: data.id, archived: data.archived },
      }
    },
  },

  // ==================== User (me) ====================
  {
    name: 'notion_me',
    label: t('action.me.label', 'Notion Me (Bot Info)'),
    category: t('category', 'Notion'),
    icon: 'Bot',
    description: t('action.me.description', 'Retrieve the integration bot user. Useful to verify the token is valid.'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'bot', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const data = await notionGet(ctx, args, 'users/me')
      return {
        success: true,
        message: t('message.me', 'Bot: {name}').replace('{name}', (data.bot && data.bot.owner && data.bot.owner.workspace) || 'ok'),
        data,
      }
    },
  },
]
