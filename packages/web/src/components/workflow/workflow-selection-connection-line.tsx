'use client';

import {
  ReactFlow,
  getSimpleBezierPath,
  useNodes,
  useReactFlow,
} from '@xyflow/react';
import type React from 'react';

type WorkflowConnectionLineProps =
  NonNullable<React.ComponentProps<typeof ReactFlow>['connectionLineComponent']> extends React.ComponentType<infer Props>
    ? Props
    : never;

export function WorkflowSelectionConnectionLine({
  fromNode,
  fromHandle,
  toX,
  toY,
  toNode,
  connectionLineStyle,
}: WorkflowConnectionLineProps) {
  const { getInternalNode } = useReactFlow();
  const nodes = useNodes();
  const selectedNodes = nodes.filter(node => node.selected);
  const shouldUseSelection = selectedNodes.some(node => node.id === fromNode.id);
  const sourceNodes = (shouldUseSelection ? selectedNodes : nodes.filter(node => node.id === fromNode.id))
    .filter(node => node.id !== toNode?.id);
  const sourceHandleId = fromHandle.id ?? null;

  const handleBounds = sourceNodes.flatMap((userNode) => {
    const node = getInternalNode(userNode.id);
    if (!node) return [];

    const sourceBounds = node.internals.handleBounds?.source ?? [];

    return sourceBounds
      .filter(bounds => (bounds.id ?? null) === sourceHandleId)
      .map(bounds => ({
        id: node.id,
        positionAbsolute: node.internals.positionAbsolute,
        bounds,
      }));
  });

  return (
    <>
      {handleBounds.map(({ id, positionAbsolute, bounds }) => {
        const fromHandleX = bounds.x + bounds.width / 2;
        const fromHandleY = bounds.y + bounds.height / 2;
        const fromX = positionAbsolute.x + fromHandleX;
        const fromY = positionAbsolute.y + fromHandleY;
        const [path] = getSimpleBezierPath({
          sourceX: fromX,
          sourceY: fromY,
          targetX: toX,
          targetY: toY,
        });

        return (
          <g key={`${id}-${bounds.id ?? 'source'}`}>
            <path
              fill="none"
              strokeWidth={1.5}
              stroke="var(--muted-foreground)"
              style={connectionLineStyle}
              d={path}
            />
            <circle
              cx={toX}
              cy={toY}
              r={3}
              fill="var(--background)"
              stroke="var(--foreground)"
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </>
  );
}
