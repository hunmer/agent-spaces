'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ReactFlowProvider, ReactFlow, Background, BackgroundVariant, Controls, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { NodeChange, EdgeChange, Connection, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Workflow, WorkflowNode, WorkflowEdge } from '@agent-spaces/shared';
import { workflowApi } from '@/lib/workflow-api';
import { createWorkflowEdgeId } from '@/lib/workflow-edge-id';
import { getNodeDefinition } from '@/lib/workflow-nodes';
import { WorkflowNode as WorkflowNodeComponent } from './workflow-node';
import { WorkflowEdge as WorkflowEdgeComponent } from './workflow-edge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Save, X, Maximize2 } from 'lucide-react';

const nodeTypes = { custom: WorkflowNodeComponent };
const edgeTypes = { custom: WorkflowEdgeComponent };

/**
 * EmbeddedWorkflowEditor — in-dialog editor for sub_workflow nodes.
 * Opens in a modal dialog with its own ReactFlow canvas.
 * The sub-workflow is stored as a separate Workflow entity linked by the node's workflowId.
 */

interface EmbeddedEditorProps {
  open: boolean;
  parentWorkflowId: string;
  subWorkflowId: string | null;
  onClose: () => void;
  onSave: (subWorkflowId: string) => void;
}

function EmbeddedEditorInner({
  subWorkflowId, onClose, onSave,
}: {
  subWorkflowId: string | null;
  onClose: () => void;
  onSave: (subWorkflowId: string) => void;
}) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Load sub-workflow
  useEffect(() => {
    if (!subWorkflowId) {
      // Create new sub-workflow
      workflowApi.create({
        name: '子工作流',
        nodes: [
          { id: `sub_start_${Date.now()}`, type: 'start', label: '开始', position: { x: 100, y: 50 }, data: {} },
          { id: `sub_end_${Date.now()}`, type: 'end', label: '结束', position: { x: 100, y: 300 }, data: {} },
        ],
        edges: [],
      }).then(wf => {
        setWorkflow(wf);
        setLoading(false);
      }).catch(() => setLoading(false));
      return;
    }

    workflowApi.get(subWorkflowId).then(wf => {
      setWorkflow(wf);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [subWorkflowId]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const handleSave = useCallback(async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      const saved = await workflowApi.update(workflow.id, {
        ...workflow,
        updatedAt: Date.now(),
      });
      setWorkflow(saved);
      setIsDirty(false);
      onSave(saved.id);
    } finally {
      setSaving(false);
    }
  }, [workflow, onSave]);

  // ReactFlow node/edge conversion
  const rfNodes: Node[] = useMemo(() =>
    workflow?.nodes.map(n => ({
      id: n.id,
      type: 'custom',
      position: n.position,
      data: { ...n.data, label: n.label, nodeType: n.type } as Record<string, unknown>,
    })) || [],
    [workflow?.nodes],
  );

  const rfEdges: Edge[] = useMemo(() =>
    workflow?.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'custom',
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
    })) || [],
    [workflow?.edges],
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!workflow) return;
    const updated = applyNodeChanges(changes, rfNodes);
    setWorkflow(w => {
      if (!w) return null;
      return {
        ...w,
        nodes: updated.map(n => {
          const existing = w.nodes.find(wn => wn.id === n.id);
          return existing ? { ...existing, position: n.position } : existing!;
        }).filter(Boolean),
      };
    });
    markDirty();
  }, [workflow, rfNodes, markDirty]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!workflow) return;
    const updated = applyEdgeChanges(changes, rfEdges);
    const remainingIds = new Set(updated.map(e => e.id));
    setWorkflow(w => w ? { ...w, edges: w.edges.filter(e => remainingIds.has(e.id)) } : null);
    markDirty();
  }, [workflow, rfEdges, markDirty]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!workflow) return;
    const edge: Workflow['edges'][0] = {
      id: createWorkflowEdgeId(connection),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
    };
    setWorkflow(w => w ? { ...w, edges: [...w.edges, edge] } : null);
    markDirty();
  }, [workflow, markDirty]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-[500px] text-sm text-muted-foreground">
        加载失败
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Input
          value={workflow.name}
          onChange={(e) => {
            setWorkflow(w => w ? { ...w, name: e.target.value } : null);
            markDirty();
          }}
          className="h-7 text-xs flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 px-0"
        />
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            <X className="h-3 w-3 mr-1" /> 关闭
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !isDirty}>
            <Save className="h-3 w-3 mr-1" /> 保存
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{ type: 'custom' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export function WorkflowEmbeddedEditor(props: EmbeddedEditorProps) {
  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>编辑子工作流</DialogTitle>
        </DialogHeader>
        <ReactFlowProvider>
          <EmbeddedEditorInner
            subWorkflowId={props.subWorkflowId}
            onClose={props.onClose}
            onSave={props.onSave}
          />
        </ReactFlowProvider>
      </DialogContent>
    </Dialog>
  );
}
