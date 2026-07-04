// Obsidian Local REST API actions
// 端点参考: https://coddingtonbear.github.io/obsidian-local-rest-api/
// 鉴权: Authorization: Bearer <apiKey>；自签名 HTTPS（默认）或 HTTP

const { obsidianRequest, configProperties, asArray } = require('./shared')

const commonOutputs = [
  { key: 'success', type: 'boolean', dataType: 'boolean' },
  { key: 'message', type: 'string' },
]

/**
 * 把 vault 路径编码为 URL 片段（保留 / 分隔符）。
 * 例如 "日记/2024 笔记.md" -> "%E6%97%A5%E8%AE%B0/2024%20%E7%AC%94%E8%AE%B0.md"
 */
function encodeVaultPath(p) {
  return String(p || '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

/**
 * 列出 /vault/ 端点期望的路径前缀。
 * list 必须以 / 结尾表示目录。
 */
function ensureTrailingSlash(p) {
  const s = String(p || '').trim()
  if (!s) return ''
  return /\/$/.test(s) ? s : s + '/'
}

const TARGET_TYPES = ['heading', 'block', 'frontmatter']
const OPERATIONS = ['append', 'prepend', 'replace']

module.exports = (t) => [
  // ────────────────────────────── 状态 ──────────────────────────────
  {
    name: 'obsidian_status',
    label: t('action.status.label', 'Obsidian Status'),
    category: t('category', 'Obsidian'),
    icon: 'Activity',
    description: t('action.status.description', 'Check whether the Obsidian Local REST API server is running and the API key is valid.'),
    properties: [],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [] },
    ],
    run: async (ctx, args) => {
      const data = await obsidianRequest(ctx, args, 'GET', '')
      return {
        success: true,
        message: t('message.statusOk', 'Obsidian server is reachable.'),
        data: data || { ok: true },
      }
    },
  },

  // ────────────────────────────── Vault 列表 ──────────────────────────────
  {
    name: 'obsidian_vault_list',
    label: t('action.vaultList.label', 'Obsidian List Files'),
    category: t('category', 'Obsidian'),
    icon: 'FolderOpen',
    description: t('action.vaultList.description', 'List files and subdirectories inside a vault directory. Leave path empty to list the vault root.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'Directory Path'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.path.list.tooltip', 'Vault directory to list, e.g. "notes/" or "notes/projects/". Empty for vault root.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'files', type: 'string[]', dataType: 'string[]' },
        ],
      },
    ],
    run: async (ctx, args) => {
      const dir = ensureTrailingSlash(args.path)
      const pathPart = `vault/${encodeVaultPath(dir)}`
      const data = await obsidianRequest(ctx, args, 'GET', pathPart)
      const files = Array.isArray(data && data.files) ? data.files : []
      return {
        success: true,
        message: t('message.listCount', 'Found {count} entries.').replace('{count}', files.length),
        data: { files },
      }
    },
  },

  // ────────────────────────────── Vault 读取 ──────────────────────────────
  {
    name: 'obsidian_vault_read',
    label: t('action.vaultRead.label', 'Obsidian Read Note'),
    category: t('category', 'Obsidian'),
    icon: 'FileText',
    description: t('action.vaultRead.description', 'Read a note or file from the vault. Optionally read only a specific heading, block reference, or frontmatter field.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.read.tooltip', 'Vault path of the file, e.g. "notes/idea.md".'),
      },
      {
        key: 'targetType',
        label: t('field.targetType.label', 'Target Type'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.targetType.none', '(whole file)'), value: '' },
          { label: 'heading', value: 'heading' },
          { label: 'block', value: 'block' },
          { label: 'frontmatter', value: 'frontmatter' },
        ],
        enum: ['', ...TARGET_TYPES],
        tooltip: t('field.targetType.read.tooltip', 'Read only a specific heading/block/frontmatter field. Leave empty to read the whole file.'),
      },
      {
        key: 'target',
        label: t('field.target.label', 'Target'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.target.read.tooltip', 'Heading name, block reference id, or frontmatter key. Nested headings use "::" e.g. "Work::Meetings".'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'content', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      const pathPart = `vault/${encodeVaultPath(args.path)}`
      const headers = {}
      if (args.targetType && args.target) {
        headers['Target-Type'] = args.targetType
        headers['Target'] = args.target
      }
      const content = await obsidianRequest(ctx, args, 'GET', pathPart, { headers })
      return {
        success: true,
        message: t('message.read', 'Read: {path}').replace('{path}', args.path),
        data: { content: typeof content === 'string' ? content : JSON.stringify(content) },
      }
    },
  },

  // ────────────────────────────── Vault 写入（创建/覆盖）──────────────────────────────
  {
    name: 'obsidian_vault_write',
    label: t('action.vaultWrite.label', 'Obsidian Write Note'),
    category: t('category', 'Obsidian'),
    icon: 'FilePlus',
    description: t('action.vaultWrite.description', 'Create or overwrite a vault file. Overwrites the whole file by default; with a target, replaces only that section.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.write.tooltip', 'Vault path of the file, e.g. "notes/idea.md". Non-existent directories are created automatically.'),
      },
      {
        key: 'content',
        label: t('field.content.label', 'Content'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.content.write.tooltip', 'Plain text content of the note.'),
      },
      {
        key: 'targetType',
        label: t('field.targetType.label', 'Target Type'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.targetType.none', '(whole file)'), value: '' },
          { label: 'heading', value: 'heading' },
          { label: 'block', value: 'block' },
          { label: 'frontmatter', value: 'frontmatter' },
        ],
        enum: ['', ...TARGET_TYPES],
        tooltip: t('field.targetType.write.tooltip', 'When set with a target, only that section is replaced (PUT behavior).'),
      },
      {
        key: 'target',
        label: t('field.target.label', 'Target'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.target.write.tooltip', 'Heading name, block reference id, or frontmatter key.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      if (args.content === undefined || args.content === null) {
        return { success: false, message: t('message.missingContent', 'Missing content.') }
      }
      const pathPart = `vault/${encodeVaultPath(args.path)}`
      const headers = { 'Content-Type': 'text/plain' }
      if (args.targetType && args.target) {
        headers['Target-Type'] = args.targetType
        headers['Target'] = args.target
      }
      await obsidianRequest(ctx, args, 'PUT', pathPart, { body: args.content, headers, rawBody: true })
      return {
        success: true,
        message: t('message.written', 'Written: {path}').replace('{path}', args.path),
      }
    },
  },

  // ────────────────────────────── Vault 追加 ──────────────────────────────
  {
    name: 'obsidian_vault_append',
    label: t('action.vaultAppend.label', 'Obsidian Append Note'),
    category: t('category', 'Obsidian'),
    icon: 'FilePlus2',
    description: t('action.vaultAppend.description', 'Append content to a note. Defaults to appending to the end of the file; with a target, appends inside a specific heading/block.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.write.tooltip', 'Vault path of the file, e.g. "notes/idea.md".'),
      },
      {
        key: 'content',
        label: t('field.content.label', 'Content'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.content.append.tooltip', 'Text to append.'),
      },
      {
        key: 'targetType',
        label: t('field.targetType.label', 'Target Type'),
        type: 'select',
        dataType: 'string',
        options: [
          { label: t('field.targetType.none', '(end of file)'), value: '' },
          { label: 'heading', value: 'heading' },
          { label: 'block', value: 'block' },
        ],
        enum: ['', 'heading', 'block'],
        tooltip: t('field.targetType.append.tooltip', 'When set with a target, content is appended inside that section (POST behavior).'),
      },
      {
        key: 'target',
        label: t('field.target.label', 'Target'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.target.append.tooltip', 'Heading name or block reference id.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      if (args.content === undefined || args.content === null) {
        return { success: false, message: t('message.missingContent', 'Missing content.') }
      }
      const pathPart = `vault/${encodeVaultPath(args.path)}`
      const headers = { 'Content-Type': 'text/plain' }
      if (args.targetType && args.target) {
        headers['Target-Type'] = args.targetType
        headers['Target'] = args.target
      }
      await obsidianRequest(ctx, args, 'POST', pathPart, { body: args.content, headers, rawBody: true })
      return {
        success: true,
        message: t('message.appended', 'Appended to: {path}').replace('{path}', args.path),
      }
    },
  },

  // ────────────────────────────── Vault 补丁 ──────────────────────────────
  {
    name: 'obsidian_vault_patch',
    label: t('action.vaultPatch.label', 'Obsidian Patch Note'),
    category: t('category', 'Obsidian'),
    icon: 'Scissors',
    description: t('action.vaultPatch.description', 'Surgically patch a specific section: append, prepend, or replace a heading, block reference, or frontmatter field without touching the rest of the file.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.write.tooltip', 'Vault path of the file.'),
      },
      {
        key: 'operation',
        label: t('field.operation.label', 'Operation'),
        type: 'select',
        dataType: 'string',
        required: true,
        default: 'append',
        options: [
          { label: 'append', value: 'append' },
          { label: 'prepend', value: 'prepend' },
          { label: 'replace', value: 'replace' },
        ],
        enum: OPERATIONS,
        tooltip: t('field.operation.tooltip', 'append = add after the section, prepend = add before, replace = overwrite the section.'),
      },
      {
        key: 'targetType',
        label: t('field.targetType.label', 'Target Type'),
        type: 'select',
        dataType: 'string',
        required: true,
        default: 'heading',
        options: [
          { label: 'heading', value: 'heading' },
          { label: 'block', value: 'block' },
          { label: 'frontmatter', value: 'frontmatter' },
        ],
        enum: TARGET_TYPES,
        tooltip: t('field.targetType.patch.tooltip', 'heading / block / frontmatter.'),
      },
      {
        key: 'target',
        label: t('field.target.label', 'Target'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.target.patch.tooltip', 'Heading name, block reference id, or frontmatter key.'),
      },
      {
        key: 'content',
        label: t('field.content.label', 'Content'),
        type: 'textarea',
        dataType: 'string',
        required: true,
        tooltip: t('field.content.patch.tooltip', 'For frontmatter replace, set contentType=application/json and pass a JSON value, e.g. "done" or 42.'),
      },
      {
        key: 'contentType',
        label: t('field.contentType.label', 'Content-Type'),
        type: 'select',
        dataType: 'string',
        default: 'text/plain',
        options: [
          { label: 'text/plain', value: 'text/plain' },
          { label: 'application/json', value: 'application/json' },
        ],
        enum: ['text/plain', 'application/json'],
        tooltip: t('field.contentType.tooltip', 'Use application/json when replacing a frontmatter field with a typed JSON value.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      if (!args.operation || !args.targetType || !args.target) {
        return { success: false, message: t('message.missingPatchTarget', 'Missing operation/targetType/target.') }
      }
      const pathPart = `vault/${encodeVaultPath(args.path)}`
      const headers = {
        Operation: args.operation,
        'Target-Type': args.targetType,
        Target: args.target,
        'Content-Type': args.contentType || 'text/plain',
      }
      await obsidianRequest(ctx, args, 'PATCH', pathPart, {
        body: args.content === undefined ? '' : args.content,
        headers,
        rawBody: true,
      })
      return {
        success: true,
        message: t('message.patched', 'Patched {op} {tt}:{target} in {path}')
          .replace('{op}', args.operation)
          .replace('{tt}', args.targetType)
          .replace('{target}', args.target)
          .replace('{path}', args.path),
      }
    },
  },

  // ────────────────────────────── Vault 删除 ──────────────────────────────
  {
    name: 'obsidian_vault_delete',
    label: t('action.vaultDelete.label', 'Obsidian Delete Note'),
    category: t('category', 'Obsidian'),
    icon: 'Trash2',
    description: t('action.vaultDelete.description', 'Delete a file from the vault.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.delete.tooltip', 'Vault path of the file to delete.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      const pathPart = `vault/${encodeVaultPath(args.path)}`
      await obsidianRequest(ctx, args, 'DELETE', pathPart)
      return {
        success: true,
        message: t('message.deleted', 'Deleted: {path}').replace('{path}', args.path),
      }
    },
  },

  // ────────────────────────────── 简单搜索 ──────────────────────────────
  {
    name: 'obsidian_search_simple',
    label: t('action.searchSimple.label', 'Obsidian Search'),
    category: t('category', 'Obsidian'),
    icon: 'Search',
    description: t('action.searchSimple.description', 'Full-text search across the whole vault using Obsidian\'s built-in fuzzy search. Returns matching filenames with scored context snippets.'),
    properties: [
      {
        key: 'query',
        label: t('field.query.label', 'Query'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.query.search.tooltip', 'Search terms.'),
      },
      {
        key: 'contextLength',
        label: t('field.contextLength.label', 'Context Length'),
        type: 'number',
        dataType: 'number',
        tooltip: t('field.contextLength.tooltip', 'Length of the context snippet around each match.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'results', type: 'object[]', dataType: 'object[]' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.query) return { success: false, message: t('message.missingQuery', 'Missing query.') }
      const query = {}
      if (args.contextLength) query.contextLength = args.contextLength
      const data = await obsidianRequest(ctx, args, 'POST', 'search/simple/', { body: '', query, rawBody: true })
      const results = Array.isArray(data) ? data : (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Found {count} results.').replace('{count}', results.length),
        data: { results },
      }
    },
  },

  // ────────────────────────────── JsonLogic 搜索 ──────────────────────────────
  {
    name: 'obsidian_search_query',
    label: t('action.searchQuery.label', 'Obsidian JsonLogic Search'),
    category: t('category', 'Obsidian'),
    icon: 'Filter',
    description: t('action.searchQuery.description', 'Structured search via JsonLogic against note metadata (frontmatter, tags, path, content).'),
    tool: false,
    properties: [
      {
        key: 'query',
        label: t('field.jsonLogic.label', 'JsonLogic Query'),
        type: 'code',
        dataType: 'string',
        required: true,
        tooltip: t('field.jsonLogic.tooltip', 'A JsonLogic expression. Example: {"==":[{"var":"file.frontmatter.status"},"done"]}'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'results', type: 'object[]', dataType: 'object[]' },
        ],
      },
    ],
    run: async (ctx, args) => {
      if (!args.query) return { success: false, message: t('message.missingQuery', 'Missing query.') }
      let queryObj
      try {
        queryObj = typeof args.query === 'string' ? JSON.parse(args.query) : args.query
      } catch {
        return { success: false, message: t('message.invalidJsonLogic', 'Invalid JsonLogic JSON.') }
      }
      const data = await obsidianRequest(ctx, args, 'POST', 'search/', {
        body: queryObj,
        headers: { 'Content-Type': 'application/vnd.olrapi.jsonlogic+json' },
      })
      const results = Array.isArray(data) ? data : (data && data.results) || []
      return {
        success: true,
        message: t('message.searchResults', 'Found {count} results.').replace('{count}', results.length),
        data: { results },
      }
    },
  },

  // ────────────────────────────── 命令列表 ──────────────────────────────
  {
    name: 'obsidian_command_list',
    label: t('action.commandList.label', 'Obsidian List Commands'),
    category: t('category', 'Obsidian'),
    icon: 'List',
    description: t('action.commandList.description', 'List all registered Obsidian commands (the same list shown in the command palette).'),
    properties: [],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [{ key: 'commands', type: 'object[]', dataType: 'object[]' }],
      },
    ],
    run: async (ctx, args) => {
      const data = await obsidianRequest(ctx, args, 'GET', 'commands/')
      const commands = Array.isArray(data && data.commands) ? data.commands : (Array.isArray(data) ? data : [])
      return {
        success: true,
        message: t('message.commandsCount', 'Found {count} commands.').replace('{count}', commands.length),
        data: { commands },
      }
    },
  },

  // ────────────────────────────── 执行命令 ──────────────────────────────
  {
    name: 'obsidian_command_execute',
    label: t('action.commandExecute.label', 'Obsidian Execute Command'),
    category: t('category', 'Obsidian'),
    icon: 'Terminal',
    description: t('action.commandExecute.description', 'Execute an Obsidian command by its id, as if triggered from the command palette.'),
    properties: [
      {
        key: 'commandId',
        label: t('field.commandId.label', 'Command ID'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.commandId.tooltip', 'Obsidian command id, e.g. "app:toggle-left-sidebar". Use "List Commands" to discover ids.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.commandId) return { success: false, message: t('message.missingCommandId', 'Missing commandId.') }
      const pathPart = `commands/${encodeURIComponent(args.commandId)}/`
      await obsidianRequest(ctx, args, 'POST', pathPart)
      return {
        success: true,
        message: t('message.commandExecuted', 'Executed command: {id}').replace('{id}', args.commandId),
      }
    },
  },

  // ────────────────────────────── 标签列表 ──────────────────────────────
  {
    name: 'obsidian_tags_list',
    label: t('action.tagsList.label', 'Obsidian List Tags'),
    category: t('category', 'Obsidian'),
    icon: 'Tags',
    description: t('action.tagsList.description', 'List all tags used across the vault, with usage counts.'),
    properties: [],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [{ key: 'tags', type: 'object[]', dataType: 'object[]' }],
      },
    ],
    run: async (ctx, args) => {
      const data = await obsidianRequest(ctx, args, 'GET', 'tags/')
      const tags = Array.isArray(data && data.tags) ? data.tags : (Array.isArray(data) ? data : [])
      return {
        success: true,
        message: t('message.tagsCount', 'Found {count} tags.').replace('{count}', tags.length),
        data: { tags },
      }
    },
  },

  // ────────────────────────────── 打开文件 ──────────────────────────────
  {
    name: 'obsidian_open_file',
    label: t('action.openFile.label', 'Obsidian Open File'),
    category: t('category', 'Obsidian'),
    icon: 'ExternalLink',
    description: t('action.openFile.description', 'Open a note in the Obsidian UI.'),
    properties: [
      {
        key: 'path',
        label: t('field.path.label', 'File Path'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.path.open.tooltip', 'Vault path of the file to open in Obsidian.'),
      },
    ],
    configProperties: configProperties(t),
    outputs: commonOutputs,
    run: async (ctx, args) => {
      if (!args.path) return { success: false, message: t('message.missingPath', 'Missing path.') }
      const pathPart = `open/${encodeVaultPath(args.path)}`
      await obsidianRequest(ctx, args, 'POST', pathPart)
      return {
        success: true,
        message: t('message.opened', 'Opened: {path}').replace('{path}', args.path),
      }
    },
  },

  // ────────────────────────────── 活动文件 ──────────────────────────────
  {
    name: 'obsidian_active_file',
    label: t('action.activeFile.label', 'Obsidian Active File'),
    category: t('category', 'Obsidian'),
    icon: 'Eye',
    description: t('action.activeFile.description', 'Get the vault path of the note currently open in Obsidian.'),
    properties: [],
    configProperties: configProperties(t),
    outputs: [
      ...commonOutputs,
      { key: 'data', type: 'object', dataType: 'object', children: [{ key: 'path', type: 'string' }] },
    ],
    run: async (ctx, args) => {
      const data = await obsidianRequest(ctx, args, 'GET', 'active/')
      // 返回体为纯文本文件路径
      const path = typeof data === 'string' ? data.trim() : (data && (data.path || data['active-file'])) || ''
      return {
        success: true,
        message: t('message.activeFile', 'Active file: {path}').replace('{path}', path || '(none)'),
        data: { path },
      }
    },
  },
]
