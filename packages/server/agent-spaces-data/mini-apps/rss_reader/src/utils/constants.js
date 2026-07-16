// 内置虚拟插件 ID（agent_run / list_agent_presets 等走宿主内置路由）
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';
// 订阅源解析插件
export const FEED_PLUGIN = 'workflow.feed-parser';

// 单次 feed_fetch 条目上限（避免源过大）
export const FEED_ITEM_LIMIT = 50;
// AI 总结时喂给 Agent 的正文最长字符数（避免 token 溢出）
export const MAX_SUMMARY_CHARS = 12000;

// configs/ 下的 JSON 持久化文件名（readConfigJson / writeConfigJson）
// 关键：每个订阅源的文章单独存一个文件，拉取某源只读写该源文件，物理隔离杜绝互相覆盖。
export const CONFIG_FILES = {
  feeds: 'feeds.json', // 订阅源列表 [{ id, title, url, ... }]
  agent: 'agent.json', // { agentConfigId, agentMeta }
};

// 某个订阅源的文章文件名（扁平命名，避免子目录）
export function feedArticlesFile(feedId) {
  // feedId 形如 "feed-xxx-xxx"，做一次 sanitize 防 ../ 之类
  const safe = String(feedId).replace(/[^a-zA-Z0-9_-]/g, '');
  return `feed_${safe}.json`;
}

// openAgentEditor 的初始 name / systemPrompt
export const AGENT_INIT_NAME = 'RSS 总结助手';
export const AGENT_INIT_PROMPT =
  '你是一位资深编辑，擅长把网络文章压缩成精炼的中文摘要：先一句话总结核心观点，再列 3~5 条要点，最后给出阅读建议。不要使用任何工具，只输出总结正文。';

// —— Resizable 布局持久化 ——
// configs/ 下的布局文件名（readConfigJson / writeConfigJson，server-side）
export const LAYOUT_FILE = 'layout.json';
// 各面板 id（react-resizable-panels 用 id 索引 defaultLayout）
export const PANEL_IDS = {
  feeds: 'rss-feeds',
  list: 'rss-list',
  detail: 'rss-detail',
  summary: 'rss-summary',
};
// 默认布局：四栏百分比，总和 100
export const DEFAULT_LAYOUT = {
  [PANEL_IDS.feeds]: 16,
  [PANEL_IDS.list]: 24,
  [PANEL_IDS.detail]: 38,
  [PANEL_IDS.summary]: 22,
};

// 生成 id
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
