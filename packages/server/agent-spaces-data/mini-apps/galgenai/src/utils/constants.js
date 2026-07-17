// 宿主内置虚拟插件：提供 list_agent_presets / agent_run / list_workflows / execute_workflow_sync
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';

// 默认文字转语音工作流（用户提供的 text_to_voice）
export const DEFAULT_TTS_WORKFLOW_ID = '820bf3b7-9d50-4f6d-966d-8e442960a233';
export const DEFAULT_TTS_WORKFLOW_NAME = 'text_to_voice';

// TTS 服务商选项，对应工作流 start 节点的 model 入参
export const TTS_PROVIDERS = [
  { id: 'minimax', name: 'MiniMax', icon: '🎙️' },
  { id: 'fish-audio', name: 'FishAudio', icon: '🐟' },
  { id: 'qianyin', name: '千音', icon: '🔊' },
];

// 默认背景，避免空背景
export const DEFAULT_BACKGROUND =
  'https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?q=80&w=2070&auto=format&fit=crop';

// 默认人设 prompt（移植自原 galgenai DEFAULT_PROMPTS）
export const DEFAULT_PROMPT = `You are a character in a visual novel (Galgame).
Act as a loyal, cute, and slightly witty assistant.
Keep your responses relatively short (under 100 words) to fit in a dialogue box, unless asked for a long explanation.
Refer to the user as "Master" or by their name if known.
Do not output markdown formatted text like **bold** or # headers often. Plain text is preferred.`;

// 默认 Live2D 模型仓库（移植自原 DEFAULT_REPOS）
export const DEFAULT_REPO = {
  id: 'default-repo',
  name: 'Eikanya Model Collection',
  url: 'https://guansss.github.io/live2d-viewer-web/eikanyalive2d-model.json',
};

// openAgentEditor 新建 agent 时的初始名称与系统提示
// （人设区块已移除，对话风格由 agent 自身的 systemPrompt 决定）
export const AGENT_INIT_NAME = 'Galgame 伙伴';
export const AGENT_INIT_PROMPT = `你是一个视觉小说（Galgame）中的角色。
扮演一个忠诚、可爱、略带俏皮的助手。
回复尽量简短（100 字以内），适合显示在对话框里，除非用户要求详细解释。
称呼用户为「主人」或其名字。
不要使用 markdown 语法（如 **加粗**、# 标题），使用纯文本。`;

// Eikanya 仓库的 CDN 基址
export const EIKANYA_CDN_BASE = 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/';
