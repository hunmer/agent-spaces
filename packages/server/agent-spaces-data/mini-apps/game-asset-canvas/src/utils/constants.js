// 工作流 ID
export const WORKFLOWS = {
  // 文字生成图片
  text_to_image: 'd88dcb7c-7f5f-47c8-962c-89217a2c0ad6',
  // 编辑图片
  edit_image: '19f5f8a9-305d-43a6-9b05-584597213a8f',
  // 抠图和放大
  image_enchanter: '8425608e-9e0c-49fa-baa3-32675566a3e6',
  // 文字生成语音
  text_to_voice: '820bf3b7-9d50-4f6d-966d-8e442960a233',
  // 生成视频
  video_generator: '5130958f-a78e-4c36-8f03-1f2f733b87d7',
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
  // 图像处理：旧的单节点（兼容已有 canvas.json，新画布不再添加）
  imageProcess: 'imageProcess',
  // 图像处理：拆分后的 12 个独立节点（一个处理器 = 一个节点类型）
  ipGifSplit: 'ipGifSplit',
  ipGifMerge: 'ipGifMerge',
  ipSpriteSplit: 'ipSpriteSplit',
  ipSpriteMerge: 'ipSpriteMerge',
  ipPixelate: 'ipPixelate',
  ipResizeNearest: 'ipResizeNearest',
  ipInnerStroke: 'ipInnerStroke',
  ipChromaKey: 'ipChromaKey',
  ipWhiteKey: 'ipWhiteKey',
  ipComposeOverlay: 'ipComposeOverlay',
  ipEnhance: 'ipEnhance',
  ipCompress: 'ipCompress',
  imageEditor: 'imageEditor',
  pixelEditor: 'pixelEditor',
  uiSplitter: 'uiSplitter',
  bboxViewer: 'bboxViewer',
  textToVoice: 'textToVoice',
  videoGenerator: 'videoGenerator',
  imageCompare: 'imageCompare',
  note: 'note',
  // 注：分组不是节点，是 WorkflowGroupOverlay（由 groups 数据驱动，复用 workflow-editor 同源组件）
};

/**
 * 拆分后的图像处理节点类型 → 处理器 id 映射。
 * ImageProcessNode 通过 nodeType 反查固定 processorId（不再有下拉切换）。
 * 旧 imageProcess 节点的 processorId 从 data.params.processor 读（兼容）。
 */
export const NODE_TYPE_TO_PROCESSOR = {
  [NODE_TYPES.ipGifSplit]: 'gif-split',
  [NODE_TYPES.ipGifMerge]: 'gif-merge',
  [NODE_TYPES.ipSpriteSplit]: 'sprite-split',
  [NODE_TYPES.ipSpriteMerge]: 'sprite-merge',
  [NODE_TYPES.ipPixelate]: 'pixelate',
  [NODE_TYPES.ipResizeNearest]: 'resize-nearest',
  [NODE_TYPES.ipInnerStroke]: 'inner-stroke',
  [NODE_TYPES.ipChromaKey]: 'chroma-key',
  [NODE_TYPES.ipWhiteKey]: 'white-key',
  [NODE_TYPES.ipComposeOverlay]: 'compose-overlay',
  [NODE_TYPES.ipEnhance]: 'enhance',
  [NODE_TYPES.ipCompress]: 'compress',
};

/** 反向：处理器 id → 节点类型（initialData/Canvas 用） */
export const PROCESSOR_TO_NODE_TYPE = Object.fromEntries(
  Object.entries(NODE_TYPE_TO_PROCESSOR).map(([nt, p]) => [p, nt]),
);

/** 判断节点类型是否为拆分后的图像处理节点 */
export function isImageProcessNodeType(type) {
  return Object.prototype.hasOwnProperty.call(NODE_TYPE_TO_PROCESSOR, type);
}

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

// ============ 文字生成语音（text_to_voice 工作流）============
// 语音服务提供商（工作流 start 节点 model 字段，inputMode=native select）
// fish-audio 传 voiceId=referenceId, minimax 传 voiceId=voiceId, qianyin 传 voiceId=speakerId
export const VOICE_PROVIDER_OPTIONS = [
  { value: 'fish-audio', label: 'Fish Audio' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'qianyin', label: '千音' },
];

