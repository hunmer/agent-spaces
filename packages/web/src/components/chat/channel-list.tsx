'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useChannelStore } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { Bot, Hash, MessageCircle, AlertCircle, Plus, Pencil, FolderOpen, Archive, ArchiveRestore, MoreHorizontal, Trash2, Check, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { ChannelDialog } from './channel-dialog';
import { normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import { getWS } from '@/lib/ws';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronRight } from 'lucide-react';

import type {  Channel, Message } from '@agent-spaces/shared';

const typeBadgeConfig: Record<Channel['type'], { className: string; icon: typeof Hash }> = {
  general: { className: 'bg-muted text-muted-foreground', icon: Hash },
  issue: { className: 'bg-amber-500/15 text-amber-600', icon: AlertCircle },
  agent: { className: 'bg-blue-500/15 text-blue-600', icon: MessageCircle },
};

function lastMsgPreview(msgs: Message[] | undefined): { text: string; status: Message['status'] } | null {
  if (!msgs || msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  if (!last) return null;
  const text = (last.content ?? '').replace(/<[^>]*>/g, '').slice(0, 60);
  return { text: text || '...', status: last.status };
}

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

interface ChannelListProps {
  workspaceId: string;
}

export function ChannelList({ workspaceId }: ChannelListProps) {
  const t = useTranslations('chat');
  const tc = useTranslations('common');
  const {
    channels, activeChannelId, messages,
    loadChannels, createChannel, updateChannel, deleteChannel, setActiveChannel, upsertChannel,
  } = useChannelStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>('none');
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [clearArchiveOpen, setClearArchiveOpen] = useState(false);
  const [sortField, setSortField] = useState<'createdAt' | 'lastReply' | 'type'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [initialLoading, setInitialLoading] = useState(true);
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);

  const activeChannels = useMemo(() => channels.filter((c) => !c.archived), [channels]);
  const archivedChannels = useMemo(() => channels.filter((c) => c.archived), [channels]);

  const sortedActiveChannels = useMemo(() => {
    const sorted = [...activeChannels];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'createdAt':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'lastReply': {
          const aLast = messages[a.id]?.at(-1)?.createdAt;
          const bLast = messages[b.id]?.at(-1)?.createdAt;
          cmp = (aLast ? new Date(aLast).getTime() : 0) - (bLast ? new Date(bLast).getTime() : 0);
          break;
        }
        case 'type':
          cmp = a.type.localeCompare(b.type);
          break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [activeChannels, sortField, sortOrder, messages]);

  const channelGroups = useMemo(() => {
    if (groupMode === 'none') return null;
    if (groupMode === 'time') {
      const groups: Record<string, Channel[]> = {};
      for (const ch of sortedActiveChannels) {
        const key = getTimeGroup(ch.createdAt);
        if (!groups[key]) groups[key] = [];
        groups[key].push(ch);
      }
      return TIME_GROUP_ORDER
        .filter(k => groups[k]?.length)
        .map(k => ({ key: k, label: tc(TIME_LABEL_KEYS[k]), items: groups[k]! }));
    }
    const types: Channel['type'][] = ['general', 'issue', 'agent'];
    return types
      .filter(type => sortedActiveChannels.some(ch => ch.type === type))
      .map(type => ({ key: type, label: t(`channel.${type}`), items: sortedActiveChannels.filter(ch => ch.type === type) }));
  }, [groupMode, sortedActiveChannels, tc, t]);

  useEffect(() => {
    setInitialLoading(true);
    loadChannels(workspaceId).finally(() => setInitialLoading(false));
    ensureAgents();
  }, [workspaceId, loadChannels, ensureAgents]);

  // WS: 自动同步频道变更（新建/更新）
  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.updated', (data: unknown) => {
      upsertChannel(data as Partial<Channel> & Pick<Channel, 'id'>);
    });
    return () => { unsub(); };
  }, [workspaceId, upsertChannel]);

  const renderActiveChannel = (ch: Channel) => {
    const preview = lastMsgPreview(messages[ch.id]);
    const badge = typeBadgeConfig[ch.type];
    const isRunning = preview?.status === 'streaming' || preview?.status === 'pending';
    const agentMembers = ch.members.filter((m) => m !== 'user');

    return (
      <ContextMenu key={ch.id}>
        <ContextMenuTrigger
          className={cn(
            'flex items-start gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
            activeChannelId === ch.id && 'bg-accent text-accent-foreground',
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
              {isRunning && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                </span>
              )}
              {agentMembers.length > 0 && <Bot className="h-3 w-3 text-muted-foreground shrink-0" />}
            </div>
            {preview ? (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{preview.text}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 mt-0.5">{t('emptyState')}</p>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => handleEdit(ch)}>
            <Pencil className="size-3.5" />
            {tc('edit')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleReveal(ch.id)}>
            <FolderOpen className="size-3.5" />
            {tc('open')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => handleToggleArchive(ch)}>
            <Archive className="size-3.5" />
            {t('channel.archive')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const handleSubmit = async (data: { name: string; type: Channel['type']; members: string[] }) => {
    const memberIds = normalizeChannelMembersToAgentIds(agents, data.members);
    if (editingChannel) {
      await updateChannel(workspaceId, editingChannel.id, {
        name: data.name,
        type: data.type,
        members: memberIds,
      });
    } else {
      await createChannel(workspaceId, data.name, data.type, memberIds);
    }
  };

  const handleEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingChannel(null);
  };

  const handleReveal = async (channelId: string) => {
    await fetch(`/api/workspaces/${workspaceId}/files/reveal?channelId=${channelId}`, { method: 'POST' });
  };

  const handleToggleArchive = async (channel: Channel) => {
    await updateChannel(workspaceId, channel.id, { archived: !channel.archived });
  };

  const handleClearArchived = async () => {
    await Promise.all(archivedChannels.map((c) => deleteChannel(workspaceId, c.id)));
    setClearArchiveOpen(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-2 py-1.5 border-b text-xs font-medium text-muted-foreground">
        <span>{t('channel.general')}</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setDialogOpen(true)} className="p-0.5 hover:bg-accent rounded">
            <Plus className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="p-0.5 hover:bg-accent rounded">
              <ArrowUpDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {([
                { field: 'createdAt' as const, label: tc('sortByCreated') },
                { field: 'lastReply' as const, label: tc('sortByLastReply') },
                { field: 'type' as const, label: tc('sortByStatus') },
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
                disabled={archivedChannels.length === 0}
                onClick={() => setClearArchiveOpen(true)}
              >
                <Trash2 className="size-3.5" />
                {t('channel.clearArchived')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {initialLoading ? (
          <div className="p-2 space-y-1">
            <SkeletonGroup count={4}>
              {(i) => (
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
            </SkeletonGroup>
          </div>
        ) : null}
        {!initialLoading && activeChannels.length === 0 && archivedChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="rounded-full bg-muted p-3">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('channel.noMembers')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('channel.create')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {tc('add')}
            </Button>
          </div>
        ) : null}
        {!initialLoading && groupMode === 'none' && sortedActiveChannels.map((ch) => renderActiveChannel(ch))}
        {!initialLoading && groupMode !== 'none' && channelGroups?.map((group) => (
          <Collapsible key={group.key} open={groupOpen[group.key] !== false} onOpenChange={(open) => setGroupOpen((prev) => ({ ...prev, [group.key]: open }))}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', groupOpen[group.key] !== false && 'rotate-90')} />
              {group.label} ({group.items.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {group.items.map((ch) => renderActiveChannel(ch))}
            </CollapsibleContent>
          </Collapsible>
        ))}

        {!initialLoading && archivedChannels.length > 0 && (
          <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
              <ChevronRight className={cn('size-3 transition-transform', archivedOpen && 'rotate-90')} />
              <Archive className="size-3" />
              {t('channel.archived')} ({archivedChannels.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              {archivedChannels.map((ch) => {
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
                      {(() => {
                        const Icon = badge.icon;
                        return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />;
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium text-[13px]">{ch.name}</span>
                          <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 h-4 rounded', badge.className)}>
                            {t(`channel.${ch.type}`)}
                          </Badge>
                        </div>
                        {preview ? (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{preview.text}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground/50 mt-0.5">{t('emptyState')}</p>
                        )}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => setActiveChannel(ch.id)}>
                        <FolderOpen className="size-3.5" />
                        {tc('open')}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => handleToggleArchive(ch)}>
                        <ArchiveRestore className="size-3.5" />
                        {t('channel.unarchive')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        workspaceId={workspaceId}
        channel={editingChannel}
        agents={agents}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={clearArchiveOpen} onOpenChange={setClearArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('channel.clearArchived')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('channel.clearArchivedConfirm', { count: archivedChannels.length })}
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
