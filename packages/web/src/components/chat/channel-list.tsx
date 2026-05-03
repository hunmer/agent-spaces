'use client';

import { useEffect, useMemo, useState } from 'react';
import { useChannelStore } from '@/stores/channel';
import { Bot, Hash, MessageCircle, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChannelDialog } from './channel-dialog';
import { normalizeChannelMembersToAgentIds } from '@/lib/agent-members';

import type { AgentConfig, Channel, Message } from '@agent-spaces/shared';

const typeBadge: Record<Channel['type'], { label: string; className: string; icon: typeof Hash }> = {
  general: { label: 'General', className: 'bg-muted text-muted-foreground', icon: Hash },
  issue: { label: 'Issue', className: 'bg-amber-500/15 text-amber-600', icon: AlertCircle },
  agent: { label: 'Agent', className: 'bg-blue-500/15 text-blue-600', icon: MessageCircle },
};

function lastMsgPreview(msgs: Message[] | undefined): { text: string; status: Message['status'] } | null {
  if (!msgs || msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  const text = last.content.replace(/<[^>]*>/g, '').slice(0, 60);
  return { text: text || '...', status: last.status };
}

interface ChannelListProps {
  workspaceId: string;
}

export function ChannelList({ workspaceId }: ChannelListProps) {
  const { channels, activeChannelId, messages, loadChannels, createChannel, setActiveChannel } = useChannelStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [agents, setAgents] = useState<AgentConfig[]>([]);

  useEffect(() => {
    loadChannels(workspaceId);
  }, [workspaceId, loadChannels]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspaces/${workspaceId}/agents/presets`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<AgentConfig[]>;
      })
      .then(setAgents)
      .catch((err) => {
        if (err.name !== 'AbortError') setAgents([]);
      });

    return () => controller.abort();
  }, [workspaceId]);

  const agentMap = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  const handleSubmit = async (data: { name: string; type: Channel['type']; members: string[] }) => {
    await createChannel(
      workspaceId,
      data.name,
      data.type,
      normalizeChannelMembersToAgentIds(agents, data.members),
    );
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
        {channels.map((ch) => {
          const preview = lastMsgPreview(messages[ch.id]);
          const badge = typeBadge[ch.type];
          const isRunning = preview?.status === 'streaming' || preview?.status === 'pending';
          const agentMembers = ch.members.filter((m) => m !== 'user');

          return (
            <button
              key={ch.id}
              onClick={() => setActiveChannel(ch.id)}
              className={cn(
                'flex items-start gap-2.5 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                activeChannelId === ch.id && 'bg-accent text-accent-foreground',
              )}
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
            </button>
          );
        })}
      </div>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        agents={agents}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
