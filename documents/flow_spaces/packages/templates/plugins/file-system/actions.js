module.exports = (t) => [
  {
    name: 'write_text_file',
    label: t('action.write_text_file.label', 'Write Text File'),
    category: t('category', 'File Operations'),
    icon: 'FilePen',
    description: t('action.write_text_file.description', 'Write text content to a file (creates if not exists)'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target file path') },
      { key: 'content', label: t('field.content.label', 'File Content'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.content.tooltip', 'Text content to write') },
      { key: 'encoding', label: t('field.encoding.label', 'Encoding'), type: 'text', dataType: 'string', default: 'utf-8', tooltip: t('field.encoding.tooltip', 'File encoding, default utf-8') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.writeFile(args.path, args.content, args.encoding)
      return { success: true, message: t('message.fileWritten', 'File written: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'write_binary_file',
    label: t('action.write_binary_file.label', 'Write Binary File'),
    category: t('category', 'File Operations'),
    icon: 'Binary',
    description: t('action.write_binary_file.description', 'Write binary data to a file, suitable for images, audio, and other non-text files'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target file path') },
      { key: 'data', label: t('field.data.label', 'Binary Data'), type: 'buffer', dataType: 'string', required: true, tooltip: t('field.data.tooltip', 'Binary data to write') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.writeBinaryFile(args.path, args.data)
      return { success: true, message: t('message.binaryFileWritten', 'Binary file written: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'read_file',
    label: t('action.read_file.label', 'Read File'),
    category: t('category', 'File Operations'),
    icon: 'FileText',
    description: t('action.read_file.description', 'Read file content'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target file path') },
      { key: 'encoding', label: t('field.encoding.label', 'Encoding'), type: 'text', dataType: 'string', default: 'utf-8', tooltip: t('field.encoding_read.tooltip', 'File encoding') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'content', type: 'string' },
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const content = await ctx.api.readFile(args.path, args.encoding)
      return { success: true, message: t('message.fileRead', 'File read: {path}').replace('{path}', args.path), data: { content, path: args.path } }
    },
  },
  {
    name: 'read_json',
    label: t('action.read_json.label', 'Read JSON File'),
    category: t('category', 'File Operations'),
    icon: 'Braces',
    description: t('action.read_json.description', 'Read and parse a JSON file into an object'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target JSON file path') },
      { key: 'encoding', label: t('field.encoding.label', 'Encoding'), type: 'text', dataType: 'string', default: 'utf-8', tooltip: t('field.encoding_read.tooltip', 'File encoding') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'json', type: 'any' },
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const content = await ctx.api.readFile(args.path, args.encoding)
      const json = JSON.parse(content)
      return { success: true, message: t('message.jsonRead', 'JSON read: {path}').replace('{path}', args.path), data: { json, path: args.path } }
    },
  },
  {
    name: 'write_json',
    label: t('action.write_json.label', 'Write JSON File'),
    category: t('category', 'File Operations'),
    icon: 'FileJson',
    description: t('action.write_json.description', 'Serialize an object to JSON and write it to a file (creates if not exists)'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target JSON file path') },
      { key: 'json', label: t('field.json.label', 'JSON Data'), type: 'json', dataType: 'object', required: true, tooltip: t('field.json.tooltip', 'Object to serialize to JSON') },
      { key: 'indent', label: t('field.indent.label', 'Indent'), type: 'number', dataType: 'number', default: 2, tooltip: t('field.indent.tooltip', 'Number of spaces for pretty-printing, 0 for compact') },
      { key: 'encoding', label: t('field.encoding.label', 'Encoding'), type: 'text', dataType: 'string', default: 'utf-8', tooltip: t('field.encoding.tooltip', 'File encoding, default utf-8') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const indent = Number(args.indent) >= 0 ? Number(args.indent) : 2
      const content = JSON.stringify(args.json, null, indent)
      await ctx.api.writeFile(args.path, content, args.encoding)
      return { success: true, message: t('message.jsonWritten', 'JSON written: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'edit_file',
    label: t('action.edit_file.label', 'Edit File'),
    category: t('category', 'File Operations'),
    icon: 'FileEdit',
    description: t('action.edit_file.description', 'Replace specified content in a file'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target file path') },
      { key: 'oldContent', label: t('field.oldContent.label', 'Old Content'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.oldContent.tooltip', 'Content to be replaced') },
      { key: 'newContent', label: t('field.newContent.label', 'New Content'), type: 'textarea', dataType: 'string', required: true, tooltip: t('field.newContent.tooltip', 'New content after replacement') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.editFile(args.path, args.oldContent, args.newContent)
      return { success: true, message: t('message.fileEdited', 'File edited: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'delete_file',
    label: t('action.delete_file.label', 'Delete File'),
    category: t('category', 'File Operations'),
    icon: 'Trash2',
    description: t('action.delete_file.description', 'Delete a specified file'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.file_path_delete.tooltip', 'File path to delete') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.deleteFile(args.path)
      return { success: true, message: t('message.fileDeleted', 'File deleted: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'list_files',
    label: t('action.list_files.label', 'List Files'),
    category: t('category', 'File Operations'),
    icon: 'FolderSearch',
    description: t('action.list_files.description', 'List files and subdirectories in a directory'),
    properties: [
      { key: 'path', label: t('field.dir_path.label', 'Directory Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.dir_path.tooltip', 'Target directory path') },
      { key: 'recursive', label: t('field.recursive.label', 'Recursive'), type: 'boolean', dataType: 'boolean', default: false, tooltip: t('field.recursive.tooltip', 'Whether to recursively list subdirectories') },
      { key: 'pattern', label: t('field.pattern.label', 'Pattern'), type: 'text', dataType: 'string', tooltip: t('field.pattern.tooltip', 'File name pattern, e.g. *.txt') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'files', type: 'object', dataType: 'object', children: [
          { key: 'name', type: 'string' },
          { key: 'path', type: 'string' },
          { key: 'type', type: 'string' },
        ] },
      ] },
    ],
    run: async (ctx, args) => {
      const files = await ctx.api.listFiles(args.path, { recursive: args.recursive, pattern: args.pattern })
      return { success: true, message: t('message.listCount', '{count} entries found').replace('{count}', files.length), data: { files } }
    },
  },
  {
    name: 'create_dir',
    label: t('action.create_dir.label', 'Create Directory'),
    category: t('category_dir', 'Directory Operations'),
    icon: 'FolderPlus',
    description: t('action.create_dir.description', 'Create a directory (supports recursive creation)'),
    properties: [
      { key: 'path', label: t('field.dir_path.label', 'Directory Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.dir_path_create.tooltip', 'Directory path to create') },
      { key: 'recursive', label: t('field.recursive_create.label', 'Recursive Create'), type: 'boolean', dataType: 'boolean', default: true, tooltip: t('field.recursive_create.tooltip', 'Whether to recursively create parent directories') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.createDir(args.path, { recursive: args.recursive })
      return { success: true, message: t('message.dirCreated', 'Directory created: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'remove_dir',
    label: t('action.remove_dir.label', 'Remove Directory'),
    category: t('category_dir', 'Directory Operations'),
    icon: 'FolderX',
    description: t('action.remove_dir.description', 'Remove a directory'),
    properties: [
      { key: 'path', label: t('field.dir_path.label', 'Directory Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.dir_path_delete.tooltip', 'Directory path to remove') },
      { key: 'recursive', label: t('field.recursive_delete.label', 'Recursive Delete'), type: 'boolean', dataType: 'boolean', default: false, tooltip: t('field.recursive_delete.tooltip', 'Whether to recursively delete all contents') },
      { key: 'force', label: t('field.force.label', 'Force Delete'), type: 'boolean', dataType: 'boolean', default: false, tooltip: t('field.force.tooltip', 'Do not error if directory does not exist') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.removeDir(args.path, { recursive: args.recursive, force: args.force })
      return { success: true, message: t('message.dirDeleted', 'Directory removed: {path}').replace('{path}', args.path), data: { path: args.path } }
    },
  },
  {
    name: 'file_stat',
    label: t('action.file_stat.label', 'File Info'),
    category: t('category', 'File Operations'),
    icon: 'Info',
    description: t('action.file_stat.description', 'Get detailed information about a file or directory'),
    properties: [
      { key: 'path', label: t('field.stat_path.label', 'Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.stat_path.tooltip', 'File or directory path') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'isFile', type: 'boolean', dataType: 'boolean' },
        { key: 'isDirectory', type: 'boolean', dataType: 'boolean' },
        { key: 'size', type: 'number', dataType: 'number' },
        { key: 'createdAt', type: 'string' },
        { key: 'modifiedAt', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const stat = await ctx.api.stat(args.path)
      return { success: true, message: t('message.statRetrieved', 'File info retrieved'), data: stat }
    },
  },
  {
    name: 'rename_file',
    label: t('action.rename_file.label', 'Rename'),
    category: t('category', 'File Operations'),
    icon: 'PenLine',
    description: t('action.rename_file.description', 'Rename or move a file/directory'),
    properties: [
      { key: 'oldPath', label: t('field.oldPath.label', 'Old Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.oldPath.tooltip', 'Original file/directory path') },
      { key: 'newPath', label: t('field.newPath.label', 'New Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.newPath.tooltip', 'New file/directory path') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'oldPath', type: 'string' },
        { key: 'newPath', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.rename(args.oldPath, args.newPath)
      return { success: true, message: t('message.renamed', 'Renamed: {oldPath} -> {newPath}').replace('{oldPath}', args.oldPath).replace('{newPath}', args.newPath), data: { oldPath: args.oldPath, newPath: args.newPath } }
    },
  },
  {
    name: 'copy_file',
    label: t('action.copy_file.label', 'Copy File'),
    category: t('category', 'File Operations'),
    icon: 'Copy',
    description: t('action.copy_file.description', 'Copy a file to a new path'),
    properties: [
      { key: 'src', label: t('field.src.label', 'Source Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.src.tooltip', 'Source file path') },
      { key: 'dest', label: t('field.dest.label', 'Destination Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.dest.tooltip', 'Destination file path') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'src', type: 'string' },
        { key: 'dest', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      await ctx.api.copyFile(args.src, args.dest)
      return { success: true, message: t('message.fileCopied', 'File copied: {src} -> {dest}').replace('{src}', args.src).replace('{dest}', args.dest), data: { src: args.src, dest: args.dest } }
    },
  },
  {
    name: 'get_file_hash',
    label: t('action.get_file_hash.label', 'Get File Hash'),
    category: t('category', 'File Operations'),
    icon: 'Fingerprint',
    description: t('action.get_file_hash.description', 'Compute a hash/checksum of a file (md5, sha1, sha256, sha512) as its unique identifier'),
    properties: [
      { key: 'path', label: t('field.path.label', 'File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.path.tooltip', 'Target file path') },
      { key: 'algorithm', label: t('field.algorithm.label', 'Algorithm'), type: 'select', dataType: 'string', default: 'sha256', options: [
        { label: 'MD5', value: 'md5' },
        { label: 'SHA-1', value: 'sha1' },
        { label: 'SHA-256', value: 'sha256' },
        { label: 'SHA-512', value: 'sha512' },
      ], tooltip: t('field.algorithm.tooltip', 'Hash algorithm') },
      { key: 'encoding', label: t('field.hash_encoding.label', 'Digest Encoding'), type: 'select', dataType: 'string', default: 'hex', options: [
        { label: 'Hex', value: 'hex' },
        { label: 'Base64', value: 'base64' },
      ], tooltip: t('field.hash_encoding.tooltip', 'Output digest encoding format') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'hash', type: 'string' },
        { key: 'algorithm', type: 'string' },
        { key: 'encoding', type: 'string' },
        { key: 'path', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const crypto = require('node:crypto')
      const fs = require('node:fs')
      const algorithm = String(args.algorithm || 'sha256').toLowerCase()
      const encoding = String(args.encoding || 'hex').toLowerCase()
      const hash = crypto.createHash(algorithm)
      await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(args.path)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', resolve)
        stream.on('error', reject)
      })
      const digest = hash.digest(encoding)
      return { success: true, message: t('message.fileHashComputed', 'Hash computed ({algorithm}): {hash}').replace('{algorithm}', algorithm).replace('{hash}', digest), data: { hash: digest, algorithm, encoding, path: args.path } }
    },
  },
]
