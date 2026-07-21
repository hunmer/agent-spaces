'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WorkflowTemplate, WorkflowNode } from '@agent-spaces/shared';
import { useWorkflowStore } from '@/stores/workflow';
import { Button } from '@/components/ui/button';
import { Plus, Plug, FileText, CheckSquare, Download, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { WorkflowTemplatesDialog } from '@/components/workflows/workflow-templates-dialog';
import { WorkflowPluginsDialog } from '@/components/workflow/workflow-plugins-dialog';
import { WorkflowListDialog } from '@/components/workflow/workflow-list-dialog';
import { WorkflowInfoDialog } from '@/components/workflow/workflow-info-dialog';
import { WorkflowCard } from '@/components/workflows/workflow-card';
import { WorkflowFilterToolbar, useWorkflowFilters } from '@/components/workflows/workflow-filters';
import type { WorkflowTemplatePreset } from '@/components/workflows/workflow-templates';
import { sdk } from '@/lib/sdk';
import { workflowApi } from '@/lib/workflow-api';
import { buildWorkflowPrompt } from '@/lib/workflow-prompt';
import { pluginApi } from '@/lib/workflow-plugin-api';
import { nativeNavigate } from '@/lib/navigate';
import type { AgentConfig } from '@agent-spaces/shared';
import JSZip from 'jszip';

export function WorkflowsPage() {
  const t = useTranslations('workflows');
  const router = useRouter();
  const { workflows, loadWorkflows, deleteWorkflow, duplicateWorkflow, upsertWorkflow } = useWorkflowStore();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [allPlugins, setAllPlugins] = useState<{ id: string; name: string; iconPath?: string }[]>([]);
  const filters = useWorkflowFilters({ workflows });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  // 加载插件清单（供卡片展示已启用插件图标）—— 整页只请求一次
  useEffect(() => {
    pluginApi.list().then((list) => {
      setAllPlugins(list.map(p => ({ id: p.id, name: p.name, iconPath: p.iconPath })));
    }).catch(() => {});
  }, []);

  const handleEdit = useCallback((wf: WorkflowTemplate) => {
    setEditingWorkflow(wf);
    setEditDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async (wf: WorkflowTemplate) => {
    await deleteWorkflow(wf.id);
  }, [deleteWorkflow]);

  const handleDuplicate = useCallback(async (wf: WorkflowTemplate) => {
    await duplicateWorkflow(wf.id);
  }, [duplicateWorkflow]);

  const handleImport = useCallback(async () => {
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

        const idMap: Record<string, string> = {};

        if (agents) {
          for (const [oldId, agentConfig] of Object.entries(agents)) {
            const { id: _oldId, enabled: _en, ...createBody } = agentConfig;
            try {
              const created = await sdk.agent.createPreset(createBody);
              idMap[oldId] = created.id;
            } catch { /* ignore */ }
          }
        }

        const remappedNodes = nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            agentConfigId: idMap[n.data.agentConfigId] ?? n.data.agentConfigId,
          },
        }));

        await sdk.workflow.create({ name: name ?? 'Imported Workflow', description, nodes: remappedNodes, edges } as any);
        loadWorkflows();
      } catch {
        // invalid JSON or structure
      }
    };
    input.click();
  }, [loadWorkflows]);

  const handleImportTemplate = useCallback(
    async (templateData: WorkflowTemplatePreset['data']) => {
      const { name, description, nodes, edges, agents } = templateData;
      const idMap: Record<string, string> = {};

      // 获取已有 agent，按 templateId 去重
      const existingAgents = await sdk.agent.listPresets();
      const byTemplateId = new Map<string, string>();
      for (const agent of existingAgents) {
        if (agent.templateId) {
          byTemplateId.set(agent.templateId, agent.id);
        }
      }

      if (agents) {
        for (const [oldId, agentConfig] of Object.entries(agents)) {
          // 已有同 templateId 的 agent 则复用，不重复创建
          if (agentConfig.templateId && byTemplateId.has(agentConfig.templateId)) {
            idMap[oldId] = byTemplateId.get(agentConfig.templateId)!;
            continue;
          }
          const { id: _oldId, enabled: _en, ...createBody } = agentConfig;
          try {
            const created = await sdk.agent.createPreset(createBody);
            idMap[oldId] = created.id;
          } catch { /* ignore */ }
        }
      }

      const remappedNodes = nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          agentConfigId: idMap[n.data.agentConfigId as string] ?? n.data.agentConfigId,
        },
      }));

      await sdk.workflow.create({ name, description, nodes: remappedNodes as unknown as WorkflowNode[], edges });
      loadWorkflows();
    },
    [loadWorkflows],
  );

  const handleRecordOpen = useCallback((wf: WorkflowTemplate) => {
    // 进入工作流时通知后端记录打开时间（fire-and-forget）
    workflowApi.recordOpen(wf.id).then(updated => upsertWorkflow(updated)).catch(() => {});
  }, [upsertWorkflow]);

  const handleListOpen = useCallback((wf: WorkflowTemplate) => {
    handleRecordOpen(wf);
    nativeNavigate(router, `/workflows/${wf.id}`);
    setListDialogOpen(false);
  }, [router, handleRecordOpen]);

  const handleListCreate = useCallback(async () => {
    const created = await workflowApi.create({
      name: t('defaultWorkflow.name'),
      nodes: [
        { id: `node_${Date.now()}_start`, type: 'start', label: t('defaultWorkflow.startLabel'), position: { x: 250, y: 50 }, data: {} },
        { id: `node_${Date.now()}_end`, type: 'end', label: t('defaultWorkflow.endLabel'), position: { x: 250, y: 400 }, data: {} },
      ],
      edges: [],
    });
    upsertWorkflow(created);
    handleRecordOpen(created);
    nativeNavigate(router, `/workflows/${created.id}`);
    setListDialogOpen(false);
  }, [upsertWorkflow, router, t, handleRecordOpen]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback((wf: WorkflowTemplate) => {
    const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${wf.name || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportSelected = useCallback(async () => {
    const selected = workflows.filter(wf => selectedIds.has(wf.id));
    if (selected.length === 0) return;
    if (selected.length === 1) {
      handleExport(selected[0]);
      return;
    }
    const zip = new JSZip();
    for (const wf of selected) {
      zip.file(`${wf.name || 'workflow'}.json`, JSON.stringify(wf, null, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflows.zip';
    a.click();
    URL.revokeObjectURL(url);
  }, [workflows, selectedIds, handleExport]);

  const handleDeleteSelected = useCallback(async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await deleteWorkflow(id);
    }
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [selectedIds, deleteWorkflow]);

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="hidden md:flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">{t('page.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('page.subtitle')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={selectionMode ? 'default' : 'outline'}
            onClick={() => { setSelectionMode(!selectionMode); setSelectedIds(new Set()); }}
          >
            <CheckSquare className="h-4 w-4 mr-1" /> {t('page.selectMode')}
          </Button>
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> {t('page.templates')}
          </Button>
          <Button variant="outline" onClick={() => setPluginsOpen(true)}>
            <Plug className="h-4 w-4 mr-1" /> {t('page.plugins')}
          </Button>
          <Button onClick={() => setInfoDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> {t('page.create')}
          </Button>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 mb-4">
        <WorkflowFilterToolbar state={filters} />
      </div>

      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm mb-2">{t('page.empty')}</p>
          <Button variant="outline" onClick={handleListCreate}>
            <Plus className="h-4 w-4 mr-1" /> {t('page.createFirst')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filters.filtered.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onExport={handleExport}
              allPlugins={allPlugins}
              selectionMode={selectionMode}
              selected={selectedIds.has(workflow.id)}
              onToggleSelect={() => toggleSelect(workflow.id)}
              onRecordOpen={handleRecordOpen}
            />
          ))}
        </div>
      )}

      <WorkflowTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        onImport={handleImportTemplate}
        onImportLocal={handleImport}
      />

      <WorkflowPluginsDialog
        open={pluginsOpen}
        onOpenChange={setPluginsOpen}
        workflow={null}
        onWorkflowChange={() => {}}
      />

      <WorkflowInfoDialog
        open={infoDialogOpen}
        onOpenChange={setInfoDialogOpen}
        workflow={null}
        showCopyInfo={false}
        enableSmartCreate
        onSave={async (updates) => {
          const created = await workflowApi.create({
            name: updates.name || t('defaultWorkflow.name'),
            description: updates.description,
            icon: updates.icon,
            tags: updates.tags,
            published: updates.published,
            nodes: [
              { id: `node_${Date.now()}_start`, type: 'start', label: t('defaultWorkflow.startLabel'), position: { x: 250, y: 50 }, data: {} },
              { id: `node_${Date.now()}_end`, type: 'end', label: t('defaultWorkflow.endLabel'), position: { x: 250, y: 400 }, data: {} },
            ],
            edges: [],
          });
          upsertWorkflow(created);
          handleRecordOpen(created);
          // 智能创建：携带完整 prompt 跳转，由 workflow-editor 自动生成
          if (updates.smartCreate) {
            const prompt = buildWorkflowPrompt({
              workflowDescription: created.description || '',
              issuePrompt: created.description || created.name || '',
            });
            const params = new URLSearchParams({ prompt });
            nativeNavigate(router, `/workflows/${created.id}?${params.toString()}`);
          } else {
            nativeNavigate(router, `/workflows/${created.id}`);
          }
        }}
      />

      <WorkflowInfoDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        workflow={editingWorkflow}
        onSave={async (updates) => {
          if (!editingWorkflow) return;
          const updated = await workflowApi.update(editingWorkflow.id, {
            name: updates.name,
            icon: updates.icon,
            description: updates.description,
            tags: updates.tags,
            published: updates.published,
          });
          upsertWorkflow(updated);
        }}
      />

      <WorkflowListDialog
        open={listDialogOpen}
        workflows={workflows}
        onSelect={handleListOpen}
        onCreate={handleListCreate}
        onClose={() => setListDialogOpen(false)}
      />

      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border rounded-lg shadow-lg px-4 py-3">
          <span className="text-sm text-muted-foreground">{t('page.selectedCount', { count: selectedIds.size })}</span>
          <Button variant="outline" size="sm" onClick={handleExportSelected}>
            <Download className="h-4 w-4 mr-1" /> {t('page.exportSelected')}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
            <Trash2 className="h-4 w-4 mr-1" /> {t('page.deleteSelected')}
          </Button>
        </div>
      )}
    </div>
  );
}
