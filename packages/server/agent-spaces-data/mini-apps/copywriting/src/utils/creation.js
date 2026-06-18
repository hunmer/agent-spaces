// 创作 Agent 相关纯函数：内置插件 id、prompt 思考过程清洗、知识库检索结果归一化。

// 宿主内置虚拟插件，用于 agent_run / list_agent_presets 等
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';

// 去除 <think>...</think> 思考过程，只保留正文
export function stripThink(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

// 知识库检索结果归一化为 matches 数组（兼容多种返回结构）
export function normalizeKnowledgeBaseMatches(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.matches)) return result.matches;
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.documents)) return result.documents;
  return [];
}

// 单条知识库匹配转 prompt 文本（标题 / 相关度 / 内容）
export function knowledgeMatchToPromptText(match, index) {
  const title = match?.title || match?.fileName || match?.name || `知识库片段 ${index + 1}`;
  const text = match?.chunkText || match?.text || match?.content || match?.pageContent || match?.document || '';
  const score = typeof match?.score === 'number' ? `\n相关度：${match.score.toFixed(4)}` : '';
  return `标题：${title}${score}\n内容：${String(text || '').trim()}`;
}
