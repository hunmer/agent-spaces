/**
 * 多选节点对齐分布的坐标计算（纯函数）。
 *
 * - computeAlignment: 九宫格对齐（mode 形如 'top-left'/'middle-center'/'bottom-right'）
 * - computeGridLayout: 按「最上游优先」拓扑序铺成 rows × cols 网格
 *
 * 节点宽高取 style 或顶层 width/height（NodeResizer 要求），兜底 200x100。
 */

// 节点尺寸兜底
const nodeSize = (n) => ({
  w: n.width || n.style?.width || 200,
  h: n.height || n.style?.height || 100,
});

// 九宫格 mode 解析：'top-left' → { vertical:'top', horizontal:'left' }
const V_MAP = { top: 'top', middle: 'middle', bottom: 'bottom' };
const H_MAP = { left: 'left', center: 'center', right: 'right' };
function parseMode(mode) {
  const [v, h] = String(mode || '').split('-');
  return { vertical: V_MAP[v] || null, horizontal: H_MAP[h] || null };
}

/**
 * 九宫格对齐：把选中节点的水平/垂直边缘对齐到选中区域的九个方位之一。
 * 修正了旧实现「右对齐」误用 min 的 bug（右对齐应贴最右边缘）。
 *
 * @param {Array} selectedNodes
 * @param {string} mode 'top-left' | 'top-center' | 'top-right' | 'middle-left' | ... | 'bottom-right'
 * @returns {Map<string, {x:number, y:number}>} nodeId -> 新坐标
 */
export function computeAlignment(selectedNodes, mode) {
  if (!selectedNodes || selectedNodes.length < 2) return new Map();
  const { vertical, horizontal } = parseMode(mode);
  if (!vertical && !horizontal) return new Map();

  const sizes = selectedNodes.map(nodeSize);
  const minLeft = Math.min(...selectedNodes.map((n) => n.position.x));
  const maxRight = Math.max(...selectedNodes.map((n, i) => n.position.x + sizes[i].w));
  const minTop = Math.min(...selectedNodes.map((n) => n.position.y));
  const maxBottom = Math.max(...selectedNodes.map((n, i) => n.position.y + sizes[i].h));
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;

  const result = new Map();
  selectedNodes.forEach((n, i) => {
    const { w, h } = sizes[i];
    let { x, y } = n.position;
    if (horizontal === 'left') x = minLeft;
    else if (horizontal === 'center') x = centerX - w / 2;
    else if (horizontal === 'right') x = maxRight - w;
    if (vertical === 'top') y = minTop;
    else if (vertical === 'middle') y = centerY - h / 2;
    else if (vertical === 'bottom') y = maxBottom - h;
    result.set(n.id, { x, y });
  });
  return result;
}

/**
 * 选中节点子集内的拓扑排序（Kahn）：最上游（子集内入度 0）优先。
 * 只统计 source/target 都在选中集内的边；同层按 (y, x) 稳定排序，
 * 使结果确定且贴合当前视觉。有环时剩余节点按位置兜底补在末尾。
 */
export function topoSortSelected(selectedNodes, edges) {
  const ids = new Set(selectedNodes.map((n) => n.id));
  const inDeg = new Map();
  const adj = new Map();
  for (const id of ids) { inDeg.set(id, 0); adj.set(id, []); }
  for (const e of edges || []) {
    if (ids.has(e.source) && ids.has(e.target)) {
      adj.get(e.source).push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) || 0) + 1);
    }
  }
  const byPos = (a, b) => a.position.y - b.position.y || a.position.x - b.position.x;
  const seen = new Set();
  const order = [];
  let layer = selectedNodes.filter((n) => inDeg.get(n.id) === 0).sort(byPos);
  while (layer.length) {
    const next = new Set();
    for (const n of layer) {
      seen.add(n.id);
      order.push(n);
      for (const t of adj.get(n.id)) {
        inDeg.set(t, inDeg.get(t) - 1);
        if (inDeg.get(t) === 0 && !seen.has(t)) next.add(t);
      }
    }
    layer = selectedNodes.filter((n) => next.has(n.id)).sort(byPos);
  }
  // 环兜底：未访问节点按位置补尾
  for (const n of selectedNodes) if (!seen.has(n.id)) order.push(n);
  return order;
}

/**
 * 网格分布：按拓扑序（最上游优先）把节点铺成 rows × cols 网格。
 * 单元格统一取选中节点最大宽高，节点在各自单元格内居中；
 * gapX/gapY 为列间/行间间距；锚点取选中节点最小 x/y，保持整体位置不大幅跳动。
 * 超出 rows×cols 容量的节点保持原位（尊重用户指定的行列）。
 *
 * @returns {Map<string, {x:number, y:number}>} nodeId -> 新坐标
 */
export function computeGridLayout(selectedNodes, edges, { rows, cols, gapX, gapY }) {
  if (!selectedNodes || selectedNodes.length < 2) return new Map();
  const order = topoSortSelected(selectedNodes, edges);
  const sizes = order.map(nodeSize);
  const cellW = Math.max(...sizes.map((s) => s.w));
  const cellH = Math.max(...sizes.map((s) => s.h));
  const anchorX = Math.min(...order.map((n) => n.position.x));
  const anchorY = Math.min(...order.map((n) => n.position.y));
  const result = new Map();
  order.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r >= rows) return; // 超出指定行数：保持原位
    const { w, h } = sizes[i];
    const cellX = anchorX + c * (cellW + gapX);
    const cellY = anchorY + r * (cellH + gapY);
    result.set(n.id, { x: cellX + (cellW - w) / 2, y: cellY + (cellH - h) / 2 });
  });
  return result;
}
