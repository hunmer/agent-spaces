// 设置默认值 + 工作流槽位 + 模型选项
import { WORKFLOWS, BUILTIN_PLUGIN, MODEL_OPTIONS, BBOX_AI_SYSTEM_PROMPT, BBOX_AI_USER_PROMPT, PROMPT_REVERSE_SYSTEM_PROMPT, PROMPT_REVERSE_USER_PROMPT, PROMPT_OPTIMIZE_SYSTEM_PROMPT, PROMPT_OPTIMIZE_USER_PROMPT } from './constants';

// re-export 供 SettingsDialog 使用
export { BUILTIN_PLUGIN };

// 默认工作流 ID（与 constants.WORKFLOWS 一致，作为设置未覆盖时的兜底）
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = WORKFLOWS.text_to_image;
export const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = WORKFLOWS.edit_image;
export const DEFAULT_IMAGE_ENCHANTER_WORKFLOW_ID = WORKFLOWS.image_enchanter;
export const DEFAULT_TEXT_TO_VOICE_WORKFLOW_ID = WORKFLOWS.text_to_voice;
export const DEFAULT_VIDEO_GENERATOR_WORKFLOW_ID = WORKFLOWS.video_generator;

// 设置文件路径（configs/）
export const SETTINGS_PATH = 'settings.json';

// 模型列表默认值：取自 constants.MODEL_OPTIONS 的 value，作为 TagInput 的初始展示。
// 用户在设置页增删后写入 settings；「恢复内置默认」按钮一键填回此列表。
const BUILTIN_MODEL_VALUES = MODEL_OPTIONS.map((o) => o.value);
export const DEFAULT_TEXT_TO_IMAGE_MODELS = [...BUILTIN_MODEL_VALUES];
export const DEFAULT_EDIT_IMAGE_MODELS = [...BUILTIN_MODEL_VALUES];

export const DEFAULT_SETTINGS = {
  // 文生图工作流
  textToImageWorkflowId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
  textToImageWorkflowName: 'text_to_image',
  // 文生图支持的模型列表（默认取内置 MODEL_OPTIONS value，可在设置页增删）
  textToImageModels: DEFAULT_TEXT_TO_IMAGE_MODELS,
  // 编辑图片工作流
  editImageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
  editImageWorkflowName: 'edit_image',
  // 编辑图片支持的模型列表（默认取内置 MODEL_OPTIONS value，可在设置页增删）
  editImageModels: DEFAULT_EDIT_IMAGE_MODELS,
  // 抠图和放大工作流
  imageEnchanterWorkflowId: DEFAULT_IMAGE_ENCHANTER_WORKFLOW_ID,
  imageEnchanterWorkflowName: 'image_enchanter',
  // 文字生成语音工作流
  textToVoiceWorkflowId: DEFAULT_TEXT_TO_VOICE_WORKFLOW_ID,
  textToVoiceWorkflowName: 'text_to_voice',
  // 生成视频工作流
  videoGeneratorWorkflowId: DEFAULT_VIDEO_GENERATOR_WORKFLOW_ID,
  videoGeneratorWorkflowName: 'video_generator',
  // BBox AI 分析（agent_run；systemPrompt 归 agent preset 自带，不在此重复配置）
  bboxAgentConfigId: '',
  bboxAgentName: '',
  bboxAiUserPrompt: BBOX_AI_USER_PROMPT,
  // 图片压缩：仅原图体积超过阈值（MB）才压缩，只降体积不改尺寸，传给 AI 的 base64 附件更小
  bboxCompressThresholdMB: 2,   // 触发压缩的原图体积阈值（MB）；≤ 该值不压缩
  bboxCompressTargetMB: 1,      // 压缩目标体积（MB），仅降质量不改尺寸
  // 反推提示词（agent_run 多图；systemPrompt 归 agent preset 自带，不在此重复配置）
  promptReverseAgentConfigId: '',
  promptReverseAgentName: '',
  promptReverseUserPrompt: PROMPT_REVERSE_USER_PROMPT,
  // 提示词优化（agent_run 纯文本；systemPrompt 归 agent preset 自带，不在此重复配置）
  promptOptimizeAgentConfigId: '',
  promptOptimizeAgentName: '',
  promptOptimizeUserPrompt: PROMPT_OPTIMIZE_USER_PROMPT,
  // 完成后通知：节点生成成功后调 sendNotification 推送通知（默认关闭）
  notifyOnComplete: false,
  // 执行队列同时运行的任务数
  executionConcurrency: 3,
  // 画布样式（与宿主工作流画布使用相同字段名）
  bgVariant: 'dots',
  attributionPosition: 'top-bottom',
  snapGrid: true,
  // 生成记录 tab 视图模式：'list'(卡片列表) | 'masonry'(图片瀑布流)
  historyViewMode: 'list',
};

// 工作流槽位：设置页为每个节点类型选一个目标工作流
// key: 槽位标识；idKey/nameKey: 存到 settings 的字段名；defaultId/defaultName: 恢复默认值
export const WORKFLOW_SLOTS = [
  {
    key: 'textToImage',
    label: '文字生成图片工作流',
    desc: '文字生成图片节点执行时调用的工作流',
    idKey: 'textToImageWorkflowId',
    nameKey: 'textToImageWorkflowName',
    defaultId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
    defaultName: 'text_to_image',
  },
  {
    key: 'editImage',
    label: '编辑图片工作流',
    desc: '编辑图片节点执行时调用的工作流',
    idKey: 'editImageWorkflowId',
    nameKey: 'editImageWorkflowName',
    defaultId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
    defaultName: 'edit_image',
  },
  {
    key: 'imageEnchanter',
    label: '抠图和放大工作流',
    desc: '节点工具栏「抠图」「放大」按钮执行时调用的工作流',
    idKey: 'imageEnchanterWorkflowId',
    nameKey: 'imageEnchanterWorkflowName',
    defaultId: DEFAULT_IMAGE_ENCHANTER_WORKFLOW_ID,
    defaultName: 'image_enchanter',
  },
  {
    key: 'textToVoice',
    label: '文字生成语音工作流',
    desc: '生成配音节点执行时调用的工作流',
    idKey: 'textToVoiceWorkflowId',
    nameKey: 'textToVoiceWorkflowName',
    defaultId: DEFAULT_TEXT_TO_VOICE_WORKFLOW_ID,
    defaultName: 'text_to_voice',
  },
  {
    key: 'videoGenerator',
    label: '生成视频工作流',
    desc: '生成视频节点执行时调用的工作流',
    idKey: 'videoGeneratorWorkflowId',
    nameKey: 'videoGeneratorWorkflowName',
    defaultId: DEFAULT_VIDEO_GENERATOR_WORKFLOW_ID,
    defaultName: 'video_generator',
  },
];

// 合并默认设置（缺字段补默认值）
export function mergeSettings(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...value };
}
