'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import type { WorkflowTemplate, WorkflowNode, WorkflowEdge, AgentConfig } from '@agent-spaces/shared';

interface AgentWithWorkspace extends AgentConfig {
  workspaceId: string;
}
import { useWorkflowStore } from '@/stores/workflow';
import { WorkflowCanvas, getAutoLayoutedNodes } from './workflow-canvas';
import { WorkflowAgentPalette } from './workflow-agent-palette';
import { WorkflowToolbar } from './workflow-toolbar';
import { Input } from '@/components/ui/input';
import { authHeaders } from '@/lib/auth';

type AgentNodeData = WorkflowNode['data'];
type AgentNode = Node<AgentNodeData, 'agent'>;

function WorkflowEditorInner({
  workspaceId,
  template,
  onBack,
}: {
  workspaceId: string;
  template: WorkflowTemplate | null;
  onBack: () => void;
}) {
  const { updateWorkflow, createWorkflow } = useWorkflowStore();

  const [allAgents, setAllAgents] = useState<AgentWithWorkspace[]>([]);

  useEffect(() => {
    fetch('/api/workspaces', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((workspaces: { id: string }[]) =>
        Promise.all(
          workspaces.map((ws) =>
            fetch(`/api/workspaces/${ws.id}/agents/presets`, { headers: authHeaders() })
              .then((r) => (r.ok ? r.json() : []))
              .then((agents: AgentConfig[]) => agents.map((a) => ({ ...a, workspaceId: ws.id })))
              .catch(() => [])
          )
        )
      )
      .then((results) => {
        const flat = results.flat() as AgentWithWorkspace[];
        const seen = new Set<string>();
        const deduped = flat.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        setAllAgents(deduped);
      })
      .catch(() => {});
  }, []);

  const [name, setName] = useState(template?.name ?? 'New Workflow');
  const [description, setDescription] = useState(template?.description ?? '');
  const [nodes, setNodes] = useState<AgentNode[]>(
    () =>
      template?.nodes.map((n) => ({
        id: n.id,
        type: 'agent' as const,
        position: n.position,
        data: n.data,
      })) ?? []
  );
  const [edges, setEdges] = useState<Edge[]>(
    () =>
      template?.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep' as const,
      })) ?? []
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const templateId = template?.id;

  const markDirty = useCallback(() => setIsDirty(true), []);

  const onNodesChange = useCallback(
    (changes: NodeChange<AgentNode>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      markDirty();
    },
    [markDirty]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
      markDirty();
    },
    [markDirty]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds));
      markDirty();
    },
    [markDirty]
  );

  const onNodeAdd = useCallback(
    (node: AgentNode) => {
      setNodes((nds) => [...nds, node]);
      markDirty();
    },
    [markDirty]
  );

  const handleAutoLayout = useCallback(() => {
    setNodes((nds) => getAutoLayoutedNodes(nds, edges));
    markDirty();
  }, [edges, markDirty]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const workflowNodes: WorkflowNode[] = nodes.map((n) => ({
        id: n.id,
        type: 'agent' as const,
        position: n.position,
        data: n.data,
      }));
      const workflowEdges: WorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      }));

      if (templateId) {
        await updateWorkflow(workspaceId, templateId, {
          name,
          description: description || undefined,
          nodes: workflowNodes,
          edges: workflowEdges,
        });
      } else {
        await createWorkflow(workspaceId, {
          name,
          description: description || undefined,
          nodes: workflowNodes,
          edges: workflowEdges,
        });
      }
      setIsDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [workspaceId, templateId, name, description, nodes, edges, updateWorkflow, createWorkflow]);

  const handleExport = useCallback(() => {
    const agentMap: Record<string, Omit<AgentConfig, 'apiKey'>> = {};
    for (const node of nodes) {
      const agentId = node.data.agentConfigId;
      if (agentId && !agentMap[agentId]) {
        const agent = allAgents.find((a) => a.id === agentId);
        if (agent) {
          const { apiKey: _, ...rest } = agent;
          agentMap[agentId] = rest;
        }
      }
    }
    const data = {
      name,
      description,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      agents: agentMap,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [name, description, nodes, edges, allAgents]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </button>
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            markDirty();
          }}
          className="h-8 text-sm font-medium border-0 shadow-none focus-visible:ring-0 px-1"
          placeholder="Workflow name"
        />
        <span className="text-xs text-muted-foreground">
          {nodes.length} agent{nodes.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <WorkflowAgentPalette agents={allAgents} />
        <WorkflowCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeAdd={onNodeAdd}
        />
      </div>
      <WorkflowToolbar
        onSave={handleSave}
        onAutoLayout={handleAutoLayout}
        onExport={handleExport}
        isDirty={isDirty}
        isSaving={isSaving}
      />
    </div>
  );
}

export function WorkflowEditor({
  workspaceId,
  template,
  onBack,
}: {
  workspaceId: string;
  template: WorkflowTemplate | null;
  onBack: () => void;
}) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner workspaceId={workspaceId} template={template} onBack={onBack} />
    </ReactFlowProvider>
  );
}
