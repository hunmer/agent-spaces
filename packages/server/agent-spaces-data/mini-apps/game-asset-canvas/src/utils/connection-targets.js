import { NODE_TYPES } from './constants.js';

export const DEFAULT_FILE_UPLOAD_TARGET = 'images';

const DEFAULT_TARGETS = [
  { id: DEFAULT_FILE_UPLOAD_TARGET, label: '输入图片', description: '作为节点的常规图片输入' },
];

const TARGETS_BY_NODE_TYPE = {
  [NODE_TYPES.editImage]: [
    ...DEFAULT_TARGETS,
    { id: 'mask', label: '蒙版图片', description: '白色区域编辑，黑色区域保留' },
  ],
};

export function getFileUploadTargets(nodeType) {
  return TARGETS_BY_NODE_TYPE[nodeType] || DEFAULT_TARGETS;
}

export function resolveFileUploadTarget(nodeType, targetId) {
  const targets = getFileUploadTargets(nodeType);
  return targets.some((target) => target.id === targetId)
    ? targetId
    : DEFAULT_FILE_UPLOAD_TARGET;
}
