import { getSimpleBezierPath, useNodes, useReactFlow } from '@xyflow/react';

/**
 * 自定义连接线：多选节点时，从每个选中节点的 source handle 都画一条连线到鼠标位置。
 * 单选/无选中时只画默认的一条（source 就是拖拽起点的那个节点）。
 *
 * 用法：<ReactFlow connectionLineComponent={ConnectionLine} />
 *
 * 参考 xyflow 官方 MultiConnectLine 示例（https://reactflow.dev/examples/interaction/multi-connect）。
 *
 * @param {{ fromX:number, fromY:number, toX:number, toY:number, fromHandle?:object, fromNode?:object }} props
 */
export default function ConnectionLine({ fromX, fromY, toX, toY, fromNode }) {
  const { getInternalNode } = useReactFlow();
  const nodes = useNodes();
  const selectedNodes = nodes.filter((node) => node.selected);

  // 仅多选时启用多连线预览：单选（0 或 1 个选中）走 ReactFlow 默认（返回 null 让内置渲染接管）
  if (selectedNodes.length < 2) return null;

  // fromNode 为当前拖拽起点的节点；确保它一定在连线列表里（即使其 selected 因某种原因未同步）
  const baseIds = new Set(selectedNodes.map((n) => n.id));
  if (fromNode?.id) baseIds.add(fromNode.id);

  const handleBounds = [];
  for (const id of baseIds) {
    const node = getInternalNode(id);
    if (!node) continue;
    const internals = node.internals || {};
    const bounds = internals.handleBounds;
    const sources = bounds?.source || [];
    for (const b of sources) {
      handleBounds.push({
        id,
        positionAbsolute: internals.positionAbsolute || node.position,
        bounds: b,
      });
    }
  }

  return handleBounds.map(({ id, positionAbsolute, bounds }) => {
    const fromHandleX = bounds.x + bounds.width / 2;
    const fromHandleY = bounds.y + bounds.height / 2;
    const startX = positionAbsolute.x + fromHandleX;
    const startY = positionAbsolute.y + fromHandleY;
    const [d] = getSimpleBezierPath({
      sourceX: startX,
      sourceY: startY,
      targetX: toX,
      targetY: toY,
    });
    return (
      <g key={`${id}-${bounds.id || 'default'}`}>
        <path fill="none" strokeWidth={1.5} stroke="#6366f1" d={d} />
        <circle
          cx={toX}
          cy={toY}
          fill="#fff"
          r={4}
          stroke="#6366f1"
          strokeWidth={1.5}
        />
      </g>
    );
  });
}
