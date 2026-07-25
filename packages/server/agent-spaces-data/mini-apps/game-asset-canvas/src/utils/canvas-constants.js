/**
 * Canvas 专用常量与纯函数（从 Canvas.jsx 抽出）。
 *
 * 包括：节点类型→渲染组件映射、右键/落空菜单节点清单、默认尺寸、
 * 各节点初始 data、面板布局常量、tags 去重。
 *
 * 注意：NODE_COMPONENTS import 所有节点组件，本文件是 Canvas 的「依赖聚合点」。
 */
import {
  NODE_TYPES, NODE_TYPE_TO_PROCESSOR, defaultProcessorParams, isImageProcessNodeType,
  DEFAULT_CUTOUT_MODE, defaultCutoutParams,
} from './constants';

import TextToImageNode from '../components/nodes/TextToImageNode';
import EditImageNode from '../components/nodes/EditImageNode';
import ImageDisplayNode from '../components/nodes/ImageDisplayNode';
import ImageProcessNode from '../components/nodes/ImageProcessNode';
import ImageEditorNode from '../components/nodes/ImageEditorNode';
import PixelEditorNode from '../components/nodes/PixelEditorNode';
import UiSplitterNode from '../components/nodes/UiSplitterNode';
import BBoxViewerNode from '../components/nodes/BBoxViewerNode';
import PromptReverseNode from '../components/nodes/PromptReverseNode';
import TextToVoiceNode from '../components/nodes/TextToVoiceNode';
import VideoGeneratorNode from '../components/nodes/VideoGeneratorNode';
import ImageCompareNode from '../components/nodes/ImageCompareNode';
import CutoutNode from '../components/nodes/CutoutNode';
import NoteNode from '../components/nodes/NoteNode';

// 节点类型 -> 渲染组件
export const NODE_COMPONENTS = {
  [NODE_TYPES.textToImage]: TextToImageNode,
  [NODE_TYPES.editImage]: EditImageNode,
  [NODE_TYPES.imageDisplay]: ImageDisplayNode,
  [NODE_TYPES.imageProcess]: ImageProcessNode,
  // 拆分后的 12 个图像处理节点全部复用 ImageProcessNode（按 nodeType 反查 processorId）
  [NODE_TYPES.ipGifSplit]: ImageProcessNode,
  [NODE_TYPES.ipGifMerge]: ImageProcessNode,
  [NODE_TYPES.ipSpriteSplit]: ImageProcessNode,
  [NODE_TYPES.ipSpriteMerge]: ImageProcessNode,
  [NODE_TYPES.ipPixelate]: ImageProcessNode,
  [NODE_TYPES.ipResizeNearest]: ImageProcessNode,
  [NODE_TYPES.ipInnerStroke]: ImageProcessNode,
  [NODE_TYPES.ipChromaKey]: ImageProcessNode,
  [NODE_TYPES.ipWhiteKey]: ImageProcessNode,
  [NODE_TYPES.ipComposeOverlay]: ImageProcessNode,
  [NODE_TYPES.ipEnhance]: ImageProcessNode,
  [NODE_TYPES.ipCompress]: ImageProcessNode,
  [NODE_TYPES.imageEditor]: ImageEditorNode,
  [NODE_TYPES.pixelEditor]: PixelEditorNode,
  [NODE_TYPES.uiSplitter]: UiSplitterNode,
  [NODE_TYPES.bboxViewer]: BBoxViewerNode,
  [NODE_TYPES.promptReverse]: PromptReverseNode,
  [NODE_TYPES.textToVoice]: TextToVoiceNode,
  [NODE_TYPES.videoGenerator]: VideoGeneratorNode,
  [NODE_TYPES.imageCompare]: ImageCompareNode,
  [NODE_TYPES.cutout]: CutoutNode,
  [NODE_TYPES.note]: NoteNode,
};

// 右键菜单 / 落空菜单的节点类型列表（与 RightPanel 新增节点 tab 保持一致）
export const ADD_NODE_ITEMS = [
  { type: NODE_TYPES.textToImage },
  { type: NODE_TYPES.editImage },
  { type: NODE_TYPES.imageDisplay },
  // 12 个图像处理节点
  { type: NODE_TYPES.ipGifSplit },
  { type: NODE_TYPES.ipGifMerge },
  { type: NODE_TYPES.ipSpriteSplit },
  { type: NODE_TYPES.ipSpriteMerge },
  { type: NODE_TYPES.ipPixelate },
  { type: NODE_TYPES.ipResizeNearest },
  { type: NODE_TYPES.ipInnerStroke },
  { type: NODE_TYPES.ipComposeOverlay },
  { type: NODE_TYPES.ipEnhance },
  { type: NODE_TYPES.ipCompress },
  { type: NODE_TYPES.imageEditor },
  { type: NODE_TYPES.pixelEditor },
  { type: NODE_TYPES.uiSplitter },
  { type: NODE_TYPES.bboxViewer },
  { type: NODE_TYPES.promptReverse },
  { type: NODE_TYPES.textToVoice },
  { type: NODE_TYPES.videoGenerator },
  { type: NODE_TYPES.imageCompare },
  { type: NODE_TYPES.cutout },
  { type: NODE_TYPES.note },
];

