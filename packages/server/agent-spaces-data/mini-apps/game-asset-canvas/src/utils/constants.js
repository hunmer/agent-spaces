// 工作流 ID
export const WORKFLOWS = {
  // 文字生成图片
  text_to_image: 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6',
  // 编辑图片
  edit_image: '19f5f8a9-305d-43a6-9b05-584597213a8f',
  // 抠图和放大
  image_enchanter: '8425608e-9e0c-49fa-baa3-32675566a3e6',
};

// 抠图和放大的处理类型（对应 image_enchanter 工作流 start 节点 process_type）
export const IMAGE_PROCESS_TYPES = {
  segment: 'segment', // 抠图
  enhance: 'enhance', // 放大
};

// 节点类型
export const NODE_TYPES = {
  textToImage: 'textToImage',
  editImage: 'editImage',
  imageDisplay: 'imageDisplay',
  imageProcess: 'imageProcess',
  imageEditor: 'imageEditor',
  frameEditor: 'frameEditor',
  note: 'note',
  // 注：分组不是节点，是 WorkflowGroupOverlay（由 groups 数据驱动，复用 workflow-editor 同源组件）
};

// 工作流内置插件
export const BUILTIN_PLUGIN = '@agent-spaces/builtin';
export const EXEC_TOOL = 'execute_workflow_sync';

