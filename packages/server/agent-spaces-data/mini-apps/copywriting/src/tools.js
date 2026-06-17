export default [
  {
    name: 'query_copywriting_knowledge_base',
    description: '查询文案库内置知识库。用户提出任何问答、总结、提炼、查找、归纳类问题时，必须先调用此工具获取相关文案资料，再基于返回内容回答。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '用户问题或用于检索知识库的关键词。应保留用户问题的核心对象、场景和约束。',
        },
        topK: {
          type: 'number',
          description: '返回的最多结果数，默认 5，最大 10。',
        },
      },
      required: ['query'],
    },
  },
];
