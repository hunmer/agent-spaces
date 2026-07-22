// 设置默认值 + 工作流槽位 + 模型选项
import { WORKFLOWS, BUILTIN_PLUGIN } from './constants';

// re-export 供 SettingsDialog 使用
export { BUILTIN_PLUGIN };

// 默认工作流 ID（与 constants.WORKFLOWS 一致，作为设置未覆盖时的兜底）
export const DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID = WORKFLOWS.text_to_image;
export const DEFAULT_EDIT_IMAGE_WORKFLOW_ID = WORKFLOWS.edit_image;

// 设置文件路径（configs/）
export const SETTINGS_PATH = 'settings.json';

export const DEFAULT_SETTINGS = {
  // 文生图工作流
  textToImageWorkflowId: DEFAULT_TEXT_TO_IMAGE_WORKFLOW_ID,
  textToImageWorkflowName: 'text_to_image',
  // 编辑图片工作流
  editImageWorkflowId: DEFAULT_EDIT_IMAGE_WORKFLOW_ID,
  editImageWorkflowName: 'edit_image',
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
];

// 合并默认设置（缺字段补默认值）
export function mergeSettings(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...value };
}
