import { NODE_TYPES } from './constants.js';

export const CONNECTION_INPUT_TYPES = {
  image: 'image',
  text: 'text',
  video: 'video',
  audio: 'audio',
};

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

const TEXT_OUTPUT_NODE_TYPES = new Set([
  NODE_TYPES.text,
  NODE_TYPES.promptReverse,
]);

const VIDEO_OUTPUT_NODE_TYPES = new Set([
  NODE_TYPES.videoGenerator,
  NODE_TYPES.videoDisplay,
  NODE_TYPES.videoEditor,
]);

const AUDIO_OUTPUT_NODE_TYPES = new Set([
  NODE_TYPES.textToVoice,
  NODE_TYPES.audioDisplay,
]);

export function getTextInputTargets(paramsSchema = []) {
  return paramsSchema
    .filter((field) => field?.key && (field.type === 'text' || field.type === 'textarea'))
    .map((field) => ({
      id: field.key,
      label: field.label || field.key,
      description: field.description || `写入「${field.label || field.key}」文本输入`,
    }));
}

export function getNodeOutputType(nodeType) {
  if (TEXT_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.text;
  if (VIDEO_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.video;
  if (AUDIO_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.audio;
  return CONNECTION_INPUT_TYPES.image;
}

export function getConnectionTargets(sourceNodeType, targetNodeType, targetParamsSchema = []) {
  const inputType = getNodeOutputType(sourceNodeType);
  return {
    inputType,
    targets: inputType === CONNECTION_INPUT_TYPES.text
      ? getTextInputTargets(targetParamsSchema)
      : inputType === CONNECTION_INPUT_TYPES.video
        ? [{ id: 'videos', label: '输入视频', description: '作为节点的视频输入' }]
        : inputType === CONNECTION_INPUT_TYPES.audio
          ? [{ id: 'audios', label: '输入音频', description: '作为节点的音频输入' }]
          : getFileUploadTargets(targetNodeType),
  };
}
