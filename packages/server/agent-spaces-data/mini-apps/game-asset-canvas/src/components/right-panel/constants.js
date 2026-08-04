// 右侧面板共享常量：节点分类、新增节点清单、可执行类型集合、卡片网格参数。
// 单一数据源：ADD_ITEMS 的 category 字段同时驱动 AddNodeTab 分组与 HistoryTab 分类筛选。
import { NODE_TYPES, NODE_TYPE_TO_PROCESSOR } from '../../utils/constants';

// 节点分类（顶部 chips 筛选用）。category 字段同步打到 ADD_ITEMS 每项。
export const NODE_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'generate', label: '生成' },
  { id: 'image-process', label: '图像处理' },
  { id: 'edit', label: '编辑' },
  { id: 'media', label: '媒体' },
  { id: 'util', label: '工具' },
];

export const ADD_ITEMS = [
  // 生成
  { type: NODE_TYPES.textToImage, label: '文生图', category: 'generate' },
  { type: NODE_TYPES.editImage, label: '图生图', category: 'generate' },
  { type: NODE_TYPES.storyboard, label: '分镜创作', category: 'generate' },
  // 工具
  { type: NODE_TYPES.text, label: '文字', category: 'util' },
  { type: NODE_TYPES.imageDisplay, label: '图片展示', category: 'util' },
  // 图像处理（按单个处理器拆分为 12 个独立节点）
  { type: NODE_TYPES.ipGifSplit, label: 'GIF 拆帧', category: 'image-process' },
  { type: NODE_TYPES.ipGifMerge, label: 'GIF 合成', category: 'image-process' },
  { type: NODE_TYPES.ipSpriteSplit, label: 'Sheet 拆分', category: 'image-process' },
  { type: NODE_TYPES.ipSpriteMerge, label: 'Sheet 合成', category: 'image-process' },
  { type: NODE_TYPES.ipPixelate, label: '像素化', category: 'image-process' },
  { type: NODE_TYPES.ipResizeNearest, label: '最近邻缩放', category: 'image-process' },
  { type: NODE_TYPES.ipInnerStroke, label: '内描边', category: 'image-process' },
  { type: NODE_TYPES.ipComposeOverlay, label: '图层叠加', category: 'image-process' },
  { type: NODE_TYPES.ipEnhance, label: '图片放大', category: 'image-process' },
  { type: NODE_TYPES.ipCompress, label: '图片压缩', category: 'image-process' },
  { type: NODE_TYPES.depthExtract, label: '提取深度图', category: 'image-process' },
  // 编辑
  { type: NODE_TYPES.imageEditor, label: '图片编辑器', category: 'edit' },
  { type: NODE_TYPES.pixelEditor, label: '像素编辑器', category: 'edit' },
  { type: NODE_TYPES.cutout, label: '抠图', category: 'edit' },
  { type: NODE_TYPES.promptReverse, label: '反推提示词', category: 'edit' },
  { type: NODE_TYPES.directorDesk, label: '3D导演台', category: 'edit' },
  { type: NODE_TYPES.photopea, label: '在线PS', category: 'edit' },
  { type: NODE_TYPES.maskPaint, label: '蒙版绘制', category: 'edit' },
  { type: NODE_TYPES.spineEditor, label: '骨骼编辑器', category: 'edit' },
  { type: NODE_TYPES.spineDisplay, label: 'Spine展示', category: 'edit' },
  // 工具
  { type: NODE_TYPES.uiSplitter, label: '雪碧图拆分', category: 'util' },
  { type: NODE_TYPES.bboxViewer, label: 'UI拆分', category: 'util' },
  { type: NODE_TYPES.imageCompare, label: '图片对比', category: 'util' },
  { type: NODE_TYPES.workflowRunner, label: '执行工作流', category: 'util' },
  { type: NODE_TYPES.note, label: '便签', category: 'util' },
  // 媒体
  { type: NODE_TYPES.textToVoice, label: '生成配音', category: 'media' },
  { type: NODE_TYPES.videoGenerator, label: '生成视频', category: 'media' },
  { type: NODE_TYPES.videoDisplay, label: '视频展示', category: 'media' },
  { type: NODE_TYPES.audioDisplay, label: '音频展示', category: 'media' },
  { type: NODE_TYPES.videoEditor, label: '视频编辑器', category: 'media' },
];

// 可执行节点类型集合（与 NodeExecuteDialog.EXEC_KIND 对应）：文生图/编辑图片/反推提示词/
// 生成配音/生成视频/抠图 + 12 个 ip* 图像处理节点。这些节点卡片 hover 时右上角显示 ⚡ 图标，
// 点击打开执行对话框（不创建画布节点，产出只写生成记录）。
export const EXECUTABLE_TYPES = new Set([
  NODE_TYPES.textToImage,
  NODE_TYPES.editImage,
  NODE_TYPES.promptReverse,
  NODE_TYPES.textToVoice,
  NODE_TYPES.videoGenerator,
  NODE_TYPES.cutout,
  ...Object.keys(NODE_TYPE_TO_PROCESSOR),
]);

// 每张卡片最小宽度（px），用于响应式推算列数
export const MIN_CARD_WIDTH = 96;
// 列数范围：上限对齐最大分组项数（图像处理 12 项），面板足够宽时可整组一行展示；
// MIN_CARD_WIDTH 仍作为自然下限保护，避免卡片过窄。
export const MIN_COLS = 2;
export const MAX_COLS = 12;

// 连通分量着色板 —— bar 为色条实色，bg 为分区淡色背景。完整类名，供 Tailwind 静态扫描。
export const GROUP_PALETTE = [
  { bar: 'bg-blue-500', bg: 'bg-blue-500/10' },
  { bar: 'bg-emerald-500', bg: 'bg-emerald-500/10' },
  { bar: 'bg-amber-500', bg: 'bg-amber-500/10' },
  { bar: 'bg-purple-500', bg: 'bg-purple-500/10' },
  { bar: 'bg-rose-500', bg: 'bg-rose-500/10' },
  { bar: 'bg-cyan-500', bg: 'bg-cyan-500/10' },
  { bar: 'bg-orange-500', bg: 'bg-orange-500/10' },
  { bar: 'bg-pink-500', bg: 'bg-pink-500/10' },
];

/**
 * Union-Find 求无向连通分量，返回每个分量包含的节点 id 列表。
 * 用于「节点管理」tab 按连线关系自动分组展示。
 * 算法移植自 packages/web/src/components/workflow/workflow-node-list-panel.tsx。
 * @param {Array<{id:string}>} nodes
 * @param {Array<{source:string,target:string}>} edges
 * @returns {string[][]} 每个分量包含的节点 id 列表
 */
export function connectedComponents(nodes, edges) {
  const parent = new Map();
  const find = (x) => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      parent.set(cur, parent.get(parent.get(cur)));
      cur = parent.get(cur);
    }
    return cur;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const node of nodes) parent.set(node.id, node.id);
  for (const edge of edges) {
    if (parent.has(edge.source) && parent.has(edge.target)) union(edge.source, edge.target);
  }

  const buckets = new Map();
  for (const node of nodes) {
    const root = find(node.id);
    const list = buckets.get(root);
    if (list) list.push(node.id);
    else buckets.set(root, [node.id]);
  }
  return [...buckets.values()];
}
