'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AgentConfig, Message } from '@agent-spaces/shared';
import type { TeamRuntimeResponse } from '@agent-spaces/sdk';
import { Copy, Pencil, Trash2, Check, Clock, Reply, CheckCircle2, XCircle, Maximize2, Square, Users, ArrowUpRight, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { Markdown } from '@/components/ui/markdown';
import { AgentIcon } from '@/components/common/agent-icon';
import { useAgentStore } from '@/stores/agent';
import { useUserAvatar } from '@/hooks/use-user-avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MemberHoverCard } from './member-hover-card';
import { AgentEditor } from '@/components/sidebar/agent-editor';
import { normalizeAgent, type AgentPreset } from '@/components/sidebar/agent-shared';
import { MessageContextUsage, MessageParts } from './message-parts';
import { TextShimmer } from '@/components/decorations/text-shimmer';
import { MovingBorder } from '@/components/ui/border-glide';
import { copyToClipboard } from '@/lib/utils';
import { sdk } from '@/lib/sdk';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';

const TeamChatPanel = dynamic(() => import('@/components/teams/team-chat-panel').then((module) => module.TeamChatPanel), {
  ssr: false,
});

interface MessageItemProps {
  message: Message;
  workspaceId: string;
  agent?: Partial<AgentConfig>;
  teamId?: string;
  actorAgentId?: string;
  onAgentUpdated?: () => void;
  onConfigureAgent?: (agentId: string, agent?: Partial<AgentConfig>) => void;
  onEdit?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onStop?: () => void;
}

export function MessageItem({ message, workspaceId, agent: fallbackAgent, teamId, actorAgentId, onAgentUpdated, onConfigureAgent, onEdit, onDelete, onReply, onStop }: MessageItemProps) {
  const tc = useTranslations('common');
  const tm = useTranslations('chat.messageItem');
  const isUser = message.senderId === 'user';
  const agents = useAgentStore((s) => s.agents);
  const storeAgent = !isUser ? agents.find((a) => a.id === message.senderId) : undefined;
  const agent = storeAgent ? { ...fallbackAgent, ...storeAgent } : fallbackAgent;

  const senderName = isUser ? tc('you') : (agent?.name || message.senderId);
  const userAvatarUrl = useUserAvatar();
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [copied, setCopied] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [configAgentId, setConfigAgentId] = useState<string | null>(null);
  const storeAgents = useAgentStore((s) => s.agents);
  const replies = message.replies ?? [];

  const isStreaming = message.status === 'streaming' || message.status === 'pending' || message.status === 'waiting_for_user';
  const [elapsed, setElapsed] = useState(() =>
    message.metadata?.duration ?? 0
  );

  useEffect(() => {
    if (!isStreaming && message.metadata?.duration != null) {
      setElapsed(message.metadata.duration);
      return;
    }
    if (!isStreaming) return;
    const start = new Date(message.createdAt).getTime();
    setElapsed(Date.now() - start);
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, [message.metadata?.duration, message.createdAt, isStreaming]);

  const showDuration = !isUser && (isStreaming || message.status === 'completed' || message.status === 'error') && elapsed > 0;

  const handleCopy = useCallback(async () => {
    const text = isHTML(message.content) ? message.content.replace(/<[^>]*>/g, '') : message.content;
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  if (message.metadata?.teamId) {
    return <TeamMessageCard message={message} />;
  }

  return (
    <div className={`group flex min-w-0 max-w-full gap-2 px-3 py-1.5 items-start ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <AgentIcon
          agentId={undefined}
          name={senderName}
          avatarUrl={userAvatarUrl || undefined}
          className="size-7 rounded-full"
        />
      ) : (
        <MemberHoverCard
          agentId={message.senderId}
          displayName={senderName}
          side="right"
          align="start"
          onConfigure={() => {
            if (onConfigureAgent) {
              onConfigureAgent(message.senderId, agent);
              return;
            }
            setConfigAgentId(message.senderId);
          }}
          agent={agent}
        >
          <AgentIcon
            agentId={message.senderId}
            name={senderName}
            avatarUrl={agent?.avatarUrl}
            icon={agent?.icon}
            apiBase={agent?.apiBase}
            modelId={agent?.modelId}
            providerId={agent?.providerId}
            modelProvider={agent?.modelProvider}
            className="size-7 rounded-full"
          />
        </MemberHoverCard>
      )}
      <div className={`flex flex-col min-w-0 flex-1 max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {!isUser && (
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground">
            {senderName}
          </span>
          {message.senderRole && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
              {message.senderRole}
            </span>
          )}
          {message.metadata?.model && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {message.metadata.model}
            </span>
          )}
          <MessageContextUsage message={message} />
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        )}
        <div className={`relative min-w-0 max-w-full overflow-hidden rounded-lg ${!isUser && isStreaming ? 'p-[1px]' : ''}`}>
          {!isUser && isStreaming && (
            <div className="absolute inset-0 pointer-events-none">
              <MovingBorder
                duration={3000}
                rx="0.5rem"
                ry="0.5rem"
                color="var(--primary)"
                width="5rem"
                height="5rem"
                opacity={0.6}
              />
            </div>
          )}
        <div className={`min-w-0 max-w-full overflow-hidden text-sm rounded-lg px-3 py-2 relative z-[1] ${isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          <MessageParts message={message} isUser={isUser} workspaceId={workspaceId} />
          {!isUser && isStreaming && (
            <div className="mt-1">
              <TextShimmer className="text-xs text-muted-foreground">Thinking</TextShimmer>
            </div>
          )}
          {(replies.length > 0 || showDuration) && (
            <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/30 pt-1">
              <MessageRepliesPopover replies={replies} currentUserLabel={tc('you')} />
              <div className="ml-auto flex items-center justify-end gap-1">
                {!isStreaming && message.status === 'completed' && (
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                )}
                {!isStreaming && message.status === 'error' && (
                  <XCircle className="h-3 w-3 text-destructive shrink-0" />
                )}
                {showDuration && (
                  <>
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {formatDuration(elapsed)}
                      {isStreaming && <span className="animate-pulse ml-0.5">...</span>}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        </div>
        <div className="flex items-center gap-0.5 h-6 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isUser && isStreaming && onStop && (
            <button
              onClick={onStop}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              title={tm('stop')}
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          )}
          <button
            onClick={() => onReply?.(message)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={tm('reply')}
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title={tc('copy')}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {isUser && (
            <button
              onClick={() => onEdit?.(message)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={tc('edit')}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {!isUser && message.content && (
            <button
              onClick={() => setFullscreenOpen(true)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={tm('fullscreen')}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete?.(message)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title={tc('delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!isUser && fullscreenOpen && (
        <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
          <DialogPortal>
            <DialogOverlay />
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0">
              <DialogHeader>
                <DialogTitle>{senderName}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                <Markdown content={isHTML(message.content) ? message.content.replace(/<[^>]*>/g, '') : message.content} workspaceId={workspaceId} />
              </div>
            </DialogContent>
          </DialogPortal>
        </Dialog>
      )}
      {!onConfigureAgent && configAgentId && (() => {
        const storeAgent = storeAgents.find((a) => a.id === configAgentId);
        const customAgent = !storeAgent && fallbackAgent?.id === configAgentId ? fallbackAgent : undefined;
        if (!storeAgent && !customAgent) return null;
        return (
          <Dialog open={Boolean(configAgentId)} onOpenChange={(open) => { if (!open) setConfigAgentId(null); }}>
            <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="border-b px-5 py-3">
                <DialogTitle>{tm('configureAgent')}</DialogTitle>
                <DialogDescription />
              </DialogHeader>
              {storeAgent ? (
                <AgentEditor
                  agent={normalizeAgent(storeAgent)}
                  onSaved={() => setConfigAgentId(null)}
                  onBack={() => setConfigAgentId(null)}
                  showFooter
                />
              ) : customAgent ? (
                <AgentEditor
                  agent={normalizeAgent({ id: configAgentId, ...customAgent } as AgentConfig)}
                  commit={async (draft: AgentPreset) => {
                    if (!teamId || !actorAgentId) throw new Error('team context missing');
                    const requestBody = {
                      actor_agent_id: actorAgentId,
                      agent_id: configAgentId,
                      agent: { ...draft, id: configAgentId },
                    };
                    const response = await fetch(`/api/teams/${teamId}/update-agent`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestBody),
                    });
                    const payload = await response.json() as { success?: boolean; message?: string };
                    if (!response.ok || payload.success === false) {
                      throw new Error(payload.message || 'save failed');
                    }
                    return { ...draft, id: configAgentId };
                  }}
                  onSaved={() => {
                    setConfigAgentId(null);
                    onAgentUpdated?.();
                  }}
                  onBack={() => setConfigAgentId(null)}
                  showFooter
                />
              ) : null}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

function TeamMessageCard({ message }: { message: Message }) {
  const tm = useTranslations('chat.messageItem');
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<TeamRuntimeResponse | null>(null);
  const teamId = message.metadata?.teamId ?? '';
  const sessionId = message.metadata?.sessionId;
  const teamName = message.metadata?.teamName || teamId;
  const loadSummary = useCallback(async () => {
    if (!teamId) return;
    try {
      setSummary(await sdk.team.getRuntime(teamId, 'admin', sessionId));
    } catch {
      setSummary(null);
    }
  }, [sessionId, teamId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (summary?.runtime.status !== 'running') return;
    const timer = setInterval(() => { void loadSummary(); }, 3000);
    return () => clearInterval(timer);
  }, [loadSummary, summary?.runtime.status]);

  const profileById = new Map((summary?.participants ?? []).map((participant) => [participant.id, participant]));
  if (summary?.leader) profileById.set(summary.leader.id, summary.leader);
  const runningIds = [...new Set(
    (summary?.messages ?? [])
      .filter((item) => item.status === 'running' && item.senderAgentId !== 'admin')
      .map((item) => item.senderAgentId),
  )];
  if (summary?.runtime.status === 'running' && runningIds.length === 0) runningIds.push(summary.runtime.leader_agent_id);
  const completedIds = [...new Set(
    (summary?.messages ?? [])
      .filter((item) => item.status === 'completed' && item.senderAgentId !== 'admin')
      .map((item) => item.senderAgentId),
  )].filter((id) => !runningIds.includes(id));
  const teamStatus = summary?.runtime.status ?? (message.status === 'error' ? 'error' : 'idle');

  const renderAgents = (ids: string[]) => ids.length > 0 ? ids.map((id) => {
    const agent = profileById.get(id);
    return (
      <span key={id} className="inline-flex min-w-0 items-center gap-1 rounded-md bg-muted px-1.5 py-1 text-xs">
        <AgentIcon
          agentId={id}
          name={agent?.name || id}
          avatarUrl={agent?.avatarUrl}
          icon={agent?.icon}
          className="size-4 shrink-0 rounded-full"
        />
        <span className="max-w-28 truncate">{agent?.name || id}</span>
      </span>
    );
  }) : <span className="text-xs text-muted-foreground">-</span>;

  return (
    <div className="px-3 py-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full max-w-2xl rounded-md border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{teamName}</span>
              <Badge variant={teamStatus === 'error' ? 'destructive' : 'outline'} className="gap-1">
                {teamStatus === 'running' ? <Loader2 className="size-3 animate-spin" /> : null}
                {tm(`teamStatus.${teamStatus}`)}
              </Badge>
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{message.content}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {tm('openTeamChat')}
            <ArrowUpRight className="size-3.5" />
          </span>
        </span>
        {summary?.runtime.output ? (
          <span className="mt-3 block whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">
            {summary.runtime.output}
          </span>
        ) : null}
        <span className="mt-3 grid gap-2 border-t pt-2 sm:grid-cols-2">
          <span>
            <span className="mb-1 block text-xs text-muted-foreground">{tm('runningAgents')}</span>
            <span className="flex flex-wrap gap-1">{renderAgents(runningIds)}</span>
          </span>
          <span>
            <span className="mb-1 block text-xs text-muted-foreground">{tm('completedAgents')}</span>
            <span className="flex flex-wrap gap-1">{renderAgents(completedIds)}</span>
          </span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[85vh] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-5 py-3">
            <DialogTitle>{teamName}</DialogTitle>
            <DialogDescription>{tm('teamExecution')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 p-3">
            <TeamChatPanel teamId={teamId} actorAgentId="admin" initialSessionId={sessionId} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isHTML(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

function MessageRepliesPopover({
  replies,
  currentUserLabel,
}: {
  replies: NonNullable<Message['replies']>;
  currentUserLabel: string;
}) {
  const tm = useTranslations('chat.messageItem');
  if (replies.length === 0) {
    return <span className="min-w-0" />;
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="min-w-0 truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
          />
        }
      >
        {tm('repliesCount', { count: replies.length })}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-96 max-w-[calc(100vw-2rem)] p-2">
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {replies.map((reply) => (
            <div key={reply.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{reply.senderId === 'user' ? currentUserLabel : reply.senderRole || reply.senderId}</span>
                <span>{new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="whitespace-pre-wrap break-words">
                {isHTML(reply.content) ? reply.content.replace(/<[^>]*>/g, '') : reply.content}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
