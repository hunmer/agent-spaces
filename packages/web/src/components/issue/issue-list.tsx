'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useIssueStore } from '@/stores/issue';
import { useAgentStore } from '@/stores/agent';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, CircleDot, Pencil, Trash2, CircleAlert, Archive, ArchiveRestore, MoreHorizontal, ChevronRight, Check, ArrowUpDown } from 'lucide-react';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
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
  'draft', 'planned', 'approved', 'completed', 'error',
];

type GroupMode = 'none' | 'time' | 'status';

const TIME_GROUP_ORDER = ['today', 'yesterday', 'thisWeek', 'earlier'] as const;
const TIME_LABEL_KEYS: Record<string, string> = {
  today: 'timeToday', yesterday: 'timeYesterday', thisWeek: 'timeThisWeek', earlier: 'timeEarlier',
};

function getTimeGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  if (date >= weekAgo) return 'thisWeek';
  return 'earlier';
}

interface IssueListProps {
  workspaceId: string;
}

export function IssueList({ workspaceId }: IssueListProps) {
  const { issues, activeIssueId, loading, loadIssues, createIssue, updateIssue, updateIssueStatus, deleteIssue, setActiveIssue } = useIssueStore();
  const { agents, ensure: ensureAgents } = useAgentStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('status');
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [clearArchiveOpen, setClearArchiveOpen] = useState(false);
  const [sortField, setSortField] = useState<'createdAt' | 'updatedAt' | 'status'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const t = useTranslations('issue');
  const tc = useTranslations('common');

  useEffect(() => {
    loadIssues(workspaceId);
    ensureAgents();
  }, [workspaceId, loadIssues, ensureAgents]);

  const handleCreate = async (data: { title: string; description: string; members: string[]; workflowId?: string }) => {
    await createIssue(workspaceId, data.title, data.description, data.members, data.workflowId);
  };

  const activeIssues = useMemo(() => issues.filter((i) => i.status !== 'archived'), [issues]);
  const archivedIssues = useMemo(() => issues.filter((i) => i.status === 'archived'), [issues]);

  const sortedActiveIssues = useMemo(() => {
    const sorted = [...activeIssues];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'status': {
          const ai = GROUP_ORDER.indexOf(a.status);
          const bi = GROUP_ORDER.indexOf(b.status);
          cmp = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          break;
        }
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [activeIssues, sortField, sortOrder]);

  const grouped = GROUP_ORDER
    .map((status) => ({
      status,
      items: sortedActiveIssues.filter((i) => i.status === status),
    }))
    .filter((g) => g.items.length > 0);

  const timeGroups = useMemo(() => {
    const groups: Record<string, Issue[]> = {};
    for (const issue of sortedActiveIssues) {
      const key = getTimeGroup(issue.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(issue);
    }
    return TIME_GROUP_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: tc(TIME_LABEL_KEYS[k]), items: groups[k]! }));
  }, [sortedActiveIssues, tc]);

  const renderIssueItem = (issue: Issue) => (
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
        <ContextMenuItem onClick={() => handleToggleArchive(issue)}>
          <Archive className="size-4 mr-2" />
          {t('list.archive')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
          <Trash2 className="size-4 mr-2" />
          {tc('delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  const handleToggleArchive = async (issue: Issue) => {
    const newStatus: IssueStatus = issue.status === 'archived' ? 'completed' : 'archived';
    await updateIssueStatus(workspaceId, issue.id, newStatus);
  };

  const handleClearArchived = async () => {
    await Promise.all(archivedIssues.map((i) => deleteIssue(workspaceId, i.id)));
    setClearArchiveOpen(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs font-medium text-muted-foreground shrink-0">
          <span>{t('list.title')}</span>
        </div>
        <div className="p-2 space-y-1">
          <SkeletonGroup count={5}>
            {(i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md">
                <Skeleton className="size-4 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
            )}
          </SkeletonGroup>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs font-medium text-muted-foreground shrink-0">
        <span>{t('list.title')}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCreateOpen(true)} className="p-0.5 hover:bg-accent rounded">
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
              <ArrowUpDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {([
                { field: 'createdAt' as const, label: tc('sortByCreated') },
                { field: 'updatedAt' as const, label: tc('sortByLastReply') },
                { field: 'status' as const, label: tc('sortByStatus') },
              ]).map(({ field, label }) => (
                <DropdownMenuItem key={field} onClick={() => {
                  if (sortField === field) setSortOrder((o) => o === 'asc' ? 'desc' : 'asc');
                  else { setSortField(field); setSortOrder('desc'); }
                }}>
                  {sortField === field && <Check className="size-3.5" />}
                  {label}
                  {sortField === field && <span className="ml-auto text-[10px] text-muted-foreground">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => setGroupMode('none')}>
                {groupMode === 'none' && <Check className="size-3.5" />}
                {tc('groupNone')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupMode('time')}>
                {groupMode === 'time' && <Check className="size-3.5" />}
                {tc('groupByTime')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGroupMode('status')}>
                {groupMode === 'status' && <Check className="size-3.5" />}
                {tc('groupByStatus')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={archivedIssues.length === 0}
                onClick={() => setClearArchiveOpen(true)}
              >
                <Trash2 className="size-3.5" />
                {t('list.clearArchived')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {grouped.length === 0 && archivedIssues.length === 0 && (
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
        {groupMode === 'none' && sortedActiveIssues.map((issue) => renderIssueItem(issue))}
        {groupMode === 'status' && grouped.map((group) => (
          <Collapsible key={group.status} open={groupOpen[group.status] !== false} onOpenChange={(open) => setGroupOpen((prev) => ({ ...prev, [group.status]: open }))}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', groupOpen[group.status] !== false && 'rotate-90')} />
              {t(`status.${group.status}`)} ({group.items.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {group.items.map((issue) => renderIssueItem(issue))}
            </CollapsibleContent>
          </Collapsible>
        ))}
        {groupMode === 'time' && timeGroups.map((group) => (
          <Collapsible key={group.key} open={groupOpen[group.key] !== false} onOpenChange={(open) => setGroupOpen((prev) => ({ ...prev, [group.key]: open }))}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', groupOpen[group.key] !== false && 'rotate-90')} />
              {group.label} ({group.items.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {group.items.map((issue) => renderIssueItem(issue))}
            </CollapsibleContent>
          </Collapsible>
        ))}

        {archivedIssues.length > 0 && (
          <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', archivedOpen && 'rotate-90')} />
              <Archive className="size-3" />
              {t('list.archived')} ({archivedIssues.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {archivedIssues.map((issue) => (
                <ContextMenu key={issue.id}>
                  <ContextMenuTrigger
                    onClick={() => setActiveIssue(issue.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2 opacity-60 ${
                      activeIssueId === issue.id ? 'bg-accent opacity-100' : ''
                    }`}
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
                      <ArchiveRestore className="size-4 mr-2" />
                      {t('list.unarchive')}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => deleteIssue(workspaceId, issue.id)}>
                      <Trash2 className="size-4 mr-2" />
                      {tc('delete')}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </ScrollArea>

      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        agents={agents}
        onSubmit={handleCreate}
      />

      {editingIssue && (
        <EditIssueDialog
          issue={editingIssue}
          open={!!editingIssue}
          onOpenChange={(open) => { if (!open) setEditingIssue(null); }}
          agents={agents}
          onSave={async (data) => {
            await updateIssue(workspaceId, editingIssue.id, data);
            setEditingIssue(null);
          }}
        />
      )}

      <AlertDialog open={clearArchiveOpen} onOpenChange={setClearArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('list.clearArchived')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('list.clearArchivedConfirm', { count: archivedIssues.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearArchived}>{tc('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
