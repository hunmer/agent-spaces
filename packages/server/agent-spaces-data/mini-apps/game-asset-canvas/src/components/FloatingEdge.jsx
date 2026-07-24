import { memo } from 'react';
import { getBezierPath, useInternalNode } from '@xyflow/react';
import { getEdgeParams } from '../utils/floating-edge';

/**
 * 浮动连线：动态连接到两节点最优边界点（不固定 handle 位置）。
 * 节点拖动时边自动从最近边重连，避免「整节点可拖拽」与连线 handle 的交互冲突。
 * 移植自 ReactFlow 官方 floating edges 示例。
 */
function FloatingEdge({ id, source, target, markerEnd, style, selected }) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  const [edgePath] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
  });

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
      style={style}
      stroke={selected ? '#6366f1' : undefined}
      strokeWidth={selected ? 2.5 : undefined}
    />
  );
}

export default memo(FloatingEdge);
