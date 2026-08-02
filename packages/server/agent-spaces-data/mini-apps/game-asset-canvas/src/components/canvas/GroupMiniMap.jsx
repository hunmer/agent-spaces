import { useMemo } from 'react';
import { MiniMap } from '@xyflow/react';
import { getGroupMiniMapBounds, getGroupMiniMapColor } from '../../utils/group-minimap';

export default function GroupMiniMap({ items, nodes, ...props }) {
  const anchorNodeId = nodes.find((node) => !node.hidden)?.id ?? null;
  const groupRects = useMemo(() => items.map(({ group, childNodes }) => ({
    id: group.id,
    color: getGroupMiniMapColor(group.color),
    ...getGroupMiniMapBounds(group, childNodes),
  })), [items]);

  // 自定义 minimap 节点：在锚点节点上叠加分组 rect，并绘制节点本身的 rect。
  // 不依赖 MiniMapNode 导入（不同 xyflow 版本导出形态不一），直接用原生 SVG rect 复刻默认渲染。
  const NodeComponent = useMemo(() => function MiniMapNodeWithGroups(nodeProps) {
    const { x, y, width, height, color } = nodeProps;
    return (
      <>
        {nodeProps.id === anchorNodeId && groupRects.map((rect) => (
          <rect
            key={rect.id}
            className="game-asset-minimap-group"
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={8}
            ry={8}
            fill={rect.color}
            fillOpacity={0.2}
            stroke={rect.color}
            strokeWidth={3}
            pointerEvents="none"
          />
        ))}
        {/* 节点本体（复刻 xyflow 默认 MiniMapNode 渲染） */}
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={2}
          ry={2}
          fill={color || '#e2e8f0'}
          pointerEvents="none"
        />
      </>
    );
  }, [anchorNodeId, groupRects]);

  return (
    <MiniMap
      {...props}
      nodeComponent={NodeComponent}
      offsetScale={30}
    />
  );
}
