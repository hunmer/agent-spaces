'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import type { WorkflowNode, AgentConfig } from '@agent-spaces/shared';
import { WorkflowAgentNode } from './workflow-agent-node';
import { X } from 'lucide-react';

type AgentNodeData = WorkflowNode['data'];
type AgentNode = Node<AgentNodeData, 'agent'>;

function DeletableEdge({
  id,
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <g
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Invisible wider path for easier hover */}
        <path d={edgePath} fill="none" strokeWidth={20} stroke="transparent" />
        <BaseEdge id={id} path={edgePath} markerEnd={markerEnd}
          style={{ ...style, strokeWidth: hovered ? 3 : 2, stroke: hovered ? 'hsl(var(--primary))' : style.stroke }}
        />
      </g>
      {hovered && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute flex items-center justify-center size-5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/80 pointer-events-auto"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            onClick={() => setEdges((eds) => eds.filter((e) => e.id !== id))}
          >
            <X className="size-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { agent: WorkflowAgentNode };
const edgeTypes = { smoothstep: DeletableEdge };

interface WorkflowCanvasProps {
  nodes: AgentNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<AgentNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onNodeAdd?: (node: AgentNode) => void;
}

export function WorkflowCanvas({ nodes, edges, onNodesChange, onEdgesChange, onConnect, onNodeAdd }: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const agentJson = event.dataTransfer.getData('application/json');
    if (!agentJson) return;
    const agent: AgentConfig = JSON.parse(agentJson);
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    onNodeAdd?.({
      id: `node-${Date.now()}`,
      type: 'agent',
      position,
      data: { label: agent.name, agentConfigId: agent.id, role: agent.role, avatarUrl: agent.avatarUrl, modelId: agent.modelId },
    });
  }, [screenToFlowPosition, onNodeAdd]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        onDragOver={onDragOver} onDrop={onDrop}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView snapToGrid snapGrid={[15, 15]}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultEdgeOptions={{ type: 'smoothstep', animated: false, style: { strokeWidth: 2 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} pannable zoomable className="!bg-muted" />
      </ReactFlow>
    </div>
  );
}

// Auto-layout: creates fresh Graph each call
export function getAutoLayoutedNodes(nodes: AgentNode[], edges: Edge[]): AgentNode[] {
  const g = new Dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 });
  for (const node of nodes) g.setNode(node.id, { width: 180, height: 80 });
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  Dagre.layout(g);
  return nodes.map(node => {
    const dagreNode = g.node(node.id);
    return { ...node, position: { x: dagreNode.x - 90, y: dagreNode.y - 40 } };
  });
}
