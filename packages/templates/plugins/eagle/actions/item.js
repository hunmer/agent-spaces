// Eagle Item 模块 - 条目查询、全文搜索、添加、更新、缩略图、标注
// 文档: docs/item.md
const { eagleGet, eaglePost, configProperties, asArray, asObject } = require('../shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

module.exports = (t) => [
  // ---------- 查询 ----------
  {
    name: 'eagle_item_list',
    label: t('action.item_list.label', 'Eagle List Items'),
    category: t('category', 'Eagle'),
    icon: 'Image',
    description: t('action.item_list.description', 'List Eagle library items with filters. Returns paginated results.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', tooltip: t('field.id.tooltip', 'Return a single item by ID.') },
      { key: 'ids', label: t('field.ids.label', 'Item IDs'), type: 'textarea', dataType: 'string[]', tooltip: t('field.ids.tooltip', 'JSON array or comma-separated item IDs.') },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', tooltip: t('field.tags.tooltip', 'Filter by tag names.') },
      { key: 'folders', label: t('field.folders.label', 'Folder IDs'), type: 'textarea', dataType: 'string[]', tooltip: t('field.folders.tooltip', 'Filter by folder IDs.') },
      { key: 'ext', label: t('field.ext.label', 'Extension'), type: 'text', dataType: 'string', tooltip: t('field.ext.tooltip', 'Filter by file extension, e.g. jpg, png.') },
      { key: 'keywords', label: t('field.keywords.label', 'Keywords'), type: 'text', dataType: 'string', tooltip: t('field.keywords.tooltip', 'Filter by keywords (comma-separated).') },
      { key: 'rating', label: t('field.rating.label', 'Rating'), type: 'number', dataType: 'number', tooltip: t('field.rating.tooltip', 'Filter by star rating 0-5.') },
      { key: 'isUntagged', label: t('field.isUntagged.label', 'Untagged Only'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.isUntagged.tooltip', 'Return items without tags.') },
      { key: 'isUnfiled', label: t('field.isUnfiled.label', 'Unfiled Only'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.isUnfiled.tooltip', 'Return items not in any folder.') },
      { key: 'fields', label: t('field.fields.label', 'Return Fields'), type: 'text', dataType: 'string', tooltip: t('field.fields.tooltip', 'Comma-separated fields to return (performance).') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50, tooltip: t('field.limit.tooltip', 'Max 1000.') },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'items', type: 'object', dataType: 'object', children: [] },
          { key: 'total', type: 'number', dataType: 'number' },
          { key: 'offset', type: 'number', dataType: 'number' },
          { key: 'limit', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const body = {}
      if (args.id) body.id = args.id
      const ids = asArray(args.ids)
      if (ids.length) body.ids = ids
      const tags = asArray(args.tags)
      if (tags.length) body.tags = tags
      const folders = asArray(args.folders)
      if (folders.length) body.folders = folders
      if (args.ext) body.ext = args.ext
      if (args.keywords) body.keywords = args.keywords
      if (args.rating !== undefined && args.rating !== '') body.rating = Number(args.rating)
      if (args.isUntagged) body.isUntagged = true
      if (args.isUnfiled) body.isUnfiled = true
      if (args.fields) body.fields = String(args.fields).split(',').map((s) => s.trim()).filter(Boolean)
      if (args.limit !== undefined && args.limit !== '') body.limit = Number(args.limit)
      if (args.offset !== undefined && args.offset !== '') body.offset = Number(args.offset)

      const data = await eaglePost(ctx, args, 'item/get', body)
      const items = (data && data.data) || []
      return {
        success: true,
        message: t('message.itemsFound', 'Found {count} items (total {total}).')
          .replace('{count}', items.length)
          .replace('{total}', (data && data.total) || items.length),
        data: { items, total: data.total, offset: data.offset, limit: data.limit },
      }
    },
  },

  {
    name: 'eagle_item_query',
    label: t('action.item_query.label', 'Eagle Full-text Search'),
    category: t('category', 'Eagle'),
    icon: 'Search',
    description: t('action.item_query.description', 'Full-text search across item name, tags, annotation, URL, etc. Supports AND/OR/NOT and phrases.'),
    properties: [
      { key: 'query', label: t('field.query.label', 'Query'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.query.tooltip', 'e.g. (cat OR dog) -cartoon. Use quotes for phrases.') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'items', type: 'object', dataType: 'object', children: [] },
          { key: 'total', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.query) return { success: false, message: t('message.missingQuery', 'Missing query.') }
      const body = { query: args.query }
      if (args.limit !== undefined && args.limit !== '') body.limit = Number(args.limit)
      if (args.offset !== undefined && args.offset !== '') body.offset = Number(args.offset)
      const data = await eaglePost(ctx, args, 'item/query', body)
      const items = (data && data.data) || []
      return {
        success: true,
        message: t('message.searchResults', 'Search returned {count} items.').replace('{count}', items.length),
        data: { items, total: data.total },
      }
    },
  },

  {
    name: 'eagle_item_count',
    label: t('action.item_count.label', 'Eagle Count Items'),
    category: t('category', 'Eagle'),
    icon: 'Hash',
    description: t('action.item_count.description', 'Return the total number of items in the library.'),
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'total', type: 'number', dataType: 'number' }] },
    ],
    run: async (ctx, args) => {
      const total = await eagleGet(ctx, args, 'item/countAll')
      return {
        success: true,
        message: t('message.totalItems', 'Total items: {total}').replace('{total}', total),
        data: { total },
      }
    },
  },

  // ---------- 添加 ----------
  {
    name: 'eagle_item_add',
    label: t('action.item_add.label', 'Eagle Add Item'),
    category: t('category', 'Eagle'),
    icon: 'Plus',
    description: t('action.item_add.description', 'Add items to Eagle from URL / local path / base64 / bookmark. Supports single or batch (items array).'),
    properties: [
      { key: 'url', label: t('field.url.label', 'Image URL'), type: 'text', dataType: 'string', tooltip: t('field.url.tooltip', 'Image URL to download.') },
      { key: 'path', label: t('field.path.label', 'Local File Path'), type: 'text', dataType: 'string', tooltip: t('field.path.tooltip', 'Local file path to import.') },
      { key: 'base64', label: t('field.base64.label', 'Base64'), type: 'textarea', dataType: 'string', tooltip: t('field.base64.tooltip', 'Base64-encoded image data.') },
      { key: 'bookmarkURL', label: t('field.bookmarkURL.label', 'Bookmark URL'), type: 'text', dataType: 'string', tooltip: t('field.bookmarkURL.tooltip', 'URL to add as a bookmark.') },
      { key: 'items', label: t('field.items.label', 'Items (Batch)'), type: 'textarea', dataType: 'object[]', tooltip: t('field.items.tooltip', 'JSON array to batch add (max 1000). Overrides single fields.') },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string' },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', tooltip: t('field.tags.add.tooltip', 'Tags to assign.') },
      { key: 'folders', label: t('field.folders.label', 'Folder IDs'), type: 'textarea', dataType: 'string[]' },
      { key: 'annotation', label: t('field.annotation.label', 'Annotation'), type: 'textarea', dataType: 'string' },
      { key: 'website', label: t('field.website.label', 'Source Website'), type: 'text', dataType: 'string' },
    ],
    toolProperties: [
      { key: 'url', label: t('field.url.label', 'Image URL'), type: 'text' },
      { key: 'path', label: t('field.path.label', 'Local File Path'), type: 'text' },
      { key: 'base64', label: t('field.base64.label', 'Base64'), type: 'textarea' },
      { key: 'bookmarkURL', label: t('field.bookmarkURL.label', 'Bookmark URL'), type: 'text' },
      { key: 'items', label: t('field.items.label', 'Items (Batch)'), type: 'textarea', tooltip: t('field.items.tooltip', 'JSON array to batch add (max 1000).') },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text' },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea' },
      { key: 'folders', label: t('field.folders.label', 'Folder IDs'), type: 'textarea' },
      { key: 'annotation', label: t('field.annotation.label', 'Annotation'), type: 'textarea' },
      { key: 'website', label: t('field.website.label', 'Source Website'), type: 'text' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'id', type: 'string' },
          { key: 'ids', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      const body = {}
      const items = asArray(args.items)
      if (items.length) {
        body.items = items
      } else {
        if (args.url) body.url = args.url
        else if (args.path) body.path = args.path
        else if (args.base64) body.base64 = args.base64
        else if (args.bookmarkURL) body.bookmarkURL = args.bookmarkURL
        else return { success: false, message: t('message.needSource', 'Provide url, path, base64, bookmarkURL or items.') }
        if (args.name) body.name = args.name
        const tags = asArray(args.tags)
        if (tags.length) body.tags = tags
        const folders = asArray(args.folders)
        if (folders.length) body.folders = folders
        if (args.annotation) body.annotation = args.annotation
        if (args.website) body.website = args.website
      }
      const data = await eaglePost(ctx, args, 'item/add', body)
      if (data && Array.isArray(data.ids)) {
        return {
          success: true,
          message: t('message.batchAdded', 'Batch added {count} items.').replace('{count}', data.ids.length),
          data: { ids: data.ids },
        }
      }
      return {
        success: true,
        message: t('message.itemAdded', 'Item added: {id}').replace('{id}', (data && data.id) || ''),
        data: { id: data && data.id },
      }
    },
  },

  // ---------- 更新 ----------
  {
    name: 'eagle_item_update',
    label: t('action.item_update.label', 'Eagle Update Item'),
    category: t('category', 'Eagle'),
    icon: 'Edit',
    description: t('action.item_update.description', 'Update item metadata: name, tags, folders, annotation, star, etc. Only provided fields are modified.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string' },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', tooltip: t('field.tags.replace.tooltip', 'Replaces existing tags.') },
      { key: 'folders', label: t('field.folders.label', 'Folder IDs'), type: 'textarea', dataType: 'string[]', tooltip: t('field.folders.replace.tooltip', 'Replaces folder membership.') },
      { key: 'annotation', label: t('field.annotation.label', 'Annotation'), type: 'textarea', dataType: 'string' },
      { key: 'url', label: t('field.url.label', 'Source URL'), type: 'text', dataType: 'string' },
      { key: 'star', label: t('field.star.label', 'Star'), type: 'number', dataType: 'number', tooltip: t('field.star.tooltip', 'Rating 0-5.') },
      { key: 'isDeleted', label: t('field.isDeleted.label', 'Move to Trash'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.isDeleted.tooltip', 'true to trash, false to restore.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing item id.') }
      const body = { id: args.id }
      if (args.name) body.name = args.name
      const tags = asArray(args.tags)
      if (tags.length) body.tags = tags
      const folders = asArray(args.folders)
      if (folders.length) body.folders = folders
      if (args.annotation !== undefined) body.annotation = args.annotation
      if (args.url) body.url = args.url
      if (args.star !== undefined && args.star !== '') body.star = Number(args.star)
      if (args.isDeleted !== undefined) body.isDeleted = !!args.isDeleted
      const data = await eaglePost(ctx, args, 'item/update', body)
      return {
        success: true,
        message: t('message.itemUpdated', 'Item updated: {id}').replace('{id}', args.id),
        data,
      }
    },
  },

  // ---------- 缩略图（workflow 专用，降低 tool schema 噪音） ----------
  {
    name: 'eagle_item_set_thumbnail',
    label: t('action.item_set_thumbnail.label', 'Eagle Set Custom Thumbnail'),
    category: t('category', 'Eagle'),
    icon: 'Image',
    description: t('action.item_set_thumbnail.description', 'Set a custom thumbnail for an item from a local image file.'),
    tool: false,
    properties: [
      { key: 'itemId', label: t('field.itemId.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
      { key: 'filePath', label: t('field.filePath.label', 'Thumbnail Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.filePath.tooltip', 'Local image file path for the thumbnail.') },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.itemId || !args.filePath) return { success: false, message: t('message.needItemIdAndPath', 'Missing itemId or filePath.') }
      await eaglePost(ctx, args, 'item/setCustomThumbnail', { itemId: args.itemId, filePath: args.filePath })
      return { success: true, message: t('message.thumbnailSet', 'Custom thumbnail set.') }
    },
  },

  {
    name: 'eagle_item_refresh_thumbnail',
    label: t('action.item_refresh_thumbnail.label', 'Eagle Refresh Thumbnail'),
    category: t('category', 'Eagle'),
    icon: 'RefreshCw',
    description: t('action.item_refresh_thumbnail.description', 'Regenerate an item thumbnail and update size, dimensions, and color info.'),
    tool: false,
    properties: [
      { key: 'itemId', label: t('field.itemId.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.itemId) return { success: false, message: t('message.missingItemId', 'Missing itemId.') }
      await eaglePost(ctx, args, 'item/refreshThumbnail', { itemId: args.itemId })
      return { success: true, message: t('message.thumbnailRefreshed', 'Thumbnail refreshed.') }
    },
  },

  // ---------- 标注 Comments (Build 22+, workflow 专用) ----------
  {
    name: 'eagle_item_get_comments',
    label: t('action.item_get_comments.label', 'Eagle Get Comments'),
    category: t('category', 'Eagle'),
    icon: 'MessageSquare',
    description: t('action.item_get_comments.description', 'Get all annotations (image region / video timeline) of an item. Requires Eagle 4.0 Build 22+.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'comments', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing item id.') }
      const comments = await eagleGet(ctx, args, 'item/getComments', { id: args.id })
      return {
        success: true,
        message: t('message.commentsLoaded', 'Loaded {count} comments.').replace('{count}', Array.isArray(comments) ? comments.length : 0),
        data: { comments: comments || [] },
      }
    },
  },

  {
    name: 'eagle_item_add_comment',
    label: t('action.item_add_comment.label', 'Eagle Add Comment'),
    category: t('category', 'Eagle'),
    icon: 'MessageSquarePlus',
    description: t('action.item_add_comment.description', 'Add an annotation to an item. Image: provide x/y/width/height; Video: provide duration. Requires Eagle 4.0 Build 22+.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
      { key: 'annotation', label: t('field.annotation.label', 'Annotation'), type: 'textarea', dataType: 'string' },
      { key: 'x', label: 'X', type: 'number', dataType: 'number', tooltip: t('field.imageComment.tooltip', 'Image region X.') },
      { key: 'y', label: 'Y', type: 'number', dataType: 'number' },
      { key: 'width', label: 'Width', type: 'number', dataType: 'number' },
      { key: 'height', label: 'Height', type: 'number', dataType: 'number' },
      { key: 'duration', label: t('field.duration.label', 'Duration (s)'), type: 'number', dataType: 'number', tooltip: t('field.duration.tooltip', 'Video timeline timestamp in seconds.') },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing item id.') }
      const body = { id: args.id }
      if (args.annotation) body.annotation = args.annotation
      const hasImage = args.x !== undefined && args.y !== undefined && args.width !== undefined && args.height !== undefined
      const hasVideo = args.duration !== undefined && args.duration !== ''
      if (hasImage && hasVideo) {
        return { success: false, message: t('message.commentTypeConflict', 'Provide image (x/y/width/height) OR video (duration), not both.') }
      }
      if (!hasImage && !hasVideo) {
        return { success: false, message: t('message.commentTypeMissing', 'Provide image rect (x/y/width/height) or video duration.') }
      }
      if (hasImage) {
        body.x = Number(args.x); body.y = Number(args.y); body.width = Number(args.width); body.height = Number(args.height)
      }
      if (hasVideo) body.duration = Number(args.duration)
      await eaglePost(ctx, args, 'item/addComment', body)
      return { success: true, message: t('message.commentAdded', 'Comment added.') }
    },
  },

  {
    name: 'eagle_item_update_comment',
    label: t('action.item_update_comment.label', 'Eagle Update Comment'),
    category: t('category', 'Eagle'),
    icon: 'MessageSquare',
    description: t('action.item_update_comment.description', 'Update an existing annotation. Only provided fields change. Requires Eagle 4.0 Build 22+.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
      { key: 'commentId', label: t('field.commentId.label', 'Comment ID'), type: 'text', dataType: 'string', required: true },
      { key: 'annotation', label: t('field.annotation.label', 'Annotation'), type: 'textarea', dataType: 'string' },
      { key: 'x', label: 'X', type: 'number', dataType: 'number' },
      { key: 'y', label: 'Y', type: 'number', dataType: 'number' },
      { key: 'width', label: 'Width', type: 'number', dataType: 'number' },
      { key: 'height', label: 'Height', type: 'number', dataType: 'number' },
      { key: 'duration', label: t('field.duration.label', 'Duration (s)'), type: 'number', dataType: 'number' },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.id || !args.commentId) return { success: false, message: t('message.needIdAndCommentId', 'Missing id or commentId.') }
      const body = { id: args.id, commentId: args.commentId }
      if (args.annotation !== undefined) body.annotation = args.annotation
      for (const k of ['x', 'y', 'width', 'height', 'duration']) {
        if (args[k] !== undefined && args[k] !== '') body[k] = Number(args[k])
      }
      await eaglePost(ctx, args, 'item/updateComment', body)
      return { success: true, message: t('message.commentUpdated', 'Comment updated.') }
    },
  },

  {
    name: 'eagle_item_remove_comment',
    label: t('action.item_remove_comment.label', 'Eagle Remove Comment'),
    category: t('category', 'Eagle'),
    icon: 'MessageSquareMinus',
    description: t('action.item_remove_comment.description', 'Remove an annotation from an item. Requires Eagle 4.0 Build 22+.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Item ID'), type: 'text', dataType: 'string', required: true },
      { key: 'commentId', label: t('field.commentId.label', 'Comment ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.id || !args.commentId) return { success: false, message: t('message.needIdAndCommentId', 'Missing id or commentId.') }
      await eaglePost(ctx, args, 'item/removeComment', { id: args.id, commentId: args.commentId })
      return { success: true, message: t('message.commentRemoved', 'Comment removed.') }
    },
  },
]
