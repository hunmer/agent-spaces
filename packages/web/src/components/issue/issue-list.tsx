'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useIssueStore } from '@/stores/issue';
import { useAgentStore } from '@/stores/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Plus, CircleDot, Pencil, Trash2, CircleAlert } from 'lucide-react';
import { CreateIssueDialog } from './create-issue-dialog';
import { EditIssueDialog } from './edit-issue-dialog';
import type { Issue, IssueStatus } from '@agent-spaces/shared';

const STATUS_STYLE: Record<IssueStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  planned: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  in_progress: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  review_pending: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  changes_requested: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-green-600/10 text-green-600 dark:text-green-400',
  archived: 'bg-muted text-muted-foreground',
  error: 'bg-destructive/10 text-destructive',
};

const GROUP_ORDER: IssueStatus[] = [
  'in_progress', 'review_pending', 'changes_requested',
  'draft', 'planned', 'approved', 'completed', 'error', 'archived',
];

interface IssueListProps {
  workspaceId: string;
}

export function IssueList({ workspaceId }: IssueListProps) {
  const { issues, activeIssueId, loading, loadIssues, createIssue, updateIssue, deleteIssue, setActiveIssue } = useIssueStore();
  const { agents, ensure: ensureAgents } = useAgentStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const t = useTranslations('issue');
  const tc = useTranslations('common');

  useEffect(() => {
    loadIssues(workspaceId);
    ensureAgents(workspaceId);
  }, [workspaceId, loadIssues, ensureAgents]);

  const handleCreate = async (data: { title: string; description: string; members: string[] }) => {
    await createIssue(workspaceId, data.title, data.description, data.members);
  };

  const grouped = GROUP_ORDER
    .map((status) => ({
      status,
      items: issues.filter((i) => i.status === status),
    }))
    .filter((g) => g.items.length > 0);

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">{tc('loading')}</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-2 border-b">
        <span className="text-sm font-medium">{t('list.title')}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center py-12">
            <div className="rounded-full bg-muted p-3">
              <CircleAlert className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('list.emptyTitle')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('list.emptyDescription')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('list.addIssue')}
            </Button>
          </div>
        )}
        {grouped.map((group) => (
          <div key={group.status}>
            <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
              {t(`status.${group.status}`)} ({group.items.length})
            </div>
            {group.items.map((issue) => (
              <ContextMenu key={issue.id}>
                <ContextMenuTrigger
                  onClick={() => setActiveIssue(issue.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2 ${
                    activeIssueId === issue.id ? 'bg-accent' : ''
                  }`}
                >
                  <CircleDot className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{issue.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t('list.taskCount', { count: issue.tasks.length })}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 border-none ${STATUS_STYLE[issue.status]}`}>
                    {t(`status.${issue.status}`)}
                  </Badge>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => setEditingIssue(issue)}>
                    <Pencil className="size-4 mr-2" />
                    {tc('edit')}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
                    <Trash2 className="size-4 mr-2" />
                    {tc('delete')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        ))}
      </ScrollArea>

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        workspaceId={workspaceId}
        onSubmit={handleCreate}
      />

      {editingIssue && (
        <EditIssueDialog
          issue={editingIssue}
          open={!!editingIssue}
          onOpenChange={(open) => { if (!open) setEditingIssue(null); }}
          agents={agents}
          workspaceId={workspaceId}
          onSave={async (data) => {
            await updateIssue(workspaceId, editingIssue.id, data);
            setEditingIssue(null);
          }}
        />
      )}
    </div>
  );
}
