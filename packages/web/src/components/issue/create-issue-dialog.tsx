'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { getMemberDisplayName } from '@/lib/agent-members';
import { useLLMStore } from '@/stores/llm';

import type { AgentConfig, Issue, IssueStatus } from '@agent-spaces/shared';

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
  onSubmit: (data: { title: string; description: string; members: string[]; status?: IssueStatus }) => Promise<Issue | void> | Issue | void;
}

export function CreateIssueDialog({ open, onOpenChange, agents = [], defaultTitle, defaultDescription, issue, onSubmit }: CreateIssueDialogProps) {
  const isEdit = !!issue;
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [status, setStatus] = useState<IssueStatus>('draft');
  const { ensure: ensureLLM } = useLLMStore();
  const t = useTranslations('issue');
  const tc = useTranslations('common');

  const candidates = agents
    .filter((a) => a.enabled !== false)
    .map((a, i) => ({ id: a.id, label: getMemberDisplayName(agents, a.id), sortIndex: i }));

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
    }
  }, [open, issue]);

  const handleClose = (val: boolean) => {
    if (!val) {
      setTitle('');
      setDesc('');
      setMembers([]);
      setStatus('draft');
    }
    onOpenChange(val);
  };

  const toggleMember = (id: string) => {
    setMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!title.trim() && !desc.trim()) return;
    if (isEdit) {
      await onSubmit({ title: title.trim(), description: desc.trim(), members, status });
      handleClose(false);
      return;
    }
    await onSubmit({ title: title.trim(), description: desc.trim(), members });
    handleClose(false);
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

    </>
  );
}
