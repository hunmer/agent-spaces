/**
 * 多选节点对齐分布的坐标计算（纯函数）。
 *
 * 从 Canvas.jsx 的 alignDistribute 抽出算法部分。组件层只剩 setNodes 应用结果。
 *
 * mode: left/right/top/bottom/center-h/center-v（对齐）| h-dist/v-dist（等距分布）
 * 节点宽高取 style 或顶层 width/height（NodeResizer 要求），兜底 200x100。
 *
 * @param {Array} selectedNodes 已选中的节点（n.selected === true）
 * @param {string} mode 对齐/分布模式
 * @returns {Map<string, {x?:number, y?:number}>} nodeId -> 需更新的新坐标（只含变化的轴）
 */
export function computeAlignment(selectedNodes, mode) {
  if (!selectedNodes || selectedNodes.length < 2) return new Map();

  const nodeSize = (n) => ({
    w: n.width || n.style?.width || 200,
    h: n.height || n.style?.height || 100,
  });

  const result = new Map();
  const ids = new Set(selectedNodes.map((n) => n.id));
  const apply = (fn) => {
    selectedNodes.forEach((n) => {
      const pos = fn(n);
      if (pos) result.set(n.id, pos);
    });
  };

  if (mode === 'left') {
    const m = Math.min(...selectedNodes.map((n) => n.position.x));
    apply((n) => ({ x: m, y: n.position.y }));
  } else if (mode === 'right') {
    const m = Math.min(...selectedNodes.map((n) => n.position.x + nodeSize(n).w));
    apply((n) => ({ x: m - nodeSize(n).w, y: n.position.y }));
  } else if (mode === 'top') {
    const m = Math.min(...selectedNodes.map((n) => n.position.y));
    apply((n) => ({ x: n.position.x, y: m }));
  } else if (mode === 'bottom') {
    const m = Math.max(...selectedNodes.map((n) => n.position.y + nodeSize(n).h));
    apply((n) => ({ x: n.position.x, y: m - nodeSize(n).h }));
  } else if (mode === 'center-h') {
    const m = selectedNodes.reduce((s, n) => s + n.position.x + nodeSize(n).w / 2, 0) / selectedNodes.length;
    apply((n) => ({ x: m - nodeSize(n).w / 2, y: n.position.y }));
  } else if (mode === 'center-v') {
    const m = selectedNodes.reduce((s, n) => s + n.position.y + nodeSize(n).h / 2, 0) / selectedNodes.length;
    apply((n) => ({ x: n.position.x, y: m - nodeSize(n).h / 2 }));
  } else if (mode === 'h-dist') {
    // 水平等距分布：按 x 排序，首尾不动，中间均分
    const sorted = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = first.position.x + nodeSize(first).w;
    const end = last.position.x;
    const span = end - start;
    const gap = sorted.length > 2 ? span / (sorted.length - 1) : 0;
    let cursor = start;
    sorted.forEach((n, i) => {
      if (i === 0 || i === sorted.length - 1) return;
      result.set(n.id, { x: cursor, y: n.position.y });
      cursor += gap + nodeSize(n).w;
    });
  } else if (mode === 'v-dist') {
    const sorted = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const start = first.position.y + nodeSize(first).h;
    const end = last.position.y;
    const span = end - start;
    const gap = sorted.length > 2 ? span / (sorted.length - 1) : 0;
    let cursor = start;
    sorted.forEach((n, i) => {
      if (i === 0 || i === sorted.length - 1) return;
      result.set(n.id, { x: n.position.x, y: cursor });
      cursor += gap + nodeSize(n).h;
    });
  }
  return result;
}
