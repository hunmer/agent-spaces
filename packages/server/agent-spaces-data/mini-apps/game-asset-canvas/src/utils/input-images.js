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
 * edge.data.inputTarget 可把图片路由到目标节点的其它 FileUpload；旧边默认进入 images。
 *
 * @returns {Map<string, {images: string[], fileUploads: Record<string, string[]>, isDisplay: boolean}>} nodeId -> 派生输入
 */
import { NODE_TYPES, isImageProcessNodeType } from './constants.js';
import {
  CONNECTION_INPUT_TYPES, DEFAULT_FILE_UPLOAD_TARGET, resolveFileUploadTarget,
} from './connection-targets.js';

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
    || type === NODE_TYPES.depthExtract
    || type === NODE_TYPES.directorDesk
    || type === NODE_TYPES.photopea
    || type === NODE_TYPES.maskPaint;

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
    const derived = derivedByNode.get(node.id);
    // 有连入边时 derived 是当前上游真值（包括空数组），必须覆盖历史/手动残留。
    if (derived !== undefined) return derived;
    return sd.images || [];
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
      const upstreamByTarget = {};
      for (const e of incoming) {
        const src = byId.get(e.source);
        if (!src) continue;
        const targetId = resolveFileUploadTarget(node.type, e.data?.inputTarget);
        if (!upstreamByTarget[targetId]) upstreamByTarget[targetId] = [];
        upstreamByTarget[targetId].push(...sourceImages(src, derived));
      }
      const upstream = upstreamByTarget[DEFAULT_FILE_UPLOAD_TARGET] || [];
      const fileUploads = Object.fromEntries(
        Object.entries(upstreamByTarget).filter(([targetId]) => targetId !== DEFAULT_FILE_UPLOAD_TARGET),
      );
      const prev = derived.get(node.id);
      map.set(node.id, {
        images: upstream,
        fileUploads,
        isDisplay: node.type === NODE_TYPES.imageDisplay,
      });
      if (!prev || prev.join('|') !== upstream.join('|')) {
        derived.set(node.id, upstream);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return map;
}

/**
 * 把富文本（tiptap/HTML）产物转成纯文本：剥离 HTML 标签、块级元素补换行、解码实体、合并空白。
 * 兼容普通文本（无标签时原样返回）。运行在浏览器侧，用 DOMParser 解析最稳。
 */
