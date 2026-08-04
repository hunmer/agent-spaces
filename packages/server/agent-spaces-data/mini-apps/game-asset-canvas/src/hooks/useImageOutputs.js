import { useCallback } from 'react';
import { NODE_TYPES, NODE_META, IMAGE_TAGS } from '../utils/constants';
import { DEFAULT_SIZE, dedupeTags, initialData } from '../utils/canvas-constants';
import { findFreePositions } from '../utils/layout';
import { genId } from '../utils/canvas-id';
import { getImageDisplayNodeSize, loadImageDimensions } from '../utils/image-display-size';

const DEFAULT_NODE_W = 280;
const DEFAULT_NODE_H = 220;

// 取节点的包围盒（position + width/height），用于布局避让
const nodeBox = (n, fallbackW, fallbackH) => ({
  x: n.position?.x ?? 0,
  y: n.position?.y ?? 0,
  width: n.width || n.measured?.width || fallbackW,
  height: n.height || n.measured?.height || fallbackH,
});

// 源节点右侧锚点（第一个新块的左上角候选位置）
const rightAnchorOf = (sourceNode, gap) => {
  const box = nodeBox(sourceNode, DEFAULT_NODE_W, DEFAULT_NODE_H);
  return { x: box.x + box.width + gap, y: box.y };
};

/**
 * 在给定 nodes 快照上为一组图片计算位置并构造新节点（不调用 setNodes）。
 * 位置用 findFreePositions 避让已有节点，保证互不重叠。
 *
 * @param {Array} prevNodes   当前画布已有节点（避让参考 + 追加基准）
 * @param {string[]} urls     图片 url
 * @param {object} opts
 *   - sourceNode: 来源节点（决定右侧锚点；缺省用画布左上角）
 *   - source:     来源标记
 *   - tags:       标签数组
 * @returns {{ additions: Array, positions: Array }} 新节点数组 + 对应位置
 */
function buildImageNodes(prevNodes, urls, opts) {
  if (!urls?.length) return { additions: [], positions: [] };
  const fallbackSize = DEFAULT_SIZE[NODE_TYPES.imageDisplay];
  const meta = NODE_META[NODE_TYPES.imageDisplay];
  const source = opts.source || 'queue';
  const tags = dedupeTags(opts.tags);
  const dimensions = opts.dimensions || [];
  const sizes = urls.map((_, i) => {
    const value = dimensions[i];
    return value ? getImageDisplayNodeSize(value.width, value.height) : fallbackSize;
  });
  const cellW = Math.max(...sizes.map((size) => size.w));
  const cellH = Math.max(...sizes.map((size) => size.h));
  const gap = 40;
  const anchor = opts.sourceNode
    ? rightAnchorOf(opts.sourceNode, gap)
    : { x: 420, y: 120 };
  const positions = findFreePositions(
    anchor, cellW, cellH, urls.length, prevNodes,
    { gap, direction: 'right', cols: Math.min(3, Math.max(1, urls.length)) },
  );
  const additions = urls.map((url, i) => {
    const size = sizes[i];
    return {
      id: genId(NODE_TYPES.imageDisplay),
      type: NODE_TYPES.imageDisplay,
      position: positions[i],
      width: size.w, height: size.h,
      style: { width: size.w, height: size.h },
      data: {
        ...initialData(NODE_TYPES.imageDisplay),
        images: [url],
        resources: [opts.resources?.[i] || { url, thumb: url }],
        source,
        tags,
        label: meta.label,
        ...(dimensions[i] ? { imageSize: dimensions[i] } : {}),
        ...(opts.autoSize === false ? { autoSize: false } : {}),
      },
    };
  });
  return { additions, positions };
}

/**
 * 视频版 buildImageNodes：构造 videoDisplay 节点（对称逻辑，data.videos 字段）。
 */
function buildVideoNodes(prevNodes, urls, opts) {
  if (!urls?.length) return { additions: [], positions: [] };
  const size = DEFAULT_SIZE[NODE_TYPES.videoDisplay];
  const meta = NODE_META[NODE_TYPES.videoDisplay];
  const source = opts.source || 'queue';
  const tags = dedupeTags(opts.tags);
  const gap = 40;
  const anchor = opts.sourceNode
    ? rightAnchorOf(opts.sourceNode, gap)
    : { x: 420, y: 120 };
  const positions = findFreePositions(
    anchor, size.w, size.h, urls.length, prevNodes,
    { gap, direction: 'right', cols: Math.min(3, Math.max(1, urls.length)) },
  );
  const additions = urls.map((url, i) => ({
    id: genId(NODE_TYPES.videoDisplay),
    type: NODE_TYPES.videoDisplay,
    position: positions[i],
    width: size.w, height: size.h,
    style: { width: size.w, height: size.h },
    data: {
      ...initialData(NODE_TYPES.videoDisplay),
      videos: [url],
      source,
      tags,
      label: meta.label,
    },
  }));
  return { additions, positions };
}

