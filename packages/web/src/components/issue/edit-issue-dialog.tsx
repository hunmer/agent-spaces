'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { AgentIcon } from '@/components/common/agent-icon';
import { getMemberDisplayName } from '@/lib/agent-members';
import { useWorkflowStore } from '@/stores/workflow';
import type { Issue, IssueStatus, AgentConfig } from '@agent-spaces/shared';

const STATUS_OPTIONS: IssueStatus[] = [
  'draft', 'planned', 'in_progress', 'review_pending', 'changes_requested',
  'approved', 'completed', 'archived',
];

interface EditIssueDialogProps {
  issue: Issue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents?: AgentConfig[];
  onSave: (data: { title: string; description: string; status: IssueStatus; members: string[]; workflowId?: string | null }) => Promise<void>;
}

export function EditIssueDialog({ issue, open, onOpenChange, agents = [], onSave }: EditIssueDialogProps) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [members, setMembers] = useState<string[]>(issue.members || []);
  const [memberQuery, setMemberQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(issue.workflowId ?? '');
  const { workflows, loadWorkflows } = useWorkflowStore();
  const t = useTranslations('issue');
  const tc = useTranslations('common');

  useEffect(() => {
    if (open) {
      setTitle(issue.title);
      setDescription(issue.description);
      setStatus(issue.status);
      setMembers(issue.members?.length ? [...issue.members] : []);
      setMemberQuery('');
      setSelectedWorkflowId(issue.workflowId ?? '');
    }
  }, [open, issue]);

  useEffect(() => {
    if (open) loadWorkflows();
  }, [open, loadWorkflows]);

  const toggleMember = (id: string) => {
    setMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const selectWorkflow = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    if (!workflowId) return;
    const template = workflows.find((workflow) => workflow.id === workflowId);
    if (!template) return;
    const agentIds = template.nodes.map((node) => node.data.agentConfigId);
    setMembers((prev) => Array.from(new Set([...prev, ...agentIds])));
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), description: description.trim(), status, members, workflowId: selectedWorkflowId === '__none__' ? null : (selectedWorkflowId || null) });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const filtered = agents.filter((a) =>
    `${a.name || ''} ${a.role || ''}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('edit.title')}</DialogTitle>
          <DialogDescription>{t('edit.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder={t('edit.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
          <Textarea
            placeholder={t('edit.descriptionPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Workflow Template</label>
            <select
              value={selectedWorkflowId || '__none__'}
              onChange={(e) => selectWorkflow(e.target.value === '__none__' ? '' : e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="__none__">None (use default pipeline)</option>
              {workflows.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.nodes.length} agents)</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('edit.membersLabel')}</label>
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder={t('edit.searchAgent')}
            />
            <div className="max-h-36 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground py-2 text-center">{t('edit.noAgents')}</p>
              )}
              {filtered.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleMember(agent.id)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted text-left text-sm transition-colors"
                >
                  <AgentIcon
                    agentId={agent.id}
                    name={getMemberDisplayName(agents, agent.id)}
                    className="size-5 rounded-full"
                  />
                  <span className="flex-1 truncate">{getMemberDisplayName(agents, agent.id)}</span>
                  <div
                    className={`flex items-center justify-center size-4 rounded border ${
                      members.includes(agent.id)
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    }`}
                  />
                </button>
              ))}
            </div>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <span key={m} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                    {m === 'user' ? (
                      tc('user')
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <AgentIcon agentId={m} name={getMemberDisplayName(agents, m)} className="size-3.5 rounded-full" />
                        {getMemberDisplayName(agents, m)}
                      </span>
                    )}
                    <button type="button" onClick={() => toggleMember(m)} className="hover:text-destructive">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? tc('saving') : tc('save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
