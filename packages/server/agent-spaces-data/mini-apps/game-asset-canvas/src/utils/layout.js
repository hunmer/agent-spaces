import dagre, { graphlib } from '@dagrejs/dagre';
import { computeGridLayout } from './align-distribute.js';

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

/**
 * 布局画布顶层实体：未分组节点直接参与，分组按整体包围盒参与。
 * 分组成员只做等量平移，保持组内相对位置不变。
 * @returns {{ nodes: Array, groups: Array }}
 */
export function autoLayoutTopLevel(nodes, edges, groups = [], opts = {}) {
  const childGroupIds = new Set(groups.flatMap((group) => group.childGroupIds || []));
  const topGroups = groups.filter((group) => !childGroupIds.has(group.id));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const collectGroupIds = (rootId) => {
    const result = new Set();
    const visit = (groupId) => {
      if (result.has(groupId)) return;
      result.add(groupId);
      const group = groupById.get(groupId);
      (group?.childGroupIds || []).forEach(visit);
    };
    visit(rootId);
    return result;
  };

  const collectNodeIds = (groupIds) => {
    const result = new Set();
    groupIds.forEach((groupId) => {
      (groupById.get(groupId)?.childNodeIds || []).forEach((nodeId) => result.add(nodeId));
    });
    return result;
  };

  const claimedNodeIds = new Set();
  const groupEntities = topGroups.map((group) => {
    const nestedGroupIds = collectGroupIds(group.id);
    const nodeIds = collectNodeIds(nestedGroupIds);
    nodeIds.forEach((nodeId) => claimedNodeIds.add(nodeId));
    const members = [...nodeIds].map((nodeId) => nodeById.get(nodeId)).filter(Boolean);

    let rect;
    if (members.length) {
      const padding = 30;
      const headerHeight = 28;
      const minX = Math.min(...members.map((node) => node.position.x));
      const minY = Math.min(...members.map((node) => node.position.y));
      const maxX = Math.max(...members.map((node) => node.position.x + nodeRect(node).width));
      const maxY = Math.max(...members.map((node) => node.position.y + nodeRect(node).height));
      rect = {
        x: minX - padding,
        y: minY - headerHeight - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + headerHeight + padding * 2,
      };
    } else {
      rect = {
        x: group.x ?? 50,
        y: group.y ?? 50,
        width: group.width ?? 300,
        height: group.height ?? 200,
      };
    }

    return {
      id: `group:${group.id}`,
      position: { x: rect.x, y: rect.y },
      width: rect.width,
      height: rect.height,
      groupId: group.id,
      nestedGroupIds,
      nodeIds,
    };
  });

  const nodeEntities = nodes
    .filter((node) => !claimedNodeIds.has(node.id))
    .map((node) => ({
      ...node,
      id: `node:${node.id}`,
      sourceNodeId: node.id,
    }));
  const entities = [...groupEntities, ...nodeEntities];
  if (entities.length < 2) return { nodes, groups };

  const entityIdByNodeId = new Map(nodeEntities.map((entity) => [entity.sourceNodeId, entity.id]));
  groupEntities.forEach((entity) => {
    entity.nodeIds.forEach((nodeId) => {
      if (!entityIdByNodeId.has(nodeId)) entityIdByNodeId.set(nodeId, entity.id);
    });
  });
  const entityEdges = edges.flatMap((edge) => {
    const source = entityIdByNodeId.get(edge.source);
    const target = entityIdByNodeId.get(edge.target);
    return source && target && source !== target ? [{ ...edge, source, target }] : [];
  });
  const arranged = autoLayout(entities, entityEdges, { direction: opts.direction === 'TB' ? 'TB' : 'LR' });
  const arrangedById = new Map(arranged.map((entity) => [entity.id, entity]));
  const nodePositions = new Map(nodeEntities.map((entity) => [
    entity.sourceNodeId,
    arrangedById.get(entity.id)?.position || entity.position,
  ]));
  const groupDeltas = new Map(groupEntities.map((entity) => {
    const next = arrangedById.get(entity.id)?.position || entity.position;
    return [entity.groupId, { x: next.x - entity.position.x, y: next.y - entity.position.y }];
  }));

  groupEntities.forEach((entity) => {
    const delta = groupDeltas.get(entity.groupId);
    entity.nodeIds.forEach((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node) nodePositions.set(nodeId, {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y,
      });
    });
  });

  const groupDeltaById = new Map();
  const ownerEntityByGroupId = new Map();
  groupEntities.forEach((entity) => {
    entity.nestedGroupIds.forEach((groupId) => {
      groupDeltaById.set(groupId, groupDeltas.get(entity.groupId));
      ownerEntityByGroupId.set(groupId, entity);
    });
  });

  return {
    nodes: nodes.map((node) => ({ ...node, position: nodePositions.get(node.id) || node.position })),
    groups: groups.map((group) => {
      const delta = groupDeltaById.get(group.id);
      if (!delta) return group;
      const owner = ownerEntityByGroupId.get(group.id);
      if (owner?.groupId === group.id && owner.nodeIds.size === 0) {
        return {
          ...group,
          x: owner.position.x + delta.x,
          y: owner.position.y + delta.y,
        };
      }
      if (group.x == null && group.y == null) return group;
      return {
        ...group,
        x: (group.x ?? 0) + delta.x,
        y: (group.y ?? 0) + delta.y,
      };
    }),
  };
}

export function autoLayoutSubset(nodes, edges, opts = {}) {
  const ids = new Set(opts.nodeIds || []);
  const subset = nodes.filter((node) => ids.has(node.id));
  if (subset.length < 2) return nodes;

  let arranged;
  if (opts.grid) {
    const positions = computeGridLayout(subset, edges, {
      rows: opts.grid.rows,
      cols: opts.grid.columns,
      gapX: opts.grid.horizontalGap,
      gapY: opts.grid.verticalGap,
    });
    arranged = subset.map((node) => positions.has(node.id)
      ? { ...node, position: positions.get(node.id) }
      : node);
  } else {
    arranged = autoLayout(subset, edges, { direction: opts.direction });
  }

  const anchor = {
    x: Math.min(...subset.map((node) => node.position.x)),
    y: Math.min(...subset.map((node) => node.position.y)),
  };
  const arrangedAnchor = {
    x: Math.min(...arranged.map((node) => node.position.x)),
    y: Math.min(...arranged.map((node) => node.position.y)),
  };
  const positions = new Map(arranged.map((node) => [node.id, {
    x: node.position.x + anchor.x - arrangedAnchor.x,
    y: node.position.y + anchor.y - arrangedAnchor.y,
  }]));

  return nodes.map((node) => positions.has(node.id)
    ? { ...node, position: positions.get(node.id) }
    : node);
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