function htmlToPlainText(html) {
  if (!html) return '';
  // 快速判断：完全不含 < > 视为纯文本，直接返回（避免 DOMParser 开销）
  if (!/[<>]/.test(html)) return html;
  if (typeof DOMParser === 'undefined') {
    // SSR / 测试环境兜底：粗暴去标签 + 实体
    return html.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // 块级元素前补换行，保证段落/标题边界
  const BLOCK = 'P,DIV,H1,H2,H3,H4,H5,H6,LI,BR,BLOCKQUOTE,PRE,TR';
  doc.querySelectorAll(BLOCK.split(',').join(',')).forEach((el) => el.prepend('\n'));
  const text = doc.body.textContent || '';
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 把文本产物按 edge.data.inputTarget 派生到目标节点参数。
 * 返回值与持久化 params 分离，避免引用关系被表单更新复制进节点数据。
 * 注意：上游文本节点（MarkdownEditor）产出的是 HTML，注入下游提示词前必须纯文本化（htmlToPlainText）。
 */
export function computeInputTexts(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const valuesByTarget = new Map();

  for (const edge of edges) {
    if (edge.data?.inputType !== CONNECTION_INPUT_TYPES.text || !edge.data?.inputTarget) continue;
    const sourceText = byId.get(edge.source)?.data?.output?.text;
    if (typeof sourceText !== 'string' || !sourceText.trim()) continue;
    if (!valuesByTarget.has(edge.target)) valuesByTarget.set(edge.target, {});
    const targetValues = valuesByTarget.get(edge.target);
    if (!targetValues[edge.data.inputTarget]) targetValues[edge.data.inputTarget] = [];
    targetValues[edge.data.inputTarget].push(htmlToPlainText(sourceText));
  }

  return new Map(Array.from(valuesByTarget, ([nodeId, fields]) => [
    nodeId,
    Object.fromEntries(Object.entries(fields).map(([field, values]) => [
      field,
      Array.from(new Set(values)).join('\n\n'),
    ])),
  ]));
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
  const VIDEO_RECEIVER_TYPES = new Set([NODE_TYPES.videoDisplay, NODE_TYPES.videoGenerator, NODE_TYPES.videoEditor]);
  const VIDEO_PASSTHROUGH_TYPES = new Set([NODE_TYPES.videoDisplay, NODE_TYPES.videoEditor]);

  // 取某节点「作为 source 时应给出的产出视频」
  const sourceVideos = (node, derivedByNode) => {
    const sd = node.data || {};
    const outVideos = Array.isArray(sd.output?.videos) ? sd.output.videos
      : (sd.output?.video ? [sd.output.video] : []);
    if (outVideos.length) return outVideos;
    if (!VIDEO_PASSTHROUGH_TYPES.has(node.type)) return [];
    const derived = derivedByNode.get(node.id);
    const own = Array.isArray(sd.videos) ? sd.videos : [];
    if (derived === undefined) return own;
    // videoEditor 的节点语义是保留用户上传并合并上游；videoDisplay 则完全透传上游。
    return node.type === NODE_TYPES.videoEditor
      ? Array.from(new Set([...own, ...derived]))
      : derived;
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

/**
 * 计算 Spine 三件套的派生转发（与 computeInputImages/computeInputVideos 对称的第三套）。
 *
 * spineAssets 是一个对象 { skel, atlas, png, name }，非数组。
 * - 源产出：spineDisplay/spineEditor 的 data.spineAssets（三件套 URL）
 * - 接收器：spineDisplay（透传，可串联预览）/ spineEditor（自动填充三件套）
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Map<string, {spineAssets: object|null, isDisplay: boolean}>} nodeId -> 派生输入
 */
export function computeInputSpineAssets(nodes, edges) {
  const SPINE_RECEIVER_TYPES = new Set([NODE_TYPES.spineDisplay, NODE_TYPES.spineEditor]);
  const SPINE_PASSTHROUGH_TYPES = new Set([NODE_TYPES.spineDisplay]);

  // 取某节点「作为 source 时应给出的 spineAssets」
  const sourceSpineAssets = (node, derivedByNode) => {
    const sd = node.data || {};
    if (sd.spineAssets?.skel && sd.spineAssets?.atlas && sd.spineAssets?.png) return sd.spineAssets;
    if (!SPINE_PASSTHROUGH_TYPES.has(node.type)) return null;
    return derivedByNode.get(node.id) || null;
  };

  const incomingByTarget = new Map();
  for (const e of edges) {
    if (!incomingByTarget.has(e.target)) incomingByTarget.set(e.target, []);
    incomingByTarget.get(e.target).push(e);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const map = new Map();
  const derived = new Map();

  const assetsKey = (a) => (a ? `${a.skel}|${a.atlas}|${a.png}` : '');

  for (let iter = 0; iter < nodes.length; iter++) {
    let changed = false;
    for (const node of nodes) {
      if (!SPINE_RECEIVER_TYPES.has(node.type)) continue;
      const incoming = incomingByTarget.get(node.id);
      if (!incoming || !incoming.length) continue;
      // 三件套是整体，取首个有效上游（不像 images/videos 做数组聚合）
      let upstreamAssets = null;
      for (const e of incoming) {
        const src = byId.get(e.source);
        if (!src) continue;
        const a = sourceSpineAssets(src, derived);
        if (a) { upstreamAssets = a; break; }
      }
      const prev = derived.get(node.id);
      if (assetsKey(prev) !== assetsKey(upstreamAssets)) {
        derived.set(node.id, upstreamAssets);
        map.set(node.id, { spineAssets: upstreamAssets, isDisplay: node.type === NODE_TYPES.spineDisplay });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return map;
}
