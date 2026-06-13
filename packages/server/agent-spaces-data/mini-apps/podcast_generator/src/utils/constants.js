// 内置虚拟插件 ID：经 plugin execute 路由识别后走 executeMiniAppBuiltinTool
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';
export const EPUB_PLUGIN = 'workflow.epub-parser';

// 章节正文最长传入 prompt 的字符数（避免 token 溢出）
export const MAX_CONTENT_CHARS = 12000;

// User Settings 持久化键（localStorage，per-project）
export const SETTING_KEYS = {
  filePath: 'filePath',
  bookMeta: 'bookMeta',
  selectedIndex: 'selectedIndex',
  agentConfigId: 'agentConfigId',
  podcast: 'podcast',
};
