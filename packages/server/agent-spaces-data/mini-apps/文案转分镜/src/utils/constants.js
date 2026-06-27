// 文案转分镜 · 常量与默认值

// 数据落盘路径（configs/data.json）
export const DATA_PATH = 'data.json';

// 目标工作流（用户指定）
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6';
export const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = '19f5f8a9-305d-43a6-9b05-584597213a8f';
export const DEFAULT_VIDEO_WORKFLOW_ID = '5130958f-a78e-4c36-8f03-1f2f733b87d7';
export const DEFAULT_VOICE_WORKFLOW_ID = '820bf3b7-9d50-4f6d-966d-8e442960a233';
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_NAME = 'text_to_image';
export const DEFAULT_EDIT_IMAGE_WORKFLOW_NAME = 'edit_image';
export const DEFAULT_VIDEO_WORKFLOW_NAME = 'video_generator';
export const DEFAULT_VOICE_WORKFLOW_NAME = 'text_to_voice';

// 语音合成模型（对应 text_to_voice 工作流开始节点的 model 选项）
export const VOICE_MODEL_OPTIONS = [
  { value: 'fish-audio', label: 'FishAudio' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'qianyin', label: '千音' },
];

// 图片模型选项（按最新 image_generator 工作流整理）
export const PROVIDER_OPTIONS = [
  {
    value: 'keling',
    label: '可灵图像生成',
    models: [
      { value: 'kling/kling-v3-image-generation', label: 'kling/kling-v3-image-generation' },
      { value: 'kling/kling-v3-omni-image-generation', label: 'kling/kling-v3-omni-image-generation' },
    ],
  },
  {
    value: 'qwen',
    label: 'AI图像编辑',
    models: [
      { value: 'qwen-image-2.0-pro', label: 'qwen-image-2.0-pro' },
      { value: 'qwen-image-2.0', label: 'qwen-image-2.0' },
      { value: 'qwen-image-edit', label: 'qwen-image-edit' },
      { value: 'wan2.7-image-pro', label: 'wan2.7-image-pro' },
      { value: 'wan2.7-image', label: 'wan2.7-image' },
    ],
  },
  {
    value: 'jimeng',
    label: 'AI图生图',
    models: [
      { value: 'jimeng-4.5', label: 'jimeng-4.5' },
      { value: 'jimeng-5.0', label: 'jimeng-5.0' },
      { value: 'jimeng-4.6', label: 'jimeng-4.6' },
      { value: 'jimeng-4.1', label: 'jimeng-4.1' },
      { value: 'jimeng-4.0', label: 'jimeng-4.0' },
    ],
  },
  {
    value: 'openai',
    label: 'AI图片编辑',
    models: [
      { value: 'gpt-image-2-all', label: 'gpt-image-2-all' },
      { value: 'gpt-image-1', label: 'gpt-image-1' },
      { value: 'flux-kontext-pro', label: 'flux-kontext-pro' },
      { value: 'flux-kontext-max', label: 'flux-kontext-max' },
      { value: 'nano-banana', label: 'nano-banana' },
    ],
  },
];

export const MODEL_OPTIONS = PROVIDER_OPTIONS.flatMap((provider) =>
  provider.models.map((model) => ({
    ...model,
    provider: provider.value,
    providerLabel: provider.label,
  })),
);

export const ASPECT_OPTIONS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
export const SIZE_OPTIONS = ['1k', '2k', '4k'];
export const QUALITY_OPTIONS = ['720', '1080'];
export const DURATION_OPTIONS = ['5', '10'];
export const BATCH_LIMIT_OPTIONS = ['1', '2', '3', '5'];

export const DEFAULT_SETTINGS = {
  // Legacy keys remain for compatibility with existing persisted settings.
  imageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
  imageWorkflowName: DEFAULT_EDIT_IMAGE_WORKFLOW_NAME,
  textToImageWorkflowId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
  textToImageWorkflowName: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_NAME,
  editImageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
  editImageWorkflowName: DEFAULT_EDIT_IMAGE_WORKFLOW_NAME,
  videoWorkflowId: DEFAULT_VIDEO_WORKFLOW_ID,
  videoWorkflowName: DEFAULT_VIDEO_WORKFLOW_NAME,
  voiceWorkflowId: DEFAULT_VOICE_WORKFLOW_ID,
  voiceWorkflowName: DEFAULT_VOICE_WORKFLOW_NAME,
  provider: 'keling',
  model: 'kling/kling-v3-image-generation',
  aspect: '16:9',
  size: '1k',
  quality: '720',
  duration: '5',
  batchLimit: '1',
  voiceModel: 'fish-audio',
  voiceId: '',
};

// 内置插件
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';

// 用户设置（localStorage，per-project）键
export const SETTING_KEYS = {
  agentConfigId: 'sb_agentConfigId',
  agentMeta: 'sb_agentMeta',
};

// 「文案到分镜」Agent 预设
export const AGENT_INIT_NAME = '文案到分镜';

export const AGENT_INIT_PROMPT = `你是一位专业的分镜师与剧本结构师。用户会给你一段设定或文案，你的任务是把它拆解为标准的分镜 JSON，供「文案转分镜」应用导入。

输出要求：
1. 只输出一个 JSON 对象，禁止输出任何解释、标题、markdown 代码块标记或额外文字。
2. JSON 结构严格如下：
{
  "characters": [
    { "name": "角色名", "prompt": "该角色的视觉外观描述提示词，用于图像生成，例如：a young woman in a white shirt, short hair, warm smile", "imageUrls": [] }
  ],
  "scenes": [
    {
      "index": 1,
      "narration": "这一镜的旁白或台词文本",
      "visualPrompt": "画面描述提示词，用于图像生成：场景环境、构图、光线、色调、主体动作，需具体可视化",
      "animationPrompt": "动画与运镜提示词，用于视频生成：镜头运动（推/拉/摇/移）、主体动作、节奏氛围",
      "characterNames": ["角色名"]
    }
  ]
}

规则：
- characters：从设定中识别所有出场角色；name 简短；prompt 用中英文混合或英文的视觉描述，可直接喂给图像生成模型。
- scenes：按叙事顺序拆成 6~15 个分镜（设定明显需要更多或更少时灵活调整），index 从 1 递增。
- visualPrompt 要具体可视化：包含场景环境、主体、构图、光线、风格，避免抽象空泛。
- animationPrompt 描述本镜动态：运镜方式、主体动作、氛围节奏。
- characterNames 中出现的角色名必须在 characters 列表里存在。
- 若设定无明确角色（纯风景、物品、概念类），characters 可为空数组，scene 的 characterNames 也为空。`;

// 简易唯一 id
export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 空项目骨架
export function createEmptyProject(name) {
  const now = new Date().toISOString();
  return {
    id: uid('proj'),
    name: name || '未命名项目',
    createdAt: now,
    updatedAt: now,
    characters: [],
    scenes: [],
  };
}
