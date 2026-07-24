import { Position } from '@xyflow/react';

/**
 * Floating edges 工具：动态计算两节点间最优连线起止点。
 * 移植自 ReactFlow 官方 FloatingEdges 示例（examples/react/src/examples/FloatingEdges/utils.ts）。
 *
 * 核心思路：不依赖固定 handle，而是计算「两节点中心连线」与各自矩形边界的交点，
 * 边从该交点连出，节点拖动时交点自动变化，实现边随节点位置浮动。
 */

// 两节点中心连线与 intersectionNode 矩形边界的交点（绝对坐标）
function getNodeIntersection(intersectionNode, targetNode) {
  const { internals: intersectionInternals } = intersectionNode;
  const { width: iw, height: ih } = intersectionNode.measured || { width: 0, height: 0 };
  const targetPosition = targetNode.internals.positionAbsolute;

  const w = (iw || 0) / 2;
  const h = (ih || 0) / 2;

  const x2 = intersectionInternals.positionAbsolute.x + w;
  const y2 = intersectionInternals.positionAbsolute.y + h;
  const x1 = targetPosition.x + w;
  const y1 = targetPosition.y + h;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

// 交点落在节点哪条边（top/right/bottom/left）
function getEdgePosition(node, intersectionPoint) {
  const n = { ...node.position, ...node };
  const nx = Math.round(n.x);
  const ny = Math.round(n.y);
  const px = Math.round(intersectionPoint.x);
  const py = Math.round(intersectionPoint.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + (n.measured?.width || 0) - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= n.y + (n.measured?.height || 0) - 1) return Position.Bottom;
  return Position.Top;
}

/**
 * 计算两节点间 floating edge 的连线参数。
 * @param {object} source useInternalNode(source)
 * @param {object} target useInternalNode(target)
 * @returns {{ sx, sy, tx, ty, sourcePos, targetPos }}
 */
export function getEdgeParams(source, target) {
  const sourceIntersectionPoint = getNodeIntersection(source, target);
  const targetIntersectionPoint = getNodeIntersection(target, source);

  const sourcePos = getEdgePosition(source, sourceIntersectionPoint);
  const targetPos = getEdgePosition(target, targetIntersectionPoint);

  return {
    sx: sourceIntersectionPoint.x,
    sy: sourceIntersectionPoint.y,
    tx: targetIntersectionPoint.x,
    ty: targetIntersectionPoint.y,
    sourcePos,
    targetPos,
  };
}
