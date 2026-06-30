// 设置默认值 + 模型选项 + Agent 预设

// 默认工作流 ID（与用户提供的一致）
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6';
export const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = '19f5f8a9-305d-43a6-9b05-584597213a8f';

export const DEFAULT_SETTINGS = {
  textToImageWorkflowId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
  textToImageWorkflowName: 'text_to_image',
  editImageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
  editImageWorkflowName: 'edit_image',
  defaultModel: '',
  // 工作流容错模式：ignore（忽略节点错误，继续执行）/ stop（遇到错误停止）
  workflowFaultTolerance: 'ignore',
  // agent 配置由 openAgentEditor 返回后填入；agentConfigId 也存 localStorage 做本地兜底
  agentConfigId: '',
  agentName: '',
  agentModelProvider: '',
};

// 工作流容错模式选项
export const WORKFLOW_FAULT_TOLERANCE_OPTIONS = [
  { value: 'ignore', label: '忽略错误', desc: '节点出错时仅记录日志，继续执行后续节点' },
  { value: 'stop', label: '遇到错误停止', desc: '节点出错时立即终止整个工作流' },
];

// 图片模型选项（按常见 provider 整理，用户可在设置里覆盖 defaultModel）
export const PROVIDER_OPTIONS = [
  {
    value: 'openai',
    label: 'OpenAI / 第三方',
    models: [
      { value: 'gpt-image-1', label: 'gpt-image-1' },
      { value: 'gpt-image-2-all', label: 'gpt-image-2-all' },
      { value: 'flux-kontext-pro', label: 'flux-kontext-pro' },
      { value: 'flux-kontext-max', label: 'flux-kontext-max' },
      { value: 'nano-banana-2', label: 'nano-banana-2' },
    ],
  },
  {
    value: 'jimeng',
    label: '即梦 Jimeng',
    models: [
      { value: 'jimeng-5.0', label: 'jimeng-5.0' },
      { value: 'jimeng-4.6', label: 'jimeng-4.6' },
      { value: 'jimeng-4.5', label: 'jimeng-4.5' },
    ],
  },
  {
    value: 'qwen',
    label: '通义 Qwen',
    models: [
      { value: 'qwen-image-2.0-pro', label: 'qwen-image-2.0-pro' },
      { value: 'wan2.7-image-pro', label: 'wan2.7-image-pro' },
      { value: 'qwen-image-edit', label: 'qwen-image-edit' },
    ],
  },
  {
    value: 'keling',
    label: '可灵 Keling',
    models: [
      { value: 'kling/kling-v3-image-generation', label: 'kling-v3' },
      { value: 'kling/kling-v3-omni-image-generation', label: 'kling-v3-omni' },
    ],
  },
];

// 扁平模型列表，供下拉用
export const MODEL_OPTIONS = PROVIDER_OPTIONS.flatMap((p) =>
  p.models.map((m) => ({ ...m, provider: p.value, providerLabel: p.label })),
);

// 工作流槽位定义（设置对话框里逐项展示）
export const WORKFLOW_SLOTS = [
  {
    key: 'textToImage',
    idKey: 'textToImageWorkflowId',
    nameKey: 'textToImageWorkflowName',
    label: '文生图工作流',
    desc: '纯文本生成贴图（无参考图时使用）',
    defaultId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
    defaultName: 'text_to_image',
  },
  {
    key: 'editImage',
    idKey: 'editImageWorkflowId',
    nameKey: 'editImageWorkflowName',
    label: '图生图工作流',
    desc: '上传参考图后生成 / 编辑贴图',
    defaultId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
    defaultName: 'edit_image',
  },
];

// agent_run 预设：提示词助手用的初始 prompt
export const AGENT_INIT_NAME = '贴图助手';
export const AGENT_INIT_PROMPT = `你是贴图提示词专家。用户给你一个主题或中文描述，你要输出 3 条适合制作贴纸(sticker)的英文提示词。

要求：
1. 只输出 3 行英文提示词，每行一条，禁止输出序号、解释、markdown 代码块标记。
2. 每条提示词要具体可视化：主体 + 风格 + 表情/动作 + 构图 + 是否透明背景。
3. 默认强调 sticker、die-cut、white border、transparent background 等贴纸特征。
4. 风格多样（卡通 / 3D / 水彩 / 像素等），不要三条雷同。`;

export const BUILTIN_PLUGIN = '@agent-spaces/builtin';

// localStorage 键（agent 配置本地兜底，跨会话保留）
export const SETTING_KEYS = {
  agentConfigId: 'sticker_agentConfigId',
  agentMeta: 'sticker_agentMeta',
  draftModel: 'stickerGeneratorModel',
};
