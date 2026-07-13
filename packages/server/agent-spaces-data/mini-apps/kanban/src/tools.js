export default [
  {
    name: 'get_board',
    description: '读取完整看板数据，包括标题、布局、列和任务。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'write_board',
    description: '覆盖保存完整看板数据。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        layoutMode: { type: 'string', enum: ['horizontal', 'vertical'] },
        columns: { type: 'array' },
        tasks: { type: 'array' },
      },
      required: ['columns', 'tasks'],
    },
  },
];
