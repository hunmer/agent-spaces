/**
 * 基于 nodes/edges 拓扑计算每个「图片接收节点」的输入图片（纯函数）。
 *
 * 从 Canvas.jsx 抽出。参考 https://reactflow.dev/learn/advanced-use/computing-flows ：
 * 图是派生数据，nodes/edges 是真值。
 *
 * - 有连入边：input = 所有 source 节点产出图（output.images 优先，回退 data.images），覆盖手动值
 * - 无连入边：不注入，保留节点自身 data.images（手动粘贴/上传）
 *
 * 这样连线 / 断开 / 上游重新生成 / 上游后上传 都能自动反映，无需在 onConnect 里手工推。
 *
 * 🔴 多跳转发（fixed-point 迭代）：receiver 节点（如 imageDisplay）收到上游图后，
 * 这些派生图只活在 decoratedNodes.data 里，不会回写 node.data 真值。当该 receiver 再作为
 * source 连给更下游时，单遍计算会读 node.data 真值取到空 → 下游收不到图。
 * 故迭代到稳定：每轮把上一轮的派生结果并进 source 视图，直到不再变化（最多 nodes.length 轮）。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Map<string, {images: string[], isDisplay: boolean}>} nodeId -> 派生输入
 */
import { NODE_TYPES, isImageProcessNodeType } from './constants';

export function computeInputImages(nodes, edges) {
  const isReceiverType = (type) => type === NODE_TYPES.editImage
    || type === NODE_TYPES.imageDisplay
    || type === NODE_TYPES.imageProcess
    || isImageProcessNodeType(type) // 拆分后的 12 个图像处理节点
    || type === NODE_TYPES.imageEditor
    || type === NODE_TYPES.pixelEditor
    || type === NODE_TYPES.uiSplitter
    || type === NODE_TYPES.bboxViewer
    || type === NODE_TYPES.promptReverse
    || type === NODE_TYPES.videoGenerator
    || type === NODE_TYPES.imageCompare
    || type === NODE_TYPES.cutout
    || type === NODE_TYPES.directorDesk
    || type === NODE_TYPES.photopea;

  // 透传类节点：产出 = 输入（如 imageDisplay 仅展示转发，无独立执行动作）。
  // 生成类节点（editImage/imageProcess/cutout/编辑器/拆分类等）未执行时不应把上游输入误当产出转发。
  const PASSTHROUGH_TYPES = new Set([NODE_TYPES.imageDisplay]);

  // 取某节点「作为 source 时应给出的产出图」：output.images 优先；
  // 仅透传类节点在无 output 时回退到 data.images / 上游派生图，生成类节点无 output 则返回空。
  // derivedByNode 允许把上一轮 receiver 的派生图并入视图（解决多跳转发）。
  const sourceImages = (node, derivedByNode) => {
    const sd = node.data || {};
    if (sd.output?.images?.length) return sd.output.images;
    if (!PASSTHROUGH_TYPES.has(node.type)) return [];
    const own = sd.images || [];
    const derived = derivedByNode.get(node.id);
    // 自身有手动图优先用；无手动图时才透传上游派生图（避免手动上传被连线图覆盖）
    return own.length ? own : (derived || []);
  };

  const incomingByTarget = new Map();
  for (const e of edges) {
    if (!incomingByTarget.has(e.target)) incomingByTarget.set(e.target, []);
    incomingByTarget.get(e.target).push(e);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const map = new Map(); // nodeId -> { images, isDisplay }
  const derived = new Map(); // 视图层累积的派生图（每轮并进 source 视图）

  // fixed-point：每轮重算所有 receiver 的派生图，并把派生结果并进下一轮的 source 视图。
  // 收敛上限 = nodes.length（最坏线性链）；每轮检测是否还有变化以提前退出。
  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const node of nodes) {
      if (!isReceiverType(node.type)) continue;
      const incoming = incomingByTarget.get(node.id);
      if (!incoming || !incoming.length) continue;
      const upstream = [];
      for (const e of incoming) {
        const src = byId.get(e.source);
        if (!src) continue;
        upstream.push(...sourceImages(src, derived));
      }
      const prev = derived.get(node.id);
      if (!prev || prev.join('|') !== upstream.join('|')) {
        derived.set(node.id, upstream);
        map.set(node.id, { images: upstream, isDisplay: node.type === NODE_TYPES.imageDisplay });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return map;
}

/**
 * 基于 nodes/edges 拓扑计算每个「视频接收节点」的输入视频（纯函数，对称 computeInputImages）。
 *
 * - 视频产出字段：output.videos 优先，降级 output.video（单值兼容 videoGenerator）
 * - 透传类节点（videoDisplay）无 output 时回退 data.videos / 上游派生视频
 * - receiver 含 videoDisplay（透传）+ videoGenerator（消费参考，非透传）
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Map<string, {videos: string[], isDisplay: boolean}>} nodeId -> 派生输入
 */
export function computeInputVideos(nodes, edges) {
  const VIDEO_RECEIVER_TYPES = new Set([NODE_TYPES.videoDisplay, NODE_TYPES.videoGenerator]);
  const VIDEO_PASSTHROUGH_TYPES = new Set([NODE_TYPES.videoDisplay]);

  // 取某节点「作为 source 时应给出的产出视频」
  const sourceVideos = (node, derivedByNode) => {
    const sd = node.data || {};
    const outVideos = Array.isArray(sd.output?.videos) ? sd.output.videos
      : (sd.output?.video ? [sd.output.video] : []);
    if (outVideos.length) return outVideos;
    if (!VIDEO_PASSTHROUGH_TYPES.has(node.type)) return [];
    const own = Array.isArray(sd.videos) ? sd.videos : [];
    const derived = derivedByNode.get(node.id);
    return own.length ? own : (derived || []);
  };

  const incomingByTarget = new Map();
  for (const e of edges) {
    if (!incomingByTarget.has(e.target)) incomingByTarget.set(e.target, []);
    incomingByTarget.get(e.target).push(e);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const map = new Map();
  const derived = new Map();

  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const node of nodes) {
      if (!VIDEO_RECEIVER_TYPES.has(node.type)) continue;
      const incoming = incomingByTarget.get(node.id);
      if (!incoming || !incoming.length) continue;
      const upstream = [];
      for (const e of incoming) {
        const src = byId.get(e.source);
        if (!src) continue;
        upstream.push(...sourceVideos(src, derived));
      }
      const prev = derived.get(node.id);
      if (!prev || prev.join('|') !== upstream.join('|')) {
        derived.set(node.id, upstream);
        map.set(node.id, { videos: upstream, isDisplay: node.type === NODE_TYPES.videoDisplay });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return map;
}
