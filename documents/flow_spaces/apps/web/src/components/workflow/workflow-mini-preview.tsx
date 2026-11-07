'use client';

import { memo } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { WorkflowTemplate, WorkflowNode } from '@agent-spaces/shared';
import Dagre from '@dagrejs/dagre';

function MiniNode({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="rounded-md border bg-card px-2 py-1 text-[8px] truncate w-full">
      {String(data.label ?? '')}
    </div>
  );
}

const miniNodeTypes: NodeTypes = { agent: MiniNode };

function layoutNodes(template: WorkflowTemplate): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 40 });

  const nodeIds = new Set(template.nodes.map(n => n.id));
  const nodes: Node[] = template.nodes.map(n => ({ id: n.id, type: 'agent', position: n.position, data: n.data }));
  const edges: Edge[] = template.edges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => ({ id: e.id, source: e.source, target: e.target, type: 'smoothstep' }));

  for (const node of nodes) g.setNode(node.id, { width: 80, height: 24 });
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  Dagre.layout(g);

  return {
    nodes: nodes.map(node => {
      const dagreNode = g.node(node.id);
      return { ...node, position: { x: dagreNode.x - 40, y: dagreNode.y - 12 } };
    }),
    edges,
  };
}

export const WorkflowMiniPreview = memo(function WorkflowMiniPreview({ template }: { template: WorkflowTemplate }) {
  if (template.nodes.length === 0) {
    return <div className="h-24 flex items-center justify-center text-xs text-muted-foreground bg-muted/30 rounded">Empty workflow</div>;
  }
  const { nodes, edges } = layoutNodes(template);
  return (
    <div className="h-24 w-full pointer-events-none">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={miniNodeTypes}
        fitView proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} panOnScroll={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={10} size={0.5} />
      </ReactFlow>
    </div>
  );
});