// 各节点默认尺寸（NodeResizer 需要节点有显式 width/height）
export const DEFAULT_SIZE = {
  [NODE_TYPES.note]: { w: 200, h: 120 },
  [NODE_TYPES.imageDisplay]: { w: 260, h: 240 },
  [NODE_TYPES.pixelEditor]: { w: 300, h: 260 },
  [NODE_TYPES.uiSplitter]: { w: 290, h: 240 },
  [NODE_TYPES.bboxViewer]: { w: 290, h: 240 },
  [NODE_TYPES.promptReverse]: { w: 320, h: 280 },
  [NODE_TYPES.videoGenerator]: { w: 300, h: 320 },
  [NODE_TYPES.cutout]: { w: 290, h: 260 },
  default: { w: 290, h: 240 },
};

// 默认面板布局（react-resizable-panels@4: Layout = { [panelId]: percentage }）
export const PANEL_ID_MAIN = 'canvas-main';
export const PANEL_ID_RIGHT = 'canvas-right';
export const DEFAULT_PANEL_LAYOUT = { [PANEL_ID_MAIN]: 72, [PANEL_ID_RIGHT]: 28 };

// tags 去重保序（图片展示节点 data.tags 用）
export function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags || []) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// 每种节点的初始 data
export function initialData(type) {
  if (type === NODE_TYPES.note) return { text: '' };
  if (type === NODE_TYPES.imageDisplay) return { images: [], source: '' };
  if (type === NODE_TYPES.imageProcess) {
    return {
      status: 'idle',
      output: { images: [] },
      uploadedImages: [],
      params: { processor: 'pixelate', processorParams: defaultProcessorParams('pixelate') },
    };
  }
  // 拆分后的图像处理节点：按 nodeType 反查 processorId 生成初始 params
  if (isImageProcessNodeType(type)) {
    const processorId = NODE_TYPE_TO_PROCESSOR[type];
    return {
      status: 'idle',
      output: { images: [] },
      uploadedImages: [],
      upstreamOrder: [],
      params: { processor: processorId, processorParams: defaultProcessorParams(processorId) },
    };
  }
  if (type === NODE_TYPES.imageEditor) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  if (type === NODE_TYPES.pixelEditor) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  if (type === NODE_TYPES.uiSplitter) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  if (type === NODE_TYPES.bboxViewer) {
    return { status: 'idle', output: { images: [] }, uploadedImages: [] };
  }
  if (type === NODE_TYPES.promptReverse) {
    // 反推提示词：多图输入，产出是文本（output.text）
    return {
      status: 'idle',
      output: { text: '' },
      uploadedImages: [],
      upstreamOrder: [],
      statusMsg: '',
    };
  }
  if (type === NODE_TYPES.imageCompare) {
    // 双槽位：first/second 各自独立支持上传 + 连线首张；连线图统一进 data.images（按序分槽位）
    return { status: 'idle', first: { uploadedImages: [] }, second: { uploadedImages: [] } };
  }
  if (type === NODE_TYPES.cutout) {
    // 统一抠图节点：mode（默认白底）+ modeParams（随 mode 切换重置）+ 多图输入
    return {
      status: 'idle',
      output: { images: [] },
      uploadedImages: [],
      upstreamOrder: [],
      params: { mode: DEFAULT_CUTOUT_MODE, modeParams: defaultCutoutParams(DEFAULT_CUTOUT_MODE) },
    };
  }
  if (type === NODE_TYPES.textToVoice) {
    return { status: 'idle', output: { audio: null }, params: { prompt: '', model: 'fish-audio', voiceId: '' } };
  }
  if (type === NODE_TYPES.videoGenerator) {
    return {
      status: 'idle',
      output: { video: null },
      uploadedImages: [],
      upstreamOrder: [],
      params: { prompt: '', model: '', aspect: '16:9', quality: '720', duration: '5' },
    };
  }
  const base = { status: 'idle', output: { images: [] }, uploadedImages: [] };
  return { ...base, params: { prompt: '', model: 'gpt-image-1', aspect: '1:1', size: '1k' } };
}
