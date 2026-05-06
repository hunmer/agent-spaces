'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChannelStore } from '@/stores/channel';
import { useAgentStore } from '@/stores/agent';
import { Bot, Hash, MessageCircle, AlertCircle, Plus, Pencil, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChannelDialog } from './channel-dialog';
import { normalizeChannelMembersToAgentIds } from '@/lib/agent-members';
import { getWS } from '@/lib/ws';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import type {  Channel, Message } from '@agent-spaces/shared';

const typeBadge: Record<Channel['type'], { label: string; className: string; icon: typeof Hash }> = {
  general: { label: 'General', className: 'bg-muted text-muted-foreground', icon: Hash },
  issue: { label: 'Issue', className: 'bg-amber-500/15 text-amber-600', icon: AlertCircle },
  agent: { label: 'Agent', className: 'bg-blue-500/15 text-blue-600', icon: MessageCircle },
};

function lastMsgPreview(msgs: Message[] | undefined): { text: string; status: Message['status'] } | null {
  if (!msgs || msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  const text = (last.content ?? '').replace(/<[^>]*>/g, '').slice(0, 60);
  return { text: text || '...', status: last.status };
}

interface ChannelListProps {
  workspaceId: string;
}

export function ChannelList({ workspaceId }: ChannelListProps) {
  const {
    channels, activeChannelId, messages,
    loadChannels, createChannel, updateChannel, setActiveChannel,
  } = useChannelStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const agents = useAgentStore((s) => s.agents);
  const ensureAgents = useAgentStore((s) => s.ensure);

  useEffect(() => {
    loadChannels(workspaceId);
    ensureAgents(workspaceId);
  }, [workspaceId, loadChannels, ensureAgents]);

  // WS: 自动同步频道变更（新建/更新）
  useEffect(() => {
    const ws = getWS(workspaceId);
    const unsub = ws.on('channel.updated', (data: unknown) => {
      const ch = data as Channel;
      useChannelStore.setState((s) => {
        const idx = s.channels.findIndex((c) => c.id === ch.id);
        if (idx >= 0) {
          const copy = [...s.channels];
          copy[idx] = ch;
          return { channels: copy };
        }
        return { channels: [...s.channels, ch] };
      });
    });
    return () => { unsub(); };
  }, [workspaceId]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Channels</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
            <div className="rounded-full bg-muted p-3">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">暂无频道</p>
              <p className="text-xs text-muted-foreground mt-0.5">创建一个频道开始对话</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              添加频道
            </Button>
          </div>
        ) : null}
        {channels.map((ch) => {
          const preview = lastMsgPreview(messages[ch.id]);
          const badge = typeBadge[ch.type];
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
              {(() => {
                const Icon = badge.icon;
                return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />;
              })()}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-[13px]">{ch.name}</span>
                  <Badge variant="secondary" className={cn('text-[10px] px-1 py-0 h-4 rounded', badge.className)}>
                    {badge.label}
                  </Badge>
                  {isRunning && (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
                  {agentMembers.length > 0 && (
                    <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>
                {preview ? (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{preview.text}</p>
                ) : (
                  <p className="text-xs text-muted-foreground/50 mt-0.5">暂无消息</p>
                )}
              </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => handleEdit(ch)}>
                  <Pencil className="size-3.5" />
                  编辑
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleReveal(ch.id)}>
                  <FolderOpen className="size-3.5" />
                  打开文件夹位置
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        workspaceId={workspaceId}
        channel={editingChannel}
        agents={agents}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
