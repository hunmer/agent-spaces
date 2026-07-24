import { getSimpleBezierPath, useNodes, useReactFlow } from '@xyflow/react';

/**
 * 自定义连接线预览：
 * - 单节点拖拽：渲染一条 fromNode → 鼠标 的连线（用 ReactFlow 传入的 fromX/fromY，已是 source handle 中心）
 * - 多选拖拽（source 节点处于选中态）：从每个选中节点的 source handle 都画一条预览线
 *
 * 关键：指定了 connectionLineComponent 后，ReactFlow 不再渲染默认连线，
 * 所以单节点情况也必须自己返回连线，不能 return null（否则拖拽过程看不到任何预览）。
 *
 * 参考 xyflow 官方 MultiConnectLine 示例。
 *
 * @param {{ fromX:number, fromY:number, toX:number, toY:number, fromNode?:object }} props
 */
export default function ConnectionLine({ fromX, fromY, toX, toY, fromNode }) {
  const { getInternalNode } = useReactFlow();
  const nodes = useNodes();

  // fromNode 是否处于多选集合中：是则把所有选中节点都连过去
  const fromSelected = !!fromNode && nodes.some((n) => n.id === fromNode.id && n.selected);
  const extraIds = fromSelected
    ? nodes.filter((n) => n.selected && n.id !== fromNode?.id).map((n) => n.id)
    : [];

  // 主线（fromNode）一定渲染，单选/多选都靠它保证拖拽时看得到线
  const segments = [{ key: fromNode?.id || 'main', x: fromX, y: fromY }];

  // 多选：每个附加选中节点都从其 source handle 起一条
  for (const id of extraIds) {
    const node = getInternalNode(id);
    if (!node) continue;
    const internals = node.internals || {};
    const pos = internals.positionAbsolute || node.position;
    const sources = internals.handleBounds?.source || [];
    for (const b of sources) {
      segments.push({
        key: `${id}-${b.id || 'default'}`,
        x: pos.x + b.x + b.width / 2,
        y: pos.y + b.y + b.height / 2,
      });
    }
  }

  return segments.map(({ key, x, y }) => {
    const [d] = getSimpleBezierPath({ sourceX: x, sourceY: y, targetX: toX, targetY: toY });
    return (
      <g key={key}>
        <path fill="none" strokeWidth={1.5} stroke="#6366f1" d={d} />
        <circle cx={toX} cy={toY} fill="#fff" r={4} stroke="#6366f1" strokeWidth={1.5} />
      </g>
    );
  });
}
