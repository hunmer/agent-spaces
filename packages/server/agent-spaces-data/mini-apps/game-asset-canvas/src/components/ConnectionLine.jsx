import { getBezierPath, useNodes, useReactFlow } from '@xyflow/react';

/**
 * 自定义连接线预览：
 * - 单节点拖拽：严格使用 ReactFlow 提供的 source Handle 圆心坐标
 * - 多选拖拽（source 节点处于选中态）：从每个选中节点的 source Handle 圆心画预览线
 *
 * 关键：指定了 connectionLineComponent 后，ReactFlow 不再渲染默认连线，
 * 所以单节点情况也必须自己返回连线，不能 return null（否则拖拽过程看不到任何预览）。
 *
 * 参考 xyflow 官方 MultiConnectLine 示例。
 *
 * @param {{ fromX:number, fromY:number, toX:number, toY:number, fromNode?:object }} props
 */
export default function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, fromNode }) {
  const { getInternalNode } = useReactFlow();
  const nodes = useNodes();

  // fromNode 是否处于多选集合中：是则把所有选中节点都连过去
  const fromSelected = !!fromNode && nodes.some((n) => n.id === fromNode.id && n.selected);
  const extraIds = fromSelected
    ? nodes.filter((n) => n.selected && n.id !== fromNode?.id).map((n) => n.id)
    : [];

  // 主线（fromNode）一定渲染，单选/多选都靠它保证拖拽时看得到线
  const segments = [{ key: fromNode?.id || 'main', x: fromX, y: fromY, position: fromPosition }];

  // 多选：每个附加选中节点都从其 source handle 起一条
  for (const id of extraIds) {
    const node = getInternalNode(id);
    if (!node) continue;
    const internals = node.internals || {};
    const absolute = internals.positionAbsolute || node.position;
    const sources = internals.handleBounds?.source || [];
    for (const handle of sources) {
      segments.push({
        key: `${id}-${handle.id || 'default'}`,
        x: absolute.x + handle.x + handle.width / 2,
        y: absolute.y + handle.y + handle.height / 2,
        position: handle.position || fromPosition,
      });
    }
  }

  return segments.map(({ key, x, y, position }) => {
    const [d] = getBezierPath({
      sourceX: x,
      sourceY: y,
      sourcePosition: position,
      targetX: toX,
      targetY: toY,
      targetPosition: toPosition,
    });
    return (
      <g key={key}>
        <path fill="none" strokeWidth={1.5} stroke="#6366f1" d={d} />
        <circle cx={toX} cy={toY} fill="#fff" r={4} stroke="#6366f1" strokeWidth={1.5} />
      </g>
    );
  });
}
