import { NODE_TYPES, isImageProcessNodeType } from './constants.js';

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

const IMAGE_INPUT_NODE_TYPES = new Set([
  NODE_TYPES.editImage,
  NODE_TYPES.imageDisplay,
  NODE_TYPES.imageProcess,
  NODE_TYPES.imageEditor,
  NODE_TYPES.pixelEditor,
  NODE_TYPES.uiSplitter,
  NODE_TYPES.bboxViewer,
  NODE_TYPES.promptReverse,
  NODE_TYPES.videoGenerator,
  NODE_TYPES.imageCompare,
  NODE_TYPES.cutout,
  NODE_TYPES.depthExtract,
  NODE_TYPES.directorDesk,
  NODE_TYPES.photopea,
  NODE_TYPES.maskPaint,
]);

const VIDEO_INPUT_NODE_TYPES = new Set([
  NODE_TYPES.videoDisplay,
  NODE_TYPES.videoGenerator,
  NODE_TYPES.videoEditor,
]);

const AUDIO_INPUT_NODE_TYPES = new Set([
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

/** 提取纯文本或富文本字段里的 {变量} 占位符，按出现顺序去重。 */
export function extractTemplateVariables(value) {
  if (typeof value !== 'string' || !value) return [];
  const variables = [];
  const seen = new Set();
  for (const match of value.matchAll(/\{([A-Za-z0-9_.\-\u3400-\u9fff]+)\}/g)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    variables.push(name);
  }
  return variables;
}

/** 给文本连接目标附加当前字段中可选的变量，供连接弹窗展示。 */
export function withTextTargetVariables(targets = [], params = {}) {
  return targets.map((target) => ({
    ...target,
    variables: extractTemplateVariables(params?.[target.id]),
  }));
}

export function getNodeOutputType(nodeType) {
  if (TEXT_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.text;
  if (VIDEO_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.video;
  if (AUDIO_OUTPUT_NODE_TYPES.has(nodeType)) return CONNECTION_INPUT_TYPES.audio;
  return CONNECTION_INPUT_TYPES.image;
}

export function getConnectionTargetsForInputType(inputType, targetNodeType, targetParamsSchema = []) {
  return {
    inputType,
    targets: inputType === CONNECTION_INPUT_TYPES.text
      ? getTextInputTargets(targetParamsSchema)
      : inputType === CONNECTION_INPUT_TYPES.video
        ? (VIDEO_INPUT_NODE_TYPES.has(targetNodeType)
          ? [{ id: 'videos', label: '输入视频', description: '作为节点的视频输入' }]
          : [])
        : inputType === CONNECTION_INPUT_TYPES.audio
          ? (AUDIO_INPUT_NODE_TYPES.has(targetNodeType)
            ? [{ id: 'audios', label: '输入音频', description: '作为节点的音频输入' }]
            : [])
          : (IMAGE_INPUT_NODE_TYPES.has(targetNodeType) || isImageProcessNodeType(targetNodeType)
            ? getFileUploadTargets(targetNodeType)
            : []),
  };
}

export function getConnectionTargets(sourceNodeType, targetNodeType, targetParamsSchema = [], inputTypeOverride) {
  return getConnectionTargetsForInputType(
    inputTypeOverride || getNodeOutputType(sourceNodeType),
    targetNodeType,
    targetParamsSchema,
  );
}

export function getConnectionTargetsByInputType(inputTypes, targetNodeType, targetParamsSchema = []) {
  return Object.fromEntries(Array.from(new Set(inputTypes || [])).map((inputType) => [
    inputType,
    getConnectionTargetsForInputType(inputType, targetNodeType, targetParamsSchema).targets,
  ]));
}
