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