// ============ 生成视频（video_generator 工作流）============
// 比例（工作流 start 节点 aspect select）
export const VIDEO_ASPECT_OPTIONS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
// 质量（工作流 start 节点 quality select）
export const VIDEO_QUALITY_OPTIONS = ['720', '1080', '512', '768'];
// 时长秒（工作流 start 节点 duration select）
export const VIDEO_DURATION_OPTIONS = ['5', '10'];
// 视频模型选项（按 provider 分组，与 video_generator 工作流 run_code 路由关键字一致）：
// - jimeng 系列 → case jimeng（jimeng_text_to_video 节点）
// - minimax 系列 → case minimax（minimax_image_to_video / minimax_start_end_to_video，按是否多图分流）
// - 其余 → case aliyun（aliyun_image_to_video_v27，需 ≥1 张参考图）
// 注：aliyun 分支会取 images[0]/images[1] 作为首尾帧，无图时该分支会失败
export const VIDEO_MODEL_OPTIONS = [
  {
    group: '即梦 Jimeng',
    options: [
      { value: 'jimeng-video-3.5-pro', label: 'Jimeng Video 3.5 Pro' },
      { value: 'jimeng-video-3.0-pro', label: 'Jimeng Video 3.0 Pro' },
      { value: 'jimeng-video-3.0', label: 'Jimeng Video 3.0' },
      { value: 'jimeng-video-3.0-fast', label: 'Jimeng Video 3.0 Fast' },
      { value: 'jimeng-video-2.0-pro', label: 'Jimeng Video 2.0 Pro' },
      { value: 'jimeng-video-2.0', label: 'Jimeng Video 2.0' },
    ],
  },
  {
    group: 'MiniMax 海螺',
    options: [
      { value: 'MiniMax-Hailuo-2.3', label: 'Hailuo 2.3' },
      { value: 'MiniMax-Hailuo-2.3-Fast', label: 'Hailuo 2.3 Fast' },
      { value: 'MiniMax-Hailuo-02', label: 'Hailuo 02' },
      { value: 'I2V-01-Director', label: 'I2V-01 Director' },
      { value: 'I2V-01-live', label: 'I2V-01 Live' },
      { value: 'I2V-01', label: 'I2V-01' },
    ],
  },
  {
    group: '阿里云 Aliyun（需参考图）',
    options: [
      { value: 'wanx2.7-image-to-video', label: '万相 2.7 图生视频' },
      { value: 'wanx2.1-image-to-video', label: '万相 2.1 图生视频' },
    ],
  },
];
// 默认视频模型（即梦 3.0，纯文生视频也可用，不强依赖参考图）
export const DEFAULT_VIDEO_MODEL = 'jimeng-video-3.0';
// 判断模型是否属于 aliyun 分支（需参考图）：未在 jimeng/minimax 枚举里的都走 aliyun
export function isAliyunVideoModel(model) {
  if (!model) return false;
  for (const g of VIDEO_MODEL_OPTIONS) {
    if (g.group.startsWith('即梦') || g.group.startsWith('MiniMax')) {
      if (g.options.some((o) => o.value === model)) return false;
    }
  }
  return true;
}

