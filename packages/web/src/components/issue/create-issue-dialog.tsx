'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MemberPicker } from '@/components/common/member-picker';
import { SearchSelect } from '@/components/ui/search-select';
import { WorkflowInfoDialog } from '@/components/workflow/workflow-info-dialog';
import { FloatingPanel } from '@/components/common/floating-panel';
import { getMemberDisplayName } from '@/lib/agent-members';
import { useWorkflowStore } from '@/stores/workflow';
import { useLLMStore } from '@/stores/llm';
import { workflowApi } from '@/lib/workflow-api';

import type { AgentConfig, WorkflowTemplate } from '@agent-spaces/shared';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: AgentConfig[];
  defaultTitle?: string;
  defaultDescription?: string;
  onSubmit: (data: { title: string; description: string; members: string[]; workflowId?: string }) => void;
}

export function CreateIssueDialog({ open, onOpenChange, agents = [], defaultTitle, defaultDescription, onSubmit }: CreateIssueDialogProps) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [workflowInfoOpen, setWorkflowInfoOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [workflowPanel, setWorkflowPanel] = useState<{ id: string; title: string; src: string } | null>(null);
  // 创建工作流后暂存面板信息，等频道（issue）创建完成后再弹出
  const [pendingPanel, setPendingPanel] = useState<{ id: string; title: string; src: string } | null>(null);
  const { workflows, loadWorkflows, upsertWorkflow } = useWorkflowStore();
  const { models, providers, ensure: ensureLLM } = useLLMStore();
  const pendingDraftWorkflowIdRef = useRef<string | null>(null);
  const router = useRouter();
  const t = useTranslations('issue');
  const tc = useTranslations('common');

  const candidates = agents
    .filter((a) => a.enabled !== false)
    .map((a, i) => ({ id: a.id, label: getMemberDisplayName(agents, a.id), sortIndex: i }));
  const workspaceWorkflows = workflows.filter((workflow) => workflow.type === 'workspace');
  const workflowOptions = workspaceWorkflows.map((workflow) => {
    const agentCount = workflow.nodes.filter((node) => node.type === 'agent').length;
    return {
      value: workflow.id,
      label: `${workflow.name} (${agentCount} agents)`,
    };
  });

  useEffect(() => {
    if (open) loadWorkflows();
  }, [open, loadWorkflows]);

  useEffect(() => {
    if (open) ensureLLM();
  }, [open, ensureLLM]);

  useEffect(() => {
    if (open && defaultDescription) setDesc(defaultDescription);
  }, [open, defaultDescription]);

  useEffect(() => {
    if (open && defaultTitle) setTitle(defaultTitle);
  }, [open, defaultTitle]);

  const handleClose = (val: boolean) => {
    if (!val) {
      setTitle('');
      setDesc('');
      setMembers([]);
      setSelectedWorkflowId('');
      setWorkflowInfoOpen(false);
      setEditingWorkflow(null);
      setPendingPanel(null);
      if (pendingDraftWorkflowIdRef.current) {
        const draftId = pendingDraftWorkflowIdRef.current;
        pendingDraftWorkflowIdRef.current = null;
        void workflowApi.delete(draftId).catch(() => {});
      }
    }
    onOpenChange(val);
  };

  const toggleMember = (id: string) => {
    setMembers((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      // 用户手动改了 members，取消 workflow 选择
      if (selectedWorkflowId) setSelectedWorkflowId('');
      return next;
    });
  };

  const handleSubmit = () => {
    if (!title.trim() && !desc.trim()) return;
    onSubmit({ title: title.trim(), description: desc.trim(), members, workflowId: selectedWorkflowId || undefined });
    // 频道（issue）创建已发起：若之前已保存工作流草稿，此时再弹出面板
    if (pendingPanel) {
      setWorkflowPanel(pendingPanel);
      setPendingPanel(null);
    }
    handleClose(false);
  };

  const buildWorkflowPrompt = (workflowDescription: string) => {
    const issuePrompt = desc.trim() || defaultDescription?.trim() || title.trim() || defaultTitle?.trim() || '';

    // 关联供应商，得到每个模型可直接写入 agent_run 节点配置的字段（providerId/modelId/modelProvider）
    const providerByName = new Map(providers.map((p) => [p.name, p]));
    const modelOptions = models
      .map((m) => {
        const provider = providerByName.get(m.provider);
        if (!provider) return null;
        const tags: string[] = [];
        if (m.reasoning) tags.push('推理');
        if (m.vision) tags.push('视觉');
        if (m.embedding) tags.push('向量');
        if (m.thinkingEnabled) tags.push(`思考(${m.thinkingEffort})`);
        const costInfo = m.cost ? `输入${m.cost.inputPerMillion}/输出${m.cost.outputPerMillion} 每百万tokens` : '价格未知';
        const ctx = m.maxContextTokens ? `上下文${m.maxContextTokens}tokens` : '上下文未知';
        return {
          name: m.name,
          modelId: m.modelId,
          providerId: provider.id,
          modelProvider: provider.modelProvider ?? '',
          tags,
          costInfo,
          ctx,
        };
      })
      .filter(Boolean) as Array<{
        name: string;
        modelId: string;
        providerId: string;
        modelProvider: string;
        tags: string[];
        costInfo: string;
        ctx: string;
      }>;

    // 按能力粗分档：具备推理或高强度思考的归为核心/复杂任务模型，其余为常规/轻量任务模型
    const heavy = modelOptions.filter((m) => m.tags.includes('推理') || m.tags.some((t) => t.startsWith('思考(high')));
    const light = modelOptions.filter((m) => !heavy.includes(m));

    const modelSection = modelOptions.length
      ? [
          '当前服务端可用的供应商与模型（每个模型均给出可直接写入 agent_run 节点配置的字段）：',
          ...modelOptions.map(
            (m) =>
              `- ${m.name}：providerId="${m.providerId}"，modelId="${m.modelId}"，modelProvider="${m.modelProvider}"；能力[${m.tags.join('/') || '无'}]；${m.ctx}；${m.costInfo}`,
          ),
          heavy.length ? `适合核心/复杂 agent 的模型：${heavy.map((m) => m.name).join('、')}` : '',
          light.length ? `适合常规/轻量 agent 的模型：${light.map((m) => m.name).join('、')}` : '',
          '请根据每个 agent 节点承担任务的难度，从上面的列表里挑合适的 providerId/modelId/modelProvider 写入对应 agent_run 节点配置。',
        ].filter(Boolean).join('\n')
      : '当前服务端未配置任何模型，请在产出中提示用户先在「模型设置」中添加供应商和模型。';

    return [
      '请创建一个以多 agent 协同合作为主的 workspace workflow。',
      '要求：优先拆分为多个 agent 节点协作；为关键 agent 补充固定提示词；积极使用 channel、mcp、tool 来更新信息、同步状态和推进协作。',
      workflowDescription ? `工作流注释：${workflowDescription}` : '',
      issuePrompt ? `Issue 需求：${issuePrompt}` : '',
      modelSection,
    ].filter(Boolean).join('\n');
  };

  const handleCreateWorkflow = async () => {
    const created = await workflowApi.create({
      name: title.trim() || t('create.title'),
      description: desc.trim() || undefined,
      type: 'workspace',
      nodes: [
        { id: `start_${Date.now()}`, type: 'start', label: 'Start', position: { x: 240, y: 80 }, data: {} },
        { id: `end_${Date.now()}`, type: 'end', label: 'End', position: { x: 240, y: 360 }, data: {} },
      ],
      edges: [],
    });
    upsertWorkflow(created);
    setEditingWorkflow(created);
    pendingDraftWorkflowIdRef.current = created.id;
    setWorkflowInfoOpen(true);
  };

  const handleSaveWorkflow = async (updates: Partial<WorkflowTemplate>) => {
    if (!editingWorkflow) return;
    const saved = await workflowApi.update(editingWorkflow.id, {
      ...updates,
      type: 'workspace',
    });
    upsertWorkflow(saved);
    setEditingWorkflow(saved);
    setSelectedWorkflowId(saved.id);
    setWorkflowInfoOpen(false);
    pendingDraftWorkflowIdRef.current = null;
    const workflowHref = `/workflows/${saved.id}`;
    router.prefetch(workflowHref);
    void fetch(workflowHref, { credentials: 'same-origin' }).catch(() => {});
    // 不立即弹 FloatingPanel，等频道创建完成（handleSubmit）后再弹
    setPendingPanel({
      id: saved.id,
      title: saved.name,
      src: `${workflowHref}?embedded=issue&prompt=${encodeURIComponent(buildWorkflowPrompt(saved.description || ''))}`,
    });
  };

  const handleWorkflowInfoOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pendingDraftWorkflowIdRef.current) {
      const draftId = pendingDraftWorkflowIdRef.current;
      pendingDraftWorkflowIdRef.current = null;
      setEditingWorkflow(null);
      void workflowApi.delete(draftId).catch(() => {});
    }
    setWorkflowInfoOpen(nextOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('create.title')}</DialogTitle>
            <DialogDescription>{t('create.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col lg:flex-row gap-4 pt-2 min-h-0">
            <div className="flex-1 space-y-3">
              <Input
                placeholder={t('create.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
              <Textarea
                placeholder={t('create.descriptionPlaceholder')}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="max-h-48 resize-none"
              />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">Workspace Workflow</label>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCreateWorkflow}>
                    <Plus className="size-3.5" />
                    新建工作流
                  </Button>
                </div>
                <SearchSelect
                  value={selectedWorkflowId}
                  onChange={(value) => {
                    setSelectedWorkflowId(value);
                    if (value) {
                      const template = workspaceWorkflows.find((workflow) => workflow.id === value);
                      if (template) {
                        const agentIds = template.nodes
                          .filter((node) => node.type === 'agent')
                          .map((node) => node.data.agentConfigId as string)
                          .filter(Boolean);
                        setMembers((prev) => Array.from(new Set([...prev, ...agentIds])));
                      }
                    }
                  }}
                  options={workflowOptions}
                  placeholder="选择 workspace 工作流"
                  searchPlaceholder="搜索工作流"
                  allowCustom={false}
                />
              </div>

              <div className="lg:hidden">
                <MemberPicker
                  key={String(open)}
                  candidates={candidates}
                  selected={members}
                  onToggle={toggleMember}
                  label={t('create.membersLabel')}
                  searchPlaceholder={t('create.searchAgent')}
                  emptyText={t('create.noAgents')}
                />
              </div>
            </div>

            <div className="hidden lg:flex lg:w-64 xl:w-72 flex-col border-l pl-4 min-h-0">
              <MemberPicker
                key={String(open)}
                candidates={candidates}
                selected={members}
                onToggle={toggleMember}
                label={t('create.membersLabel')}
                searchPlaceholder={t('create.searchAgent')}
                emptyText={t('create.noAgents')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>{tc('cancel')}</Button>
            <Button onClick={handleSubmit} disabled={!title.trim() && !desc.trim()}>
              {t('create.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkflowInfoDialog
        open={workflowInfoOpen}
        onOpenChange={handleWorkflowInfoOpenChange}
        workflow={editingWorkflow}
        showCopyInfo={false}
        onSave={handleSaveWorkflow}
      />

      {workflowPanel && (
        <FloatingPanel
          id={`issue-workflow-create:${workflowPanel.id}`}
          title={workflowPanel.title}
          defaultWidth={Math.round((typeof window !== 'undefined' ? window.innerWidth : 1500) * 0.8)}
          defaultHeight={Math.round((typeof window !== 'undefined' ? window.innerHeight : 1025) * 0.8)}
          minWidth={720}
          minHeight={520}
          onClose={() => setWorkflowPanel(null)}
          onOpenInNewWindow={() => {
            window.open(workflowPanel.src, "_blank", "noopener,noreferrer");
          }}
        >
          <iframe
            src={workflowPanel.src}
            title={workflowPanel.title}
            className="h-full w-full border-0 bg-white"
          />
        </FloatingPanel>
      )}
    </>
  );
}