// 模型下拉选项：工作流 run_code 路由关键字（已补全）
// 含 'gpt'/'dall-e'/'flux'/'nano' -> case-3 AI图片文生图
// 含 'jimeng' -> case-2 即梦AI文生图
// 含 'qwen'/'wanx'/'wan2.7' -> case-1 阿里云AI文生图
// 含 'kling' -> case-0 可灵图像生成
export const MODEL_OPTIONS = [
  { value: 'gpt-image-1', label: 'GPT Image 1' },
  { value: 'gpt-image-2', label: 'GPT Image 2' },
  { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
  { value: 'gpt-image-1-mini', label: 'GPT Image 1 Mini' },
  { value: 'dall-e-3', label: 'DALL·E 3' },
  { value: 'dall-e-2', label: 'DALL·E 2' },
  { value: 'jimeng-5.0', label: '即梦 5.0' },
  { value: 'jimeng-4.6', label: '即梦 4.6' },
  { value: 'jimeng-4.5', label: '即梦 4.5' },
  { value: 'jimeng-4.1', label: '即梦 4.1' },
  { value: 'qwen-image-2.0-pro', label: '千问图像 2.0 Pro' },
  { value: 'qwen-image-2.0', label: '千问图像 2.0' },
  { value: 'wanx2.1-t2i-turbo', label: '万相 2.1 Turbo' },
  { value: 'flux-pro', label: 'FLUX Pro' },
  { value: 'kling-v2', label: '可灵 v2' },
];

export const DEFAULT_MODEL = 'gpt-image-1';

// 比例
export const ASPECT_OPTIONS = ['21:9', '16:9', '9:16', '1:1', '4:3', '3:4'];
// 尺寸
export const SIZE_OPTIONS = ['1k', '2k', '4k'];

// 节点显示配置
export const NODE_META = {
  [NODE_TYPES.textToImage]: { label: '文字生成图片', icon: '✍️', color: '#6366f1' },
  [NODE_TYPES.editImage]: { label: '编辑图片', icon: '🖌️', color: '#ec4899' },
  [NODE_TYPES.imageDisplay]: { label: '图片展示', icon: '🖼️', color: '#10b981' },
  [NODE_TYPES.imageProcess]: { label: '图像处理', icon: '🔧', color: '#14b8a6' },
  [NODE_TYPES.imageEditor]: { label: '图片编辑', icon: '🎨', color: '#f97316' },
  [NODE_TYPES.frameEditor]: { label: '动画帧编辑器', icon: '🎞️', color: '#a855f7' },
  [NODE_TYPES.note]: { label: '便签', icon: '📝', color: '#f59e0b' },
};

// 图片展示节点的来源标签（不同来源传不同 tag 做区分）
// 用于 data.tags 数组，节点内渲染为小标签
export const IMAGE_TAGS = {
  textToImage: '文生图',
  editImage: '编辑图片',
  upload: '上传',
  url: 'URL',
  segment: '抠图',
  enhance: '放大',
  imageProcess: '图像处理',
  imageEditor: '图片编辑',
  frameEditor: '帧编辑',
  history: '记录',
  upstream: '连线',
  export: '导出',
};

// 持久化配置文件名（工作区共享的顶层配置）
export const CANVAS_CONFIG = 'canvas.json';
export const HISTORY_CONFIG = 'generation-history.json';
// 自动保存防抖(ms)
export const SAVE_DEBOUNCE = 600;

// ============ 多工作区隔离 ============
// 工作区清单（全局共享）：{ workspaces: [{id,name,createdAt}], activeId }
export const WORKSPACES_CONFIG = 'workspaces.json';
// 默认工作区 id（首次无清单时用）
export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_WORKSPACE_NAME = '默认工作区';

/**
 * 工作区隔离的 config 路径：节点和生成记录按工作区隔离存到 configs/workspaces/<id>/ 下。
 * settings/prompt-library/panel-layout 仍共享（用户级偏好）。
 * @param {string} workspaceId
 * @param {string} fileName 'canvas.json' | 'generation-history.json'
 * @returns {string} 相对 configs 的路径，如 'workspaces/default/canvas.json'
 */
export function workspaceConfigPath(workspaceId, fileName) {
  const id = workspaceId || DEFAULT_WORKSPACE_ID;
  return `workspaces/${id}/${fileName}`;
}

export const WORKSPACE_CANVAS = 'canvas.json';
export const WORKSPACE_HISTORY = 'generation-history.json';
// 素材库（按工作区隔离）：分类 + 分类下的图片资产
export const ASSET_LIBRARY_CONFIG = 'asset-library.json';

// ============ 图像处理节点 ============
// 处理器分类（下拉按此分组），与 utils/image-ops/index.js 的 PROCESSORS 的 id 一一对应。
// run 实现在 image-ops 层，这里只定义 UI 可见的参数表。
export const IMAGE_PROCESSOR_CATEGORIES = [
  { id: 'gif', label: 'GIF 处理', icon: '🎬' },
  { id: 'sprite', label: 'Sprite Sheet', icon: '🎞️' },
  { id: 'pixel', label: '像素处理', icon: '🟦' },
  { id: 'matte', label: '抠图去背', icon: '✂️' },
  { id: 'compose', label: '图层合成', icon: '🧬' },
];

/**
 * 处理器清单。字段：
 * - id：与 image-ops/PROCESSORS 的 key 一致
 * - multipleIn：是否需要多输入（多张连线图作为输入，如合成）
 * - multipleOut：是否产出多帧（拆帧类）
 * - params：UI 参数表，{ key, label, type, default, min?, max?, options? }
 *   type: 'number' | 'color' | 'select' | 'bool'
 */
export const IMAGE_PROCESSORS = [
  // ---- GIF ----
  {
    id: 'gif-split', label: 'GIF 拆帧', category: 'gif', multipleOut: true,
    desc: '把 GIF 拆成多帧 PNG，按帧序号命名',
    params: [],
  },
  {
    id: 'gif-merge', label: 'GIF 合成', category: 'gif', multipleIn: true,
    desc: '多帧合成为 GIF 动画（需 ≥2 帧输入）',
    params: [{ key: 'delay', label: '帧间隔(ms)', type: 'number', default: 100, min: 20, max: 2000 }],
  },
  // ---- Sprite Sheet ----
  {
    id: 'sprite-split', label: 'Sheet 拆分', category: 'sprite', multipleOut: true,
    desc: '按行列均匀切分，或自动按透明行列拆分',
    params: [
      { key: 'cols', label: '列数', type: 'number', default: 4, min: 1, max: 32 },
      { key: 'rows', label: '行数', type: 'number', default: 4, min: 1, max: 32 },
      { key: 'auto', label: '自动透明拆分', type: 'bool', default: false },
    ],
  },
  {
    id: 'sprite-merge', label: 'Sheet 合成', category: 'sprite', multipleIn: true,
    desc: '多帧合成 Sprite Sheet 网格图（需 ≥2 帧输入）',
    params: [
      { key: 'columns', label: '列数', type: 'number', default: 4, min: 1, max: 32 },
      { key: 'spacing', label: '间隔(px)', type: 'number', default: 0, min: 0, max: 64 },
    ],
  },
  // ---- 像素处理 ----
  {
    id: 'pixelate', label: '像素化', category: 'pixel',
    desc: '降采样 + Wu 色彩量化，生成像素风',
    params: [
      { key: 'numColors', label: '颜色数', type: 'number', default: 16, min: 2, max: 256 },
      { key: 'blockSize', label: '像素块', type: 'number', default: 4, min: 1, max: 32 },
    ],
  },
  {
    id: 'resize-nearest', label: '最近邻缩放', category: 'pixel',
    desc: '硬缩放保持像素锐利（PS 风格），按比例 contain 居中',
    params: [
      { key: 'targetW', label: '目标宽', type: 'number', default: 256, min: 1, max: 4096 },
      { key: 'targetH', label: '目标高', type: 'number', default: 256, min: 1, max: 4096 },
    ],
  },
  {
    id: 'inner-stroke', label: '内描边', category: 'pixel',
    desc: 'BFS 距离场，主体边缘内 N 像素染描边色',
    params: [
      { key: 'strokeWidth', label: '描边宽', type: 'number', default: 2, min: 1, max: 10 },
      { key: 'strokeColor', label: '描边色', type: 'color', default: '#000000' },
    ],
  },
  // ---- 抠图去背 ----
  {
    id: 'chroma-key', label: '色度键抠图', category: 'matte',
    desc: '绿幕/蓝幕/自定义键色抠除，带平滑带',
    params: [
      { key: 'keyColor', label: '键色', type: 'color', default: '#00ff00' },
      { key: 'tolerance', label: '容差', type: 'number', default: 80, min: 0, max: 200 },
      { key: 'smoothness', label: '平滑', type: 'number', default: 30, min: 0, max: 100 },
      { key: 'erode', label: '侵蚀(px)', type: 'number', default: 0, min: 0, max: 5 },
    ],
  },
  {
    id: 'white-key', label: '白底抠图', category: 'matte',
    desc: '把接近白色的像素置透明',
    params: [
      { key: 'tolerance', label: '容差', type: 'number', default: 30, min: 0, max: 100 },
      { key: 'erode', label: '侵蚀(px)', type: 'number', default: 0, min: 0, max: 5 },
    ],
  },
  // ---- 图层合成 ----
  {
    id: 'compose-overlay', label: '图层叠加', category: 'compose', multipleIn: true,
    desc: '多图层自下而上 alpha-over 合成（需 ≥2 个输入）',
    params: [
      { key: 'mode', label: '混合模式', type: 'select', default: 'normal', options: ['normal', 'multiply', 'screen', 'overlay', 'add'] },
    ],
  },
];

/** 按 id 取处理器元信息 */
export function getImageProcessor(id) {
  return IMAGE_PROCESSORS.find((p) => p.id === id);
}

/** 处理器默认参数（初始化节点 data.params.processorParams 用） */
export function defaultProcessorParams(processorId) {
  const p = getImageProcessor(processorId);
  if (!p) return {};
  const out = {};
  for (const param of p.params || []) {
    out[param.key] = param.default;
  }
  return out;
}
