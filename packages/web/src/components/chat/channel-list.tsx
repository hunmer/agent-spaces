'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useChannelStore } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { Bot, Hash, MessageCircle, AlertCircle, Plus, Pencil, FolderOpen, Archive, ArchiveRestore, Trash2, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ChannelDialog } from './channel-dialog';
import { normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import { sdk } from '@/lib/sdk';
import { getWS } from '@/lib/ws';
import { ItemListPanel, type ItemCtx } from '@/components/common/item-list-panel';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { HoldToConfirm } from '@/components/ui/hold-toconfirm';
import { useIssueStore } from '@/stores/issue';

import type { Channel, Message } from '@agent-spaces/shared';

const typeBadgeConfig: Record<Channel['type'], { className: string; icon: typeof Hash }> = {
  general: { className: 'bg-muted text-muted-foreground', icon: Hash },
  issue: { className: 'bg-amber-500/15 text-amber-600', icon: AlertCircle },
  agent: { className: 'bg-blue-500/15 text-blue-600', icon: MessageCircle },
  'mini-apps': { className: 'bg-purple-500/15 text-purple-600', icon: MessageCircle },
};

const statusBadgeConfig: Record<string, { className: string; label: string }> = {
  pending: { className: 'bg-yellow-500/15 text-yellow-600', label: 'status.pending' },
  streaming: { className: 'bg-blue-500/15 text-blue-600', label: 'status.streaming' },
  waiting_for_user: { className: 'bg-amber-500/15 text-amber-600', label: 'status.waitingForUser' },
  completed: { className: 'bg-emerald-500/15 text-emerald-600', label: 'status.completed' },
  error: { className: 'bg-red-500/15 text-red-600', label: 'status.error' },
};

function formatRelativeTime(ts: string | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 60000) return '刚刚';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}分钟前`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}小时前`;
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function lastMsgPreview(msgs: Message[] | undefined): { text: string; status: Message['status']; time: string } | null {
  if (!msgs || msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  if (!last) return null;
  const text = (last.content ?? '').replace(/<[^>]*>/g, '').slice(0, 60);
  return { text: text || '...', status: last.status, time: formatRelativeTime(last.createdAt) };
}

interface ChannelListProps {
  workspaceId: string;
}

export function ChannelList({ workspaceId }: ChannelListProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const {
    channels, activeChannelId, messages,
    loadChannels, createChannel, updateChannel, deleteChannel, setActiveChannel, upsertChannel, sendMessage,
  } = useChannelStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Channel | null>(null);
  const [deleteAlsoIssue, setDeleteAlsoIssue] = useState(false);
  const [batchDeleteInfo, setBatchDeleteInfo] = useState<{ ids: Set<string>; exit: () => void } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const agents = useAgentStore(s => s.agents);
  const ensureAgents = useAgentStore(s => s.ensure);

  const activeChannels = useMemo(() => channels.filter(c => !c.archived && c.type !== 'mini-apps'), [channels]);
  const archivedChannels = useMemo(() => channels.filter(c => c.archived && c.type !== 'mini-apps'), [channels]);

  useEffect(() => {
    setInitialLoading(true);
    loadChannels(workspaceId).finally(() => setInitialLoading(false));
    ensureAgents();
  }, [workspaceId, loadChannels, ensureAgents]);

  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.updated', (data: unknown) => {
      upsertChannel(data as Partial<Channel> & Pick<Channel, 'id'>);
    });
    return () => { unsub(); };
  }, [workspaceId, upsertChannel]);

  const sortCompare = useCallback((a: Channel, b: Channel, field: string) => {
    switch (field) {
      case 'createdAt':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'lastReply': {
        const aLast = messages[a.id]?.at(-1)?.createdAt;
        const bLast = messages[b.id]?.at(-1)?.createdAt;
        return (aLast ? new Date(aLast).getTime() : 0) - (bLast ? new Date(bLast).getTime() : 0);
      }
      case 'type':
        return a.type.localeCompare(b.type);
      default: return 0;
    }
  }, [messages]);

  const getStatusGroups = useCallback((sorted: Channel[]) => {
    const types: Channel['type'][] = ['general', 'issue', 'agent'];
    return types
      .filter(type => sorted.some(ch => ch.type === type))
      .map(type => ({ key: type, label: t(`channel.${type}`), items: sorted.filter(ch => ch.type === type) }));
  }, [t]);

  const handleSubmit = async (data: { name: string; type: Channel['type']; members: string[]; teamIds: string[]; initialMessage?: string }) => {
    const memberIds = normalizeChannelMembersToAgentIds(agents, data.members);
    if (editingChannel) {
      await updateChannel(workspaceId, editingChannel.id, { name: data.name, type: data.type, members: memberIds, teamIds: data.teamIds });
    } else {
      await createChannel(workspaceId, data.name, data.type, memberIds, data.initialMessage, data.teamIds);
      if (data.initialMessage && memberIds.length === 1) {
        const agent = agents.find(a => a.id === memberIds[0]);
        const agentName = agent?.name || memberIds[0];
        const { channels } = useChannelStore.getState();
        const created = channels[channels.length - 1];
        if (created) {
          const mentionHtml = `<span data-type="mention" data-id="${memberIds[0]}" data-label="${agentName}"></span>`;
          sendMessage(workspaceId, created.id, `${mentionHtml} ${data.initialMessage}`, memberIds);
        }
      }
    }
  };

  const handleToggleArchive = async (channel: Channel) => {
    await updateChannel(workspaceId, channel.id, { archived: !channel.archived });
  };

  const handleReveal = async (channelId: string) => {
    await sdk.http.postVoid(`/api/workspaces/${workspaceId}/files/reveal?channelId=${channelId}`); // non-standard reveal with channelId
  };

  const renderChannelItem = (ch: Channel, ctx: ItemCtx) => {
    const preview = lastMsgPreview(messages[ch.id]);
    const badge = typeBadgeConfig[ch.type];
    const statusCfg = preview?.status ? statusBadgeConfig[preview.status] : undefined;
    const isRunning = preview?.status === 'streaming' || preview?.status === 'pending';
    const agentMembers = ch.members.filter(m => m !== 'user');

    const trigger = (
      <div
        className={cn(
          'flex items-start gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
          ctx.isActive && 'bg-accent text-accent-foreground',
          ctx.selected && ctx.multiSelect && 'bg-blue-500/10',
        )}
        onClick={() => {
          if (ctx.multiSelect) ctx.toggleSelect();
          else setActiveChannel(ch.id);
        }}
      >
        {ctx.multiSelect && (
          <button type="button" className="shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); ctx.toggleSelect(); }}>
            {ctx.selected ? <CheckSquare className="size-3.5 text-blue-500" /> : <Square className="size-3.5 text-muted-foreground" />}
          </button>
        )}
        {(() => { const Icon = badge.icon; return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />; })()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-[13px] dark:!text-gray-200">{ch.name}</span>
            <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 h-4 rounded', badge.className)}>
              {t(`channel.${ch.type}`)}
            </Badge>
            {statusCfg && (
              <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 h-4 rounded flex items-center gap-1', statusCfg.className)}>
                {isRunning && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
                  </span>
                )}
                {t(statusCfg.label)}
              </Badge>
            )}
          </div>
          {preview ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">{preview.text}</p>
              <span className="text-[10px] text-muted-foreground/60 shrink-0">{preview.time}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/50 mt-0.5">{t('emptyState')}</p>
          )}
        </div>
      </div>
    );

    if (ctx.multiSelect) return trigger;

    return (
      <ContextMenu key={ch.id}>
        <ContextMenuTrigger>{trigger}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => { setEditingChannel(ch); setDialogOpen(true); }}>
            <Pencil className="size-3.5" />{tc('edit')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleReveal(ch.id)}>
            <FolderOpen className="size-3.5" />{tc('open')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleToggleArchive(ch)}>
            <Archive className="size-3.5" />{t('channel.archive')}
          </ContextMenuItem>
          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(ch)}>
            <Trash2 className="size-3.5" />{tc('delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderArchivedChannel = (ch: Channel) => {
    const preview = lastMsgPreview(messages[ch.id]);
    const badge = typeBadgeConfig[ch.type];

    return (
      <ContextMenu key={ch.id}>
        <ContextMenuTrigger
          className={cn(
            'flex items-start gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left opacity-60',
            activeChannelId === ch.id && 'bg-accent text-accent-foreground opacity-100',
          )}
          onClick={() => setActiveChannel(ch.id)}
        >
          {(() => { const Icon = badge.icon; return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />; })()}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium text-[13px]">{ch.name}</span>
              <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 h-4 rounded', badge.className)}>
                {t(`channel.${ch.type}`)}
              </Badge>
            </div>
            {preview ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">{preview.text}</p>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{preview.time}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50 mt-0.5">{t('emptyState')}</p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setActiveChannel(ch.id)}>
            <FolderOpen className="size-3.5" />{tc('open')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleToggleArchive(ch)}>
            <ArchiveRestore className="size-3.5" />{t('channel.unarchive')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <ItemListPanel
      title={t('channel.general')}
      items={activeChannels}
      archivedItems={archivedChannels}
      getItemId={ch => ch.id}
      getItemDate={ch => ch.createdAt}
      activeId={activeChannelId ?? undefined}
      loading={initialLoading}
      sortFields={[
        { value: 'createdAt', label: tc('sortByCreated') },
        { value: 'lastReply', label: tc('sortByLastReply') },
        { value: 'type', label: tc('sortByStatus') },
      ]}
      defaultSortField="createdAt"
      sortCompare={sortCompare}
      defaultGroupMode="none"
      getStatusGroups={getStatusGroups}
      renderItem={renderChannelItem}
      renderArchivedItem={renderArchivedChannel}
      searchable
      searchPlaceholder={t('channel.searchPlaceholder')}
      getSearchText={ch => ch.name}
      renderSkeleton={i => (
        <div key={i} className="flex items-start gap-2.5 px-3 py-2">
          <Skeleton className="size-3.5 rounded shrink-0 mt-1" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-8 rounded-full" />
            </div>
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      )}
      skeletonCount={4}
      emptyState={
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
          <div className="rounded-full bg-muted p-3">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('channel.noMembers')}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('channel.create')}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />{tc('add')}
          </Button>
        </div>
      }
      archivedLabel={t('channel.archived')}
      clearArchivedTitle={t('channel.clearArchived')}
      clearArchivedConfirm={t('channel.clearArchivedConfirm', { count: archivedChannels.length })}
      onClearArchived={() => Promise.all(archivedChannels.map(c => deleteChannel(workspaceId, c.id)))}
      enableMultiSelect
      multiSelectLabel={t('channel.multiSelect')}
      batchActions={(ids, exit) => (
        <>
          <button onClick={() => Promise.all([...ids].map(id => updateChannel(workspaceId, id, { archived: true }))).then(exit)} className="p-0.5 hover:bg-accent rounded cursor-pointer" title={t('channel.archive')}>
            <Archive className="size-3.5" />
          </button>
          <button onClick={() => setBatchDeleteInfo({ ids: new Set(ids), exit })} className="p-0.5 hover:bg-accent rounded cursor-pointer text-destructive" title={tc('delete')}>
            <Trash2 className="size-3.5" />
          </button>
        </>
      )}
      tc={tc}
      headerButtons={
        <button onClick={() => setDialogOpen(true)} className="p-0.5 hover:bg-accent rounded cursor-pointer">
          <Plus className="size-3.5" />
        </button>
      }
      dialogs={
        <>
          <ChannelDialog
            open={dialogOpen}
            onOpenChange={open => { setDialogOpen(open); if (!open) setEditingChannel(null); }}
            workspaceId={workspaceId}
            channel={editingChannel}
            agents={agents}
            onSubmit={handleSubmit}
          />
          <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) { setDeleteTarget(null); setDeleteAlsoIssue(false); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('channel.deleteConfirm', { name: deleteTarget?.name ?? '' })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteTarget?.issueId && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <Checkbox checked={deleteAlsoIssue} onCheckedChange={v => setDeleteAlsoIssue(v === true)} />
                  <span>{t('channel.deleteAlsoIssue')}</span>
                </label>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  if (deleteTarget) {
                    if (deleteAlsoIssue && deleteTarget.issueId) {
                      await useIssueStore.getState().deleteIssue(workspaceId, deleteTarget.issueId).catch(() => {});
                    }
                    await deleteChannel(workspaceId, deleteTarget.id);
                  }
                  setDeleteTarget(null);
                  setDeleteAlsoIssue(false);
                }}>{tc('delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={!!batchDeleteInfo} onOpenChange={open => !open && setBatchDeleteInfo(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{tc('delete')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('channel.batchDeleteConfirm', { count: batchDeleteInfo?.ids.size ?? 0 })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <HoldToConfirm
                  variant="destructive"
                  size="sm"
                  onConfirm={async () => {
                    if (!batchDeleteInfo) return;
                    await Promise.all([...batchDeleteInfo.ids].map(id => deleteChannel(workspaceId, id)));
                    batchDeleteInfo.exit();
                    setBatchDeleteInfo(null);
                  }}
                >{t('channel.holdToDelete')}</HoldToConfirm>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    />
  );
}
