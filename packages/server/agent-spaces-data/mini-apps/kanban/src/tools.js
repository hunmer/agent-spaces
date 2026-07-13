export default [
  {
    name: 'get_board',
    description: '读取完整看板数据（含标题、布局模式、所有列和卡片）。用户提到「看板」「我的任务清单」或需要在多个列/卡片间操作前，先调用此工具掌握全貌。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_columns',
    description: '只读取列列表（不含卡片）。需要查看分区结构、确认列 id 或列标题时使用。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_column',
    description: '新建一列（分区）。返回新建列对象（含生成的 id）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '列标题，1-25 字符，不能与已有列重复。' },
        color: { type: 'string', enum: ['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'], description: '主题色，缺省 sky。' },
      },
      required: ['title'],
    },
  },
  {
    name: 'rename_column',
    description: '重命名已存在的列。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '列 id，来自 list_columns 或 get_board。' },
        title: { type: 'string', description: '新标题，1-25 字符。' },
      },
      required: ['id', 'title'],
    },
  },
  {
    name: 'delete_column',
    description: '删除一列。默认当列非空时拒绝删除以防丢失卡片；如确认要连同卡片一起删除，传 force=true。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '列 id。' },
        force: { type: 'boolean', description: '是否强制删除非空列及其下卡片，默认 false。' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_cards',
    description: '读取卡片列表。不传 columnId 返回全部卡片；传 columnId 只返回该列下卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        columnId: { type: 'string', description: '可选；指定则只返回该列的卡片。' },
      },
    },
  },
  {
    name: 'get_card',
    description: '按 id 读取单张卡片的详细信息。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '卡片 id。' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_card',
    description: '在指定列下新建一张卡片。返回新建卡片对象（含生成的 id）。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '卡片标题，1-200 字符。' },
        columnId: { type: 'string', description: '所属列 id，必须已存在。' },
        description: { type: 'string', description: '详细描述，可选。' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: '优先级，缺省 medium。' },
        dueDate: { type: 'string', description: '截止日期（YYYY-MM-DD），可选。' },
      },
      required: ['title', 'columnId'],
    },
  },
  {
    name: 'update_card',
    description: '更新卡片字段（只更新传入的字段）。不传的字段保持不变。改变 columnId 等价于移动卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '卡片 id。' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string' },
        columnId: { type: 'string', description: '若要同时换列可在此传入新列 id。' },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_card',
    description: '把卡片从当前列移动到另一列（不改内容）。若只需改变其他字段请用 update_card。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '卡片 id。' },
        toColumnId: { type: 'string', description: '目标列 id。' },
      },
      required: ['id', 'toColumnId'],
    },
  },
  {
    name: 'delete_card',
    description: '按 id 删除单张卡片。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '卡片 id。' },
      },
      required: ['id'],
    },
  },
];
