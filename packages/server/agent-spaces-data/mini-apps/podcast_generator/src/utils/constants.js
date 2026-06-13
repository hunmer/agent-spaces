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
  agentMeta: 'agentMeta', // { name, modelProvider }，按钮显示用
  podcast: 'podcast',
};

// openAgentEditor 的初始 name / systemPrompt
export const AGENT_INIT_NAME = '播客生成器';
export const AGENT_INIT_PROMPT = '你是一位资深播客制作人，负责把电子书章节内容改编成自然流畅的双人播客对话脚本。';
