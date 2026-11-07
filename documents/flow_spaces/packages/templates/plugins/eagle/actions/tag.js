// Eagle Tag + Tag Group 模块
// 文档: docs/tag.md, docs/tag-group.md
const { eagleGet, eaglePost, configProperties, asArray } = require('../shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

module.exports = (t) => [
  // ==================== Tag ====================
  {
    name: 'eagle_tag_list',
    label: t('action.tag_list.label', 'Eagle List Tags'),
    category: t('category', 'Eagle'),
    icon: 'Tag',
    description: t('action.tag_list.description', 'List tags in the library, optionally filtered by name substring. Returns paginated results.'),
    properties: [
      { key: 'name', label: t('field.name.label', 'Name Filter'), type: 'text', dataType: 'string', tooltip: t('field.tagName.tooltip', 'Substring match.') },
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data', type: 'object', dataType: 'object',
        children: [
          { key: 'tags', type: 'object', dataType: 'object', children: [] },
          { key: 'total', type: 'number', dataType: 'number' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const body = {}
      if (args.name) body.name = args.name
      if (args.limit !== undefined && args.limit !== '') body.limit = Number(args.limit)
      if (args.offset !== undefined && args.offset !== '') body.offset = Number(args.offset)
      const data = await eaglePost(ctx, args, 'tag/get', body)
      const tags = (data && data.data) || []
      return {
        success: true,
        message: t('message.tagsFound', 'Found {count} tags.').replace('{count}', tags.length),
        data: { tags, total: data.total },
      }
    },
  },

  {
    name: 'eagle_tag_recent',
    label: t('action.tag_recent.label', 'Eagle Recent Tags'),
    category: t('category', 'Eagle'),
    icon: 'History',
    description: t('action.tag_recent.description', 'Get recently used tags.'),
    tool: false,
    properties: [
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'tags', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const data = await eagleGet(ctx, args, 'tag/getRecentTags', {
        limit: args.limit, offset: args.offset,
      })
      const tags = (data && data.data) || []
      return {
        success: true,
        message: t('message.tagsFound', 'Found {count} tags.').replace('{count}', tags.length),
        data: { tags },
      }
    },
  },

  {
    name: 'eagle_tag_starred',
    label: t('action.tag_starred.label', 'Eagle Starred Tags'),
    category: t('category', 'Eagle'),
    icon: 'Star',
    description: t('action.tag_starred.description', 'Get starred (pinned) tags.'),
    tool: false,
    properties: [
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'tags', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const data = await eagleGet(ctx, args, 'tag/getStarredTags', {
        limit: args.limit, offset: args.offset,
      })
      const tags = (data && data.data) || []
      return {
        success: true,
        message: t('message.tagsFound', 'Found {count} tags.').replace('{count}', tags.length),
        data: { tags },
      }
    },
  },

  {
    name: 'eagle_tag_rename',
    label: t('action.tag_rename.label', 'Eagle Rename Tag'),
    category: t('category', 'Eagle'),
    icon: 'Edit',
    description: t('action.tag_rename.description', 'Rename a tag. All items using it are updated automatically.'),
    properties: [
      { key: 'originalName', label: t('field.originalName.label', 'Original Name'), type: 'text', dataType: 'string', required: true },
      { key: 'name', label: t('field.newName.label', 'New Name'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.originalName || !args.name) return { success: false, message: t('message.needOriginalAndNewName', 'Missing originalName or name.') }
      const tag = await eaglePost(ctx, args, 'tag/update', { originalName: args.originalName, name: args.name })
      return {
        success: true,
        message: t('message.tagRenamed', 'Tag renamed: {old} -> {new}').replace('{old}', args.originalName).replace('{new}', args.name),
        data: tag,
      }
    },
  },

  {
    name: 'eagle_tag_merge',
    label: t('action.tag_merge.label', 'Eagle Merge Tags'),
    category: t('category', 'Eagle'),
    icon: 'GitMerge',
    description: t('action.tag_merge.description', 'Merge the source tag into the target tag. The source tag is removed afterwards.'),
    properties: [
      { key: 'source', label: t('field.source.label', 'Source Tag'), type: 'text', dataType: 'string', required: true, tooltip: t('field.source.tooltip', 'Tag to be removed.') },
      { key: 'target', label: t('field.target.label', 'Target Tag'), type: 'text', dataType: 'string', required: true, tooltip: t('field.target.tooltip', 'Tag to keep.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'affectedItems', type: 'number', dataType: 'number' }] },
    ],
    run: async (ctx, args) => {
      if (!args.source || !args.target) return { success: false, message: t('message.needSourceAndTarget', 'Missing source or target.') }
      const data = await eaglePost(ctx, args, 'tag/merge', { source: args.source, target: args.target })
      return {
        success: true,
        message: t('message.tagMerged', 'Merged "{source}" into "{target}" ({count} items affected).')
          .replace('{source}', args.source).replace('{target}', args.target).replace('{count}', (data && data.affectedItems) || 0),
        data,
      }
    },
  },

  // ==================== Tag Group ====================
  {
    name: 'eagle_tag_group_list',
    label: t('action.tag_group_list.label', 'Eagle List Tag Groups'),
    category: t('category', 'Eagle'),
    icon: 'Tags',
    description: t('action.tag_group_list.description', 'List all tag groups. Returns paginated results.'),
    properties: [
      { key: 'limit', label: t('field.limit.label', 'Limit'), type: 'number', dataType: 'number', default: 50 },
      { key: 'offset', label: t('field.offset.label', 'Offset'), type: 'number', dataType: 'number', default: 0 },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'groups', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      const data = await eagleGet(ctx, args, 'tagGroup/get', {
        limit: args.limit, offset: args.offset,
      })
      const groups = (data && data.data) || []
      return {
        success: true,
        message: t('message.tagGroupsFound', 'Found {count} tag groups.').replace('{count}', groups.length),
        data: { groups },
      }
    },
  },

  {
    name: 'eagle_tag_group_create',
    label: t('action.tag_group_create.label', 'Eagle Create Tag Group'),
    category: t('category', 'Eagle'),
    icon: 'FolderPlus',
    description: t('action.tag_group_create.description', 'Create a new tag group with tags.'),
    properties: [
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string', required: true },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.tags.list.tooltip', 'Tag names to include.') },
      { key: 'color', label: t('field.color.label', 'Color'), type: 'text', dataType: 'string' },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'id', type: 'string' }, { key: 'group', type: 'object', dataType: 'object', children: [] }] },
    ],
    run: async (ctx, args) => {
      if (!args.name) return { success: false, message: t('message.missingName', 'Missing name.') }
      const tags = asArray(args.tags)
      if (!tags.length) return { success: false, message: t('message.missingTags', 'Missing tags.') }
      const body = { name: args.name, tags }
      if (args.color) body.color = args.color
      if (args.description) body.description = args.description
      const group = await eaglePost(ctx, args, 'tagGroup/create', body)
      return {
        success: true,
        message: t('message.tagGroupCreated', 'Tag group created: {id}').replace('{id}', (group && group.id) || ''),
        data: { id: group && group.id, group },
      }
    },
  },

  {
    name: 'eagle_tag_group_update',
    label: t('action.tag_group_update.label', 'Eagle Update Tag Group'),
    category: t('category', 'Eagle'),
    icon: 'Tags',
    description: t('action.tag_group_update.description', 'Update a tag group. tags replaces the existing tag list.'),
    properties: [
      { key: 'id', label: t('field.id.label', 'Group ID'), type: 'text', dataType: 'string', required: true },
      { key: 'name', label: t('field.name.label', 'Name'), type: 'text', dataType: 'string', required: true },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', required: true, tooltip: t('field.tags.replace.tooltip', 'Replaces existing tags.') },
      { key: 'color', label: t('field.color.label', 'Color'), type: 'text', dataType: 'string' },
      { key: 'description', label: t('field.description.label', 'Description'), type: 'textarea', dataType: 'string' },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.id || !args.name) return { success: false, message: t('message.needIdAndName', 'Missing id or name.') }
      const tags = asArray(args.tags)
      if (!tags.length) return { success: false, message: t('message.missingTags', 'Missing tags.') }
      const body = { id: args.id, name: args.name, tags }
      if (args.color) body.color = args.color
      if (args.description) body.description = args.description
      const group = await eaglePost(ctx, args, 'tagGroup/update', body)
      return {
        success: true,
        message: t('message.tagGroupUpdated', 'Tag group updated: {id}').replace('{id}', args.id),
        data: group,
      }
    },
  },

  {
    name: 'eagle_tag_group_remove',
    label: t('action.tag_group_remove.label', 'Eagle Remove Tag Group'),
    category: t('category', 'Eagle'),
    icon: 'Trash2',
    description: t('action.tag_group_remove.description', 'Delete a tag group. Tags inside are NOT deleted, only the group.'),
    tool: false,
    properties: [
      { key: 'id', label: t('field.id.label', 'Group ID'), type: 'text', dataType: 'string', required: true },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.id) return { success: false, message: t('message.missingId', 'Missing group id.') }
      await eaglePost(ctx, args, 'tagGroup/remove', { id: args.id })
      return { success: true, message: t('message.tagGroupRemoved', 'Tag group removed.') }
    },
  },

  {
    name: 'eagle_tag_group_add_tags',
    label: t('action.tag_group_add_tags.label', 'Eagle Add Tags To Group'),
    category: t('category', 'Eagle'),
    icon: 'Tag',
    description: t('action.tag_group_add_tags.description', 'Add tags to a tag group. Optionally remove them from their current group first.'),
    properties: [
      { key: 'groupId', label: t('field.groupId.label', 'Group ID'), type: 'text', dataType: 'string', required: true },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', required: true },
      { key: 'removeFromSource', label: t('field.removeFromSource.label', 'Remove From Source'), type: 'checkbox', dataType: 'boolean', default: false, tooltip: t('field.removeFromSource.tooltip', 'Remove tags from their current group first.') },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.groupId) return { success: false, message: t('message.missingGroupId', 'Missing groupId.') }
      const tags = asArray(args.tags)
      if (!tags.length) return { success: false, message: t('message.missingTags', 'Missing tags.') }
      const body = { groupId: args.groupId, tags }
      if (args.removeFromSource) body.removeFromSource = true
      const group = await eaglePost(ctx, args, 'tagGroup/addTags', body)
      return {
        success: true,
        message: t('message.tagsAddedToGroup', 'Added {count} tags to group.').replace('{count}', tags.length),
        data: group,
      }
    },
  },

  {
    name: 'eagle_tag_group_remove_tags',
    label: t('action.tag_group_remove_tags.label', 'Eagle Remove Tags From Group'),
    category: t('category', 'Eagle'),
    icon: 'Tag',
    description: t('action.tag_group_remove_tags.description', 'Remove tags from a tag group. Tags themselves are not deleted.'),
    properties: [
      { key: 'groupId', label: t('field.groupId.label', 'Group ID'), type: 'text', dataType: 'string', required: true },
      { key: 'tags', label: t('field.tags.label', 'Tags'), type: 'textarea', dataType: 'string[]', required: true },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      if (!args.groupId) return { success: false, message: t('message.missingGroupId', 'Missing groupId.') }
      const tags = asArray(args.tags)
      if (!tags.length) return { success: false, message: t('message.missingTags', 'Missing tags.') }
      const group = await eaglePost(ctx, args, 'tagGroup/removeTags', { groupId: args.groupId, tags })
      return {
        success: true,
        message: t('message.tagsRemovedFromGroup', 'Removed {count} tags from group.').replace('{count}', tags.length),
        data: group,
      }
    },
  },
]