/**
 * 图片节点批量产出相关操作。
 * 从 Canvas.jsx 抽出（原 B7）。被 useExecutionQueue.onComplete（队列完成建图）
 * 和生成记录「用作输入」复用，故单独成 hook。
 *
 * 新增节点位置：在 sourceNode 右侧用 findFreePositions 找不重叠的空位（通用避让函数）。
 * 无 sourceNode 时退化为画布左上角网格排列。
 *
 * @param {object} deps
 * @param {Function} deps.setNodes
 * @param {Function} deps.setGroups
 * @returns {{ addImageNodesFromUrls, handleExportImages, addImageNodesGrouped }}
 */
export default function useImageOutputs({ setNodes, setGroups }) {
  // 队列任务完成后：每张图生成一个独立的图片展示节点（不分组）。
  // 有 sourceNode 时排在它右侧（避让已有节点），否则退化为画布左上角网格。
  // opts.sourceNode / opts.tags / opts.source
  const addImageNodesFromUrls = useCallback((urls, opts = {}) => {
    if (!urls?.length) return [];
    const nodeIds = urls.map(() => genId(NODE_TYPES.imageDisplay));
    Promise.all(urls.map(loadImageDimensions)).then((dimensions) => {
      setNodes((prev) => {
        const { additions } = buildImageNodes(prev, urls, { ...opts, dimensions });
        additions.forEach((node, i) => { node.id = nodeIds[i]; });
        return [...prev, ...additions];
      });
      setTimeout(() => opts.onAdded?.(nodeIds), 0);
    });
    return nodeIds;
  }, [setNodes]);

  // 批量加入图片节点并归组（一条 WorkflowGroup）。位置用 findFreePositions 避让。
  // 返回新建子节点 id 数组（供调用方做后续关联）。
  // opts: sourceNode / source / tags / groupName
  const addImageNodesGrouped = useCallback((urls, opts = {}) => {
    if (!urls?.length) return [];
    const childIds = urls.map(() => genId(NODE_TYPES.imageDisplay));
    Promise.all(urls.map(loadImageDimensions)).then((dimensions) => {
      setNodes((prev) => {
        // 分组节点创建时已按图片比例定好尺寸，禁止渲染后再次改变间距。
        const { additions } = buildImageNodes(prev, urls, { ...opts, dimensions, autoSize: false });
        additions.forEach((node, i) => { node.id = childIds[i]; });
        return [...prev, ...additions];
      });
      setTimeout(() => opts.onAdded?.(childIds), 0);
    });
    const srcLabel = opts.sourceNode ? (NODE_META[opts.sourceNode.type]?.label || '导出') : '导出';
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const groupName = opts.groupName || `${srcLabel} ${hh}:${mm}`;
    setGroups((prev) => [...prev, {
      id: genId('group'),
      name: groupName,
      childNodeIds: childIds,
      childGroupIds: [],
      locked: false,
      disabled: false,
      savedNodeStates: {},
    }]);
    return childIds;
  }, [setNodes, setGroups]);

  // —— 导出图片 ——
  // opts.groupName: 有值（含空字符串→走默认名）则创建分组；undefined 表示不分组（独立节点）。
  // 这样把「是否分组」的决定权交给调用方（Canvas 里经 GroupConfirmDialog 确认后再传）。
  // 单图强制不分组（原行为）。
  const handleExportImages = useCallback((sourceNode, imgs, opts = {}) => {
    if (!imgs?.length) return [];
    const tags = dedupeTags([IMAGE_TAGS.export]);
    const baseOpts = { sourceNode, tags, source: 'export', onAdded: opts.onAdded };
    // 单图：保持原行为，直接加一个独立图片节点（不分组）
    if (imgs.length === 1) {
      return addImageNodesFromUrls(imgs, baseOpts);
    }
    // 多图：由 opts.groupName 决定是否分组
    if (opts.groupName !== undefined) {
      return addImageNodesGrouped(imgs, { ...baseOpts, groupName: opts.groupName });
    }
    return addImageNodesFromUrls(imgs, baseOpts);
  }, [addImageNodesFromUrls, addImageNodesGrouped]);

  return { addImageNodesFromUrls, addImageNodesGrouped, handleExportImages };
}

/**
 * 视频节点批量产出相关操作（对称 useImageOutputs）。
 *
 * @param {object} deps
 * @param {Function} deps.setNodes
 * @returns {{ addVideoNodesFromUrls, handleExportVideos }}
 */
export function useVideoOutputs({ setNodes }) {
  const addVideoNodesFromUrls = useCallback((urls, opts = {}) => {
    if (!urls?.length) return;
    setNodes((prev) => {
      const { additions } = buildVideoNodes(prev, urls, opts);
      return [...prev, ...additions];
    });
  }, [setNodes]);

  // 导出视频到画布：单视频独立节点，多视频也独立节点（视频一般不分组成 WorkflowGroup）
  const handleExportVideos = useCallback((sourceNode, vids, opts = {}) => {
    if (!vids?.length) return;
    const tags = dedupeTags([IMAGE_TAGS.export]);
    addVideoNodesFromUrls(vids, { sourceNode, tags, source: 'export' });
  }, [addVideoNodesFromUrls]);

  return { addVideoNodesFromUrls, handleExportVideos };
}
