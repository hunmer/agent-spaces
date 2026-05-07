'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import type { Workspace, WorkflowTemplate } from '@agent-spaces/shared';
import { useWorkflowStore } from '@/stores/workflow';
import { WorkflowMiniPreview } from '@/components/workflow/workflow-mini-preview';
import { WorkflowEditor } from '@/components/workflow/workflow-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Pencil, Copy, Trash2, Upload } from 'lucide-react';
import { authHeaders } from '@/lib/auth';
import type { AgentConfig } from '@agent-spaces/shared';

interface WorkflowWithWorkspace extends WorkflowTemplate {
  workspaceName: string;
}

export function WorkflowsPage({ workspaces }: { workspaces: Workspace[] }) {
  const router = useRouter();
  const { workflows, loadWorkflows, deleteWorkflow, duplicateWorkflow } = useWorkflowStore();
  const [allWorkflows, setAllWorkflows] = useState<WorkflowWithWorkspace[]>([]);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowWithWorkspace | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');

  const loadAllWorkflows = useCallback(() => {
    if (workspaces.length === 0) return;
    Promise.all(
      workspaces.map(async (ws) => {
        try {
          const res = await fetch(`/api/workspaces/${ws.id}/workflows`, { headers: authHeaders() });
          if (!res.ok) return [];
          const wfs: WorkflowTemplate[] = await res.json();
          return wfs.map((w) => ({ ...w, workspaceName: ws.name }));
        } catch {
          return [];
        }
      })
    ).then((results) => {
      setAllWorkflows(results.flat());
    });
  }, [workspaces]);

  useEffect(() => {
    loadAllWorkflows();
  }, [loadAllWorkflows]);

  const handleCreate = useCallback(() => {
    if (workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
    setCreatingNew(true);
  }, [workspaces]);

  const handleDelete = useCallback(async (wf: WorkflowWithWorkspace) => {
    await fetch(`/api/workspaces/${wf.workspaceId}/workflows/${wf.id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    setAllWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
  }, []);

  const handleDuplicate = useCallback(async (wf: WorkflowWithWorkspace) => {
    const res = await fetch(`/api/workspaces/${wf.workspaceId}/workflows/${wf.id}/duplicate`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) return;
    const dup: WorkflowTemplate = await res.json();
    setAllWorkflows((prev) => [...prev, { ...dup, workspaceName: wf.workspaceName }]);
  }, []);

  const handleImport = useCallback(async () => {
    if (workspaces.length === 0) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { name, description, nodes, edges, agents } = data as {
          name?: string;
          description?: string;
          nodes?: { id: string; type: string; position: { x: number; y: number }; data: { agentConfigId: string; [k: string]: unknown } }[];
          edges?: { id: string; source: string; target: string }[];
          agents?: Record<string, Omit<AgentConfig, 'apiKey'>>;
        };
        if (!nodes || !edges) return;

        const targetWs = workspaces[0];
        const idMap: Record<string, string> = {};

        // Create agents first, map old IDs to new
        if (agents) {
          for (const [oldId, agentConfig] of Object.entries(agents)) {
            const { id: _oldId, enabled: _en, ...createBody } = agentConfig;
            const res = await fetch(`/api/workspaces/${targetWs.id}/agents/presets`, {
              method: 'POST',
              headers: { ...authHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify(createBody),
            });
            if (res.ok) {
              const created: AgentConfig = await res.json();
              idMap[oldId] = created.id;
            }
          }
        }

        // Remap node agentConfigIds
        const remappedNodes = nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            agentConfigId: idMap[n.data.agentConfigId] ?? n.data.agentConfigId,
          },
        }));

        const res = await fetch(`/api/workspaces/${targetWs.id}/workflows`, {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name ?? 'Imported Workflow', description, nodes: remappedNodes, edges }),
        });
        if (res.ok) {
          const wf: WorkflowTemplate = await res.json();
          setAllWorkflows((prev) => [...prev, { ...wf, workspaceName: targetWs.name }]);
        }
      } catch {
        // invalid JSON or structure
      }
    };
    input.click();
  }, [workspaces]);

  if (editingWorkflow || creatingNew) {
    return (
      <WorkflowEditor
        workspaceId={editingWorkflow?.workspaceId ?? selectedWorkspaceId}
        template={editingWorkflow}
        onBack={() => {
          setEditingWorkflow(null);
          setCreatingNew(false);
          loadAllWorkflows();
        }}
      />
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">工作流</h2>
          <p className="text-sm text-muted-foreground">
            管理所有工作空间的 Workflow 模板
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImport} disabled={workspaces.length === 0}>
            <Upload className="h-4 w-4 mr-1" /> 导入
          </Button>
          <Button onClick={handleCreate} disabled={workspaces.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> 新建工作流
          </Button>
        </div>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-2">请先创建一个工作空间</p>
          <Button variant="outline" onClick={() => router.push('/')}>
            前往首页
          </Button>
        </div>
      ) : allWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-2">暂无工作流模板</p>
          <Button variant="outline" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" /> 创建第一个工作流
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allWorkflows.map((workflow) => (
            <Card key={workflow.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <ReactFlowProvider>
                <WorkflowMiniPreview template={workflow} />
              </ReactFlowProvider>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{workflow.name}</CardTitle>
                {workflow.description && (
                  <CardDescription className="text-xs">{workflow.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {workflow.workspaceName} · {workflow.nodes.length} 个节点
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingWorkflow(workflow)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDuplicate(workflow)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(workflow)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
