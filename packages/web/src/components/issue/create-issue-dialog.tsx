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
import { getMemberDisplayName } from '@/lib/agent-members';
import { useWorkflowStore } from '@/stores/workflow';
import { useLLMStore } from '@/stores/llm';
import { workflowApi } from '@/lib/workflow-api';
import { buildWorkflowPrompt } from '@/lib/workflow-prompt';

import type { AgentConfig, Issue, IssueStatus, WorkflowTemplate } from '@agent-spaces/shared';

const STATUS_OPTIONS: IssueStatus[] = [
  'draft', 'in_progress', 'completed', 'stopped', 'archived', 'error',
];

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: AgentConfig[];
  defaultTitle?: string;
  defaultDescription?: string;
  // 编辑模式：传入 issue 即为编辑
  issue?: Issue | null;
  onSubmit: (data: { title: string; description: string; members: string[]; workflowId?: string; status?: IssueStatus }) => Promise<Issue | void> | Issue | void;
}

export function CreateIssueDialog({ open, onOpenChange, agents = [], defaultTitle, defaultDescription, issue, onSubmit }: CreateIssueDialogProps) {
  const isEdit = !!issue;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [status, setStatus] = useState<IssueStatus>('draft');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [workflowInfoOpen, setWorkflowInfoOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [pendingWorkflowPrompt, setPendingWorkflowPrompt] = useState<string>('');
  const { workflows, loadWorkflows, upsertWorkflow } = useWorkflowStore();
  const { ensure: ensureLLM } = useLLMStore();
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

  // 编辑模式：打开时回填 issue 字段
  useEffect(() => {
    if (open && issue) {
      setTitle(issue.title);
      setDesc(issue.description);
      setMembers(issue.members?.length ? [...issue.members] : []);
      setStatus(issue.status);
      setSelectedWorkflowId(issue.workflowId ?? '');
    }
  }, [open, issue]);

  const handleClose = (val: boolean) => {
    if (!val) {
      setTitle('');
      setDesc('');
      setMembers([]);
      setStatus('draft');
      setSelectedWorkflowId('');
      setWorkflowInfoOpen(false);
      setEditingWorkflow(null);
      setPendingWorkflowPrompt('');
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

  const handleSubmit = async () => {
    if (!title.trim() && !desc.trim()) return;
    const workflowId = selectedWorkflowId || undefined;
    if (isEdit) {
      await onSubmit({ title: title.trim(), description: desc.trim(), members, workflowId, status });
      handleClose(false);
      return;
    }
    const created = await onSubmit({ title: title.trim(), description: desc.trim(), members, workflowId });
    // 仅在新建 workflow 时跳转去配置；选择已有 workflow 不跳转
    if (workflowId && pendingWorkflowPrompt && created?.channelId) {
      const prompt = buildWorkflowPrompt({
        workflowDescription: pendingWorkflowPrompt,
        issuePrompt: desc.trim() || defaultDescription?.trim() || title.trim() || defaultTitle?.trim() || '',
      });
      const params = new URLSearchParams({
        prompt,
        returnWorkspaceId: created.workspaceId,
        returnChannelId: created.channelId,
      });
      router.push(`/workflows/${workflowId}?${params.toString()}`);
    }
    handleClose(false);
  };

  const handleCreateWorkflow = async () => {
    const created = await workflowApi.create({
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
    setPendingWorkflowPrompt(saved.description || '');
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
            <DialogTitle>{t(isEdit ? 'edit.title' : 'create.title')}</DialogTitle>
            <DialogDescription>{t(isEdit ? 'edit.description' : 'create.description')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col lg:flex-row gap-4 pt-2 min-h-0">
            <div className="flex-1 space-y-3">
              <Input
                placeholder={t(isEdit ? 'edit.titlePlaceholder' : 'create.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              />
              <Textarea
                placeholder={t(isEdit ? 'edit.descriptionPlaceholder' : 'create.descriptionPlaceholder')}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={3}
                className="max-h-48 resize-none"
              />

              {isEdit && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{t('edit.statusLabel')}</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as IssueStatus)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {t(`status.${opt}`)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground">Workspace Workflow</label>
                  {!isEdit && (
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleCreateWorkflow}>
                      <Plus className="size-3.5" />
                      新建工作流
                    </Button>
                  )}
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
            <Button onClick={handleSubmit} disabled={isEdit ? !title.trim() : !title.trim() && !desc.trim()}>
              {isEdit ? tc('save') : t('create.submit')}
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

    </>
  );
}
