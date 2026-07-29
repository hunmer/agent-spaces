import dagre, { graphlib } from '@dagrejs/dagre';

// 节点默认尺寸（与 NodeShell 宽度对齐）
const DEFAULT_NODE = { width: 280, height: 220 };

/**
 * 用 dagre 计算自动布局，返回带新 position 的 nodes（原 nodes 引用不变部分保持）。
 * @param {Array} nodes
 * @param {Array} edges
 * @param {{ direction?: 'LR'|'TB', nodeGap?: number, rankGap?: number }} [opts]
 * @returns {Array} new nodes with updated position
 */
export function autoLayout(nodes, edges, opts = {}) {
  const direction = opts.direction || 'LR';
  const g = new graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: opts.nodeGap ?? 40, ranksep: opts.rankGap ?? 80, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const w = n.width || (n.measured?.width) || DEFAULT_NODE.width;
    const h = n.height || (n.measured?.height) || DEFAULT_NODE.height;
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of edges) {
    // 只在两端节点都存在时建边
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    return {
      ...n,
      // dagre 给的是中心点，ReactFlow 用左上角
      position: { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 },
    };
  });
}

// AABB 重叠判定（左上角坐标 + 宽高）
function rectsOverlap(a, b) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

// 取一个节点的包围盒（宽高兜底默认值）
function nodeRect(n, fallbackW, fallbackH) {
  const width = n.width || n.measured?.width || fallbackW || DEFAULT_NODE.width;
  const height = n.height || n.measured?.height || fallbackH || DEFAULT_NODE.height;
  return { x: n.position?.x ?? 0, y: n.position?.y ?? 0, width, height };
}

/**
 * 在「指定锚点附近」为一组固定尺寸的方块找互不重叠的放置位置（通用函数）。
 *
 * 算法：从锚点（anchor = {x,y}，新块的左上角候选起点）开始，沿 direction 方向逐层
 * 扫描候选格；每层内沿 cross 方向顺序填，已占用的格跳过。命中空位即放，并把该位置
 * 加入「已占用」集合（供后续块继续避让），从而天然实现「靠锚点紧凑排布 + 不重叠」。
 *
 * @param {object} anchor 锚点 { x, y }（第一个候选块的左上角）
 * @param {number} blockW 单块宽
 * @param {number} blockH 单块高
 * @param {number} count 需要几个位置
 * @param {Array} obstacles 已有节点数组（读取 position/width/height/measured）
 * @param {{ gap?: number, direction?: 'right'|'down', cols?: number }} [opts]
 *   - gap：块间距（默认 40）
 *   - direction：主排布方向（默认 'right'，即向右铺开，垂直方向换列）
 *   - cols：direction=right 时的列数上限（默认 3）
 * @returns {Array<{x:number,y:number}>} 长度为 count 的位置数组
 */
export function findFreePositions(anchor, blockW, blockH, count, obstacles, opts = {}) {
  if (count <= 0) return [];
  const gap = opts.gap ?? 40;
  const direction = opts.direction || 'right';
  const stepX = blockW + gap;
  const stepY = blockH + gap;
  const occupied = (obstacles || []).map((n) => nodeRect(n, blockW, blockH));
  const positions = [];

  const tryPlace = (x, y) => {
    const candidate = { x, y, width: blockW, height: blockH };
    return occupied.every((o) => !rectsOverlap(candidate, o));
  };

  // 沿主方向逐层（层 = 一行或一列）扫描，找到 count 个空位为止
  for (let layer = 0; positions.length < count; layer++) {
    if (direction === 'right') {
      const cols = opts.cols ?? 3;
      const cap = Math.max(cols, count);
      for (let i = 0; i < cap && positions.length < count; i++) {
        const x = anchor.x + i * stepX;
        const y = anchor.y + layer * stepY;
        if (tryPlace(x, y)) {
          positions.push({ x, y });
          occupied.push({ x, y, width: blockW, height: blockH });
        }
      }
    } else {
      // 向下：主方向是 y，每层一行水平排
      for (let i = 0; positions.length < count; i++) {
        const x = anchor.x + layer * stepX;
        const y = anchor.y + i * stepY;
        if (tryPlace(x, y)) {
          positions.push({ x, y });
          occupied.push({ x, y, width: blockW, height: blockH });
        }
      }
    }
  }
  return positions;
}