// 节点显示配置
export const NODE_META = {
  [NODE_TYPES.textToImage]: { label: '文字生成图片', icon: '✍️', color: '#6366f1' },
  [NODE_TYPES.editImage]: { label: '编辑图片', icon: '🖌️', color: '#ec4899' },
  [NODE_TYPES.imageDisplay]: { label: '图片展示', icon: '🖼️', color: '#10b981' },
  [NODE_TYPES.imageProcess]: { label: '图像处理', icon: '🔧', color: '#14b8a6' },
  // 拆分后的 12 个图像处理节点（共用青色系，按处理器语义给 icon）
  [NODE_TYPES.ipGifSplit]: { label: 'GIF 拆帧', icon: '🎬', color: '#14b8a6' },
  [NODE_TYPES.ipGifMerge]: { label: 'GIF 合成', icon: '🎞️', color: '#14b8a6' },
  [NODE_TYPES.ipSpriteSplit]: { label: 'Sheet 拆分', icon: '🔲', color: '#14b8a6' },
  [NODE_TYPES.ipSpriteMerge]: { label: 'Sheet 合成', icon: '▦', color: '#14b8a6' },
  [NODE_TYPES.ipPixelate]: { label: '像素化', icon: '🟦', color: '#14b8a6' },
  [NODE_TYPES.ipResizeNearest]: { label: '最近邻缩放', icon: '🔍', color: '#14b8a6' },
  [NODE_TYPES.ipInnerStroke]: { label: '内描边', icon: '✏️', color: '#14b8a6' },
  [NODE_TYPES.ipChromaKey]: { label: '色度键抠图', icon: '✂️', color: '#14b8a6' },
  [NODE_TYPES.ipWhiteKey]: { label: '白底抠图', icon: '⚪', color: '#14b8a6' },
  [NODE_TYPES.ipComposeOverlay]: { label: '图层叠加', icon: '🧬', color: '#14b8a6' },
  [NODE_TYPES.ipEnhance]: { label: '图片放大', icon: '🔼', color: '#14b8a6' },
  [NODE_TYPES.ipCompress]: { label: '图片压缩', icon: '🗜️', color: '#14b8a6' },
  [NODE_TYPES.imageEditor]: { label: '图片编辑', icon: '🎨', color: '#f97316' },
  [NODE_TYPES.pixelEditor]: { label: '像素编辑器', icon: '👾', color: '#22c55e' },
  [NODE_TYPES.uiSplitter]: { label: '雪碧图拆分', icon: '🧩', color: '#0ea5e9' },
  [NODE_TYPES.bboxViewer]: { label: 'UI拆分', icon: '📦', color: '#eab308' },
  [NODE_TYPES.textToVoice]: { label: '生成配音', icon: '🔊', color: '#a855f7' },
  [NODE_TYPES.videoGenerator]: { label: '生成视频', icon: '🎬', color: '#ef4444' },
  [NODE_TYPES.imageCompare]: { label: '图片对比', icon: '🔀', color: '#06b6d4' },
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
  pixelEditor: '像素',
  uiSplitter: '雪碧图拆分',
  bboxViewer: 'UI拆分',
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
  { id: 'enhance', label: '画质增强', icon: '🔍' },
  { id: 'compress', label: '图片压缩', icon: '🗜️' },
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
  // ---- 画质增强（云端 AI，走 image_enchanter 工作流）----
  {
    id: 'enhance', label: '图片放大', category: 'enhance', multipleIn: true, minInputs: 1,
    desc: '调用 image_enchanter 工作流云端 AI 放大（高清化），支持批量，非本地算法',
    params: [],
  },
  // ---- 图片压缩（browser-image-compression，本地浏览器端，Web Worker 不卡 UI）----
  // mode='size'：压缩到目标体积（maxSizeMB）。mode='dimensions'：缩放到最长边 ≤ maxWidthOrHeight。
  // format='jpeg'/'webp' 体积小、'png' 无损但大；quality 仅 jpeg/webp 有效。
  {
    id: 'compress', label: '图片压缩', category: 'compress', multipleIn: true, minInputs: 1,
    desc: '本地浏览器端压缩：按目标体积或目标尺寸缩放，支持 jpeg/webp/png 格式',
    params: [
      {
        key: 'mode', label: '压缩模式', type: 'select', default: 'size',
        options: [
          { value: 'size', label: '按体积' },
          { value: 'dimensions', label: '按尺寸' },
        ],
      },
      {
        key: 'maxSizeMB', label: '目标体积(MB)', type: 'number', default: 1, min: 0.01, max: 50, step: 0.1,
        showWhen: { key: 'mode', eq: 'size' },
      },
      {
        key: 'maxWidthOrHeight', label: '最长边(px)', type: 'number', default: 1920, min: 16, max: 8192,
        showWhen: { key: 'mode', eq: 'dimensions' },
      },
      {
        key: 'format', label: '输出格式', type: 'select', default: 'jpeg',
        options: [
          { value: 'jpeg', label: 'JPEG（小）' },
          { value: 'webp', label: 'WebP（更小）' },
          { value: 'png', label: 'PNG（无损）' },
        ],
      },
      {
        key: 'quality', label: '质量(0-1)', type: 'number', default: 0.8, min: 0.1, max: 1, step: 0.05,
        showWhen: { key: 'format', in: ['jpeg', 'webp'] },
      },
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

// ============ BBox AI 分析（agent_run）============
// Agent preset 初始名称（openAgentEditor 用）；系统提示词在 preset 内配置（openAgentEditor 弹窗里编辑）
export const BBOX_AGENT_INIT_NAME = 'BBox 检测器';

// 默认系统提示词（作为 openAgentEditor 的 initialPrompt，用户可在 preset 弹窗里改）
export const BBOX_AI_SYSTEM_PROMPT = `# Role
你是一个精准的 UI/游戏界面检测与资产标记 AI。你的任务是分析输入的界面图像，定位其中的各类 UI 元素与游戏组件，并输出标准严格的 JSON 数据。

# Task Instructions
对输入图像中的所有 UI 元素、角色、数值及文本进行检测与层级识别，生成包含坐标、属性、OCR文本和父子关系的完整树状 JSON 结构。

# Rules & Logic

1. **顶级结构 (Top-Level Structure):**
   - 必须包含顶层配置信息：
     - \`title\`: 根据图片内容生成一个简洁准确的界面标题（如 \`"游戏战斗界面"\`、\`"主城 UI 布局"\` 等）。
     - \`elements\`: 包含所有顶层 UI 节点的数组。

2. **元素字段与属性映射 (Element Fields & Attribute Mapping):**
   每个元素节点必须包含以下字段：
   - \`id\`: 唯一标识符，格式为 \`det-X\`（其中 X 为递增数字，如 \`det-0\`, \`det-1\` ...）。
   - \`type\`: 元素类型，必须从以下限定集合中选择：
     \`"Panel"\`, \`"Button"\`, \`"Image"\`, \`"Text"\`, \`"Icon"\`, \`"HealthBar"\`, \`"Character"\`
   - \`label\`: 英文描述标签，简要说明该元素功能（如 \`"player info panel"\`, \`"gold icon"\`, \`"attack button"\` 等）。
   - \`coords\`: 边界框坐标数组，格式为 \`[x, y, width, height]\`（像素值）：
     - \`x\`: 左上角横坐标
     - \`y\`: 左上角纵坐标
     - \`width\`: 宽度
     - \`height\`: 高度
   - \`parentId\`: 父节点的 \`id\`（若为顶层根节点，则为 \`null\`；若为嵌套子节点，填入父节点 ID）。
   - \`exportSlice\`: 布尔值 (\`true\` 或 \`false\`)。独立切片资产（如按钮、图标、角色、独立图片/卡片）设为 \`true\`；容器面板、纯文本和血条等动态 UI 设为 \`false\`。
   - \`ocrText\` (仅针对包含文本的元素，可选): 识别到的实际文本内容（如 \`"艾尔文 Lv. 24"\`, \`"1280/1280"\`, \`"攻击"\`）。
   - \`textRole\` (仅针对包含文本/OCR的元素，可选):
     - \`"dynamic"\`: 动态数据/数值文本（如名字、等级、血量数值、货币数量、伤害统计等）。
     - \`"decorative"\`: 静态/装饰性/按钮文本（如关卡名、按钮文字等）。
   - \`children\` (可选): 若该元素包含内部组件，递归嵌入子元素列表，形成树状结构。

3. **嵌套与层级规则 (Hierarchy Rules):**
   - 面板 (Panel)、复杂按钮 (Button) 或角色 (Character) 等内部若包含细分元素（如面板内的文字、图标、子血条），必须放入父元素的 \`children\` 数组中。
   - 子元素中的 \`parentId\` 必须与其父元素的 \`id\` 一致。

# Output Format
仅输出纯 JSON 格式数据，请勿包含 markdown 以外的多余解释性文字。`;

// 默认用户提示词（图片以 base64 附件形式传给 AI，不嵌 prompt 文本）
export const BBOX_AI_USER_PROMPT = `请分析这张界面图像，按系统提示词的 JSON schema 输出检测结果。`;

