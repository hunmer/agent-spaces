const COPYWRITING_KB_ID = 'copywriting-fixed-knowledge-base';

function unwrap(result) {
  return result?.result || result;
}

function normalizeMatches(result) {
  const data = unwrap(result);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.matches)) return data.matches;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.documents)) return data.documents;
  return [];
}

export default {
  query_copywriting_knowledge_base: async (input, ctx) => {
    const query = String(input.query || '').trim();
    const topK = Number.isFinite(Number(input.topK)) ? Number(input.topK) : 5;

    if (!query) {
      return { ok: false, message: '问题不能为空，请提供 query。', matches: [] };
    }

    try {
      const result = await ctx.callPluginTool('@agent-spaces/builtin', 'kb_query', {
        knowledgeBase: COPYWRITING_KB_ID,
        query,
        topK: Math.max(1, Math.min(10, topK)),
      });
      const unwrapped = unwrap(result);
      const matches = normalizeMatches(result);
      return {
        ok: true,
        query,
        count: matches.length,
        matches,
        raw: unwrapped,
        message: matches.length ? '已查询文案知识库' : '文案知识库未找到相关结果',
      };
    } catch (err) {
      return {
        ok: false,
        query,
        matches: [],
        message: '查询文案知识库失败：' + (err.message || String(err)),
      };
    }
  },
};
