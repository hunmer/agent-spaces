// 内置虚拟插件 ID（agent_run / list_agent_presets 等走宿主内置路由）
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';
// 订阅源解析插件
export const FEED_PLUGIN = 'workflow.feed-parser';

// 单次 feed_fetch 条目上限（避免源过大）
export const FEED_ITEM_LIMIT = 50;
// AI 总结时喂给 Agent 的正文最长字符数（避免 token 溢出）
export const MAX_SUMMARY_CHARS = 12000;

// User Settings 持久化键（localStorage，per-project，与 podcast_generator 一致）
export const SETTING_KEYS = {
  feeds: 'feeds', // 订阅源列表 [{ id, title, url, format, link, description, lastFetchAt, itemCount, error }]
  articles: 'articles', // 全部文章 [{ id, feedId, feedTitle, guid, title, link, author, pubDate, content, summary, summaryAt, favorite, readAt }]
  agentConfigId: 'agentConfigId',
  agentMeta: 'agentMeta', // { name, modelProvider }
};

// openAgentEditor 的初始 name / systemPrompt
export const AGENT_INIT_NAME = 'RSS 总结助手';
export const AGENT_INIT_PROMPT =
  '你是一位资深编辑，擅长把网络文章压缩成精炼的中文摘要：先一句话总结核心观点，再列 3~5 条要点，最后给出阅读建议。不要使用任何工具，只输出总结正文。';

// 生成 id
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
