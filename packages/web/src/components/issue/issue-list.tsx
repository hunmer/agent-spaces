'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useIssueStore } from '@/stores/issue';
import { useAgentStore } from '@/stores/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, CircleDot, Pencil, Trash2, CircleAlert, Archive, ArchiveRestore, CheckSquare, Square } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CreateIssueDialog } from './create-issue-dialog';
import { EditIssueDialog } from './edit-issue-dialog';
import { ItemListPanel, type ItemCtx } from '@/components/common/item-list-panel';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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
  'draft', 'planned', 'approved', 'completed', 'error',
];

interface IssueListProps {
  workspaceId: string;
}

export function IssueList({ workspaceId }: IssueListProps) {
  const { issues, activeIssueId, loading, loadIssues, createIssue, updateIssue, updateIssueStatus, deleteIssue, setActiveIssue } = useIssueStore();
  const { agents, ensure: ensureAgents } = useAgentStore();
  const t = useTranslations('issue');
  const tc = useTranslations('common');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [batchDeleteInfo, setBatchDeleteInfo] = useState<{ ids: Set<string>; exit: () => void } | null>(null);

  const activeIssues = useMemo(() => issues.filter(i => i.status !== 'archived'), [issues]);
  const archivedIssues = useMemo(() => issues.filter(i => i.status === 'archived'), [issues]);

  useEffect(() => {
    loadIssues(workspaceId);
    ensureAgents();
  }, [workspaceId, loadIssues, ensureAgents]);

  const sortCompare = useCallback((a: Issue, b: Issue, field: string) => {
    switch (field) {
      case 'createdAt':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'updatedAt':
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case 'status': {
        const ai = GROUP_ORDER.indexOf(a.status);
        const bi = GROUP_ORDER.indexOf(b.status);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      }
      default: return 0;
    }
  }, []);

  const getStatusGroups = useCallback((sorted: Issue[]) => {
    return GROUP_ORDER
      .map(status => ({
        key: status,
        label: t(`status.${status}`),
        items: sorted.filter(i => i.status === status),
      }))
      .filter(g => g.items.length > 0);
  }, [t]);

  const handleCreate = async (data: { title: string; description: string; members: string[]; workflowId?: string }) => {
    return createIssue(workspaceId, data.title, data.description, data.members, data.workflowId);
  };

  const handleToggleArchive = async (issue: Issue) => {
    const newStatus: IssueStatus = issue.status === 'archived' ? 'completed' : 'archived';
    await updateIssueStatus(workspaceId, issue.id, newStatus);
  };

  const renderIssueItem = (issue: Issue, ctx: ItemCtx) => {
    const trigger = (
      <div
        className={cn(
          'w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2',
          ctx.isActive && 'bg-accent',
          ctx.selected && ctx.multiSelect && 'bg-blue-500/10',
        )}
        onClick={() => {
          if (ctx.multiSelect) ctx.toggleSelect();
          else setActiveIssue(issue.id);
        }}
      >
        {ctx.multiSelect && (
          <button type="button" className="shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); ctx.toggleSelect(); }}>
            {ctx.selected ? <CheckSquare className="size-3.5 text-blue-500" /> : <Square className="size-3.5 text-muted-foreground" />}
          </button>
        )}
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
      </div>
    );

    if (ctx.multiSelect) return trigger;

    return (
      <ContextMenu key={issue.id}>
        <ContextMenuTrigger>{trigger}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setEditingIssue(issue)}>
            <Pencil className="size-4 mr-2" />{tc('edit')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleToggleArchive(issue)}>
            <Archive className="size-4 mr-2" />{t('list.archive')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
            <Trash2 className="size-4 mr-2" />{tc('delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderArchivedIssue = (issue: Issue) => (
    <ContextMenu key={issue.id}>
      <ContextMenuTrigger
        className={cn(
          'w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2 opacity-60',
          activeIssueId === issue.id && 'bg-accent opacity-100',
        )}
        onClick={() => setActiveIssue(issue.id)}
      >
        <CircleDot className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{issue.title}</div>
          <div className="text-xs text-muted-foreground">
            {t('list.taskCount', { count: issue.tasks.length })}
          </div>
        </div>
        <Badge variant="outline" className={`text-[10px] shrink-0 border-none ${STATUS_STYLE['archived']}`}>
          {t('status.archived')}
        </Badge>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => handleToggleArchive(issue)}>
          <ArchiveRestore className="size-4 mr-2" />{t('list.unarchive')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
          <Trash2 className="size-4 mr-2" />{tc('delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  return (
    <ItemListPanel
      title={t('list.title')}
      items={activeIssues}
      archivedItems={archivedIssues}
      getItemId={issue => issue.id}
      getItemDate={issue => issue.createdAt}
      activeId={activeIssueId ?? undefined}
      loading={loading}
      sortFields={[
        { value: 'createdAt', label: tc('sortByCreated') },
        { value: 'updatedAt', label: tc('sortByLastReply') },
        { value: 'status', label: tc('sortByStatus') },
      ]}
      defaultSortField="createdAt"
      sortCompare={sortCompare}
      defaultGroupMode="status"
      getStatusGroups={getStatusGroups}
      renderItem={renderIssueItem}
      renderArchivedItem={renderArchivedIssue}
      renderSkeleton={i => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md">
          <Skeleton className="size-4 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
      )}
      skeletonCount={5}
      emptyState={
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center py-12">
          <div className="rounded-full bg-muted p-3">
            <CircleAlert className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('list.emptyTitle')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('list.emptyDescription')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{t('list.addIssue')}
          </Button>
        </div>
      }
      archivedLabel={t('list.archived')}
      clearArchivedTitle={t('list.clearArchived')}
      clearArchivedConfirm={t('list.clearArchivedConfirm', { count: archivedIssues.length })}
      onClearArchived={() => Promise.all(archivedIssues.map(i => deleteIssue(workspaceId, i.id)))}
      enableMultiSelect
      multiSelectLabel={t('list.multiSelect')}
      batchActions={(ids, exit) => (
        <>
          <button onClick={() => Promise.all([...ids].map(id => updateIssueStatus(workspaceId, id, 'archived'))).then(exit)} className="p-0.5 hover:bg-accent rounded cursor-pointer" title={t('list.archive')}>
            <Archive className="size-3.5" />
          </button>
          <button onClick={() => setBatchDeleteInfo({ ids: new Set(ids), exit })} className="p-0.5 hover:bg-accent rounded cursor-pointer text-destructive" title={tc('delete')}>
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
      tc={tc}
      headerButtons={
        <button onClick={() => setCreateOpen(true)} className="p-0.5 hover:bg-accent rounded cursor-pointer">
          <Plus className="size-3.5" />
        </button>
      }
      dialogs={
        <>
          <CreateIssueDialog open={createOpen} onOpenChange={setCreateOpen} agents={agents} onSubmit={handleCreate} />
          {editingIssue && (
            <EditIssueDialog
              issue={editingIssue}
              open={!!editingIssue}
              onOpenChange={open => { if (!open) setEditingIssue(null); }}
              agents={agents}
              onSave={async data => {
                await updateIssue(workspaceId, editingIssue.id, data);
                setEditingIssue(null);
              }}
            />
          )}
          <AlertDialog open={!!batchDeleteInfo} onOpenChange={open => !open && setBatchDeleteInfo(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('list.batchDeleteConfirm', { count: batchDeleteInfo?.ids.size ?? 0 })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  if (!batchDeleteInfo) return;
                  await Promise.all([...batchDeleteInfo.ids].map(id => deleteIssue(workspaceId, id)));
                  batchDeleteInfo.exit();
                  setBatchDeleteInfo(null);
                }}>{tc('delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  );
}
