/**
 * 多选节点对齐分布的坐标计算（纯函数）。
 *
 * - computeAlignment: 左/右/顶/底四向对齐，取该边缘极值（顶/左取最小，底/右取最大）
 * - computeGridLayout: 按「最上游优先」拓扑序铺成 rows × cols 网格
 *
 * 节点宽高取 style 或顶层 width/height（NodeResizer 要求），兜底 200x100。
 */

// 节点尺寸兜底
const nodeSize = (n) => ({
  w: n.width || n.style?.width || 200,
  h: n.height || n.style?.height || 100,
});

/**
 * 沿副轴消除重叠（贪心推开）：
 * 按副轴当前坐标排序，逐个检测与前一个尾端的间距，
 * 重叠则顺延到「前一个尾端 + gap」，不重叠保持原位。
 * 只移动必须移动的节点，保留原有相对顺序。
 *
 * @returns {Map<string, number>} nodeId -> 副轴新坐标
 */
function resolveOverlap(selectedNodes, sizes, axis, dim, gap) {
  const order = selectedNodes
    .map((_, i) => i)
    .sort((a, b) => selectedNodes[a].position[axis] - selectedNodes[b].position[axis]);
  const out = new Map();
  let prevEnd = -Infinity;
  for (const i of order) {
    const n = selectedNodes[i];
    let pos = n.position[axis];
    if (pos < prevEnd + gap) pos = prevEnd + gap;
    out.set(n.id, pos);
    prevEnd = pos + sizes[i][dim];
  }
  return out;
}

/**
 * 四向对齐：主轴取指定边缘极值对齐，副轴消除节点重叠。
 * - left  : x 对齐到最左边缘；y 消除重叠
 * - right : 右边缘对齐到最右；y 消除重叠
 * - top   : y 对齐到最顶边缘；x 消除重叠
 * - bottom: 底边缘对齐到最底；x 消除重叠
 *
 * @param {Array} selectedNodes
 * @param {string} mode 'left' | 'right' | 'top' | 'bottom'
 * @param {number} [gap=20] 副轴消除重叠时的最小间距
 * @returns {Map<string, {x?:number, y?:number}>} nodeId -> 需更新的新坐标
 */
export function computeAlignment(selectedNodes, mode, gap = 20) {
  if (!selectedNodes || selectedNodes.length < 2) return new Map();
  const sizes = selectedNodes.map(nodeSize);
  const result = new Map();

  if (mode === 'left' || mode === 'right') {
    // 主轴 x：left 取 min(x)，right 右边缘取 max(x+w)
    const edge = mode === 'left'
      ? Math.min(...selectedNodes.map((n) => n.position.x))
      : Math.max(...selectedNodes.map((n, i) => n.position.x + sizes[i].w));
    // 副轴 y 消除重叠
    const ys = resolveOverlap(selectedNodes, sizes, 'y', 'h', gap);
    selectedNodes.forEach((n, i) => {
      result.set(n.id, { x: mode === 'left' ? edge : edge - sizes[i].w, y: ys.get(n.id) });
    });
  } else if (mode === 'top' || mode === 'bottom') {
    const edge = mode === 'top'
      ? Math.min(...selectedNodes.map((n) => n.position.y))
      : Math.max(...selectedNodes.map((n, i) => n.position.y + sizes[i].h));
    const xs = resolveOverlap(selectedNodes, sizes, 'x', 'w', gap);
    selectedNodes.forEach((n, i) => {
      result.set(n.id, { x: xs.get(n.id), y: mode === 'top' ? edge : edge - sizes[i].h });
    });
  }
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
 * 节点在各自单元格内左上角对齐（同列顶部对齐、同行左侧对齐）；
 * gapX/gapY 为列间/行间间距；锚点取选中节点最小 x/y，保持整体位置不大幅跳动。
 * 超出 rows×cols 容量的节点保持原位（尊重用户指定的行列）。
 *
 * 单元格尺寸按列/行独立计算：同列等宽（取该列最宽节点）、同行等高（取该行最高节点），
 * 这样每列首个节点顶部共线、每行首个节点左侧共线，且不浪费空间。
 *
 * @returns {Map<string, {x:number, y:number}>} nodeId -> 新坐标
 */
export function computeGridLayout(selectedNodes, edges, { rows, cols, gapX, gapY }) {
  if (!selectedNodes || selectedNodes.length < 2) return new Map();
  const order = topoSortSelected(selectedNodes, edges);
  const sizes = order.map(nodeSize);
  const colCount = Math.min(cols, order.length);
  const rowCount = Math.min(rows, Math.ceil(order.length / cols));

  // 每列宽度（取该列最宽节点）、每行高度（取该行最高节点）
  const colWidths = Array.from({ length: colCount }, () => 0);
  const rowHeights = Array.from({ length: rowCount }, () => 0);
  order.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r >= rows) return;
    colWidths[c] = Math.max(colWidths[c], sizes[i].w);
    rowHeights[r] = Math.max(rowHeights[r], sizes[i].h);
  });

  // 列/行起始坐标（前缀和 + 间距）
  const anchorX = Math.min(...order.map((n) => n.position.x));
  const anchorY = Math.min(...order.map((n) => n.position.y));
  const colX = [anchorX];
  for (let c = 1; c < colCount; c++) colX[c] = colX[c - 1] + colWidths[c - 1] + gapX;
  const rowY = [anchorY];
  for (let r = 1; r < rowCount; r++) rowY[r] = rowY[r - 1] + rowHeights[r - 1] + gapY;

  const result = new Map();
  order.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r >= rows) return; // 超出指定行数：保持原位
    result.set(n.id, { x: colX[c], y: rowY[r] }); // 左上角对齐
  });
  return result;
}
