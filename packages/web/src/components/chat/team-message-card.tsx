'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Message } from '@agent-spaces/shared';
import type { TeamRuntimeResponse } from '@agent-spaces/sdk';
import { ArrowUpRight, Check, Copy, Loader2, Trash2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AgentIcon } from '@/components/common/agent-icon';
import { Badge } from '@/components/ui/badge';
import { BorderGlide } from '@/components/ui/border-glide';
import { sdk } from '@/lib/sdk';
import dynamic from 'next/dynamic';

const TeamChatPanel = dynamic(() => import('@/components/teams/team-chat-panel').then((module) => module.TeamChatPanel), {
  ssr: false,
});

export function TeamMessageCard({
  message,
  copied,
  onCopy,
  onDelete,
}: {
  message: Message;
  copied: boolean;
  onCopy: (content: string) => void;
  onDelete: () => void;
}) {
  const tc = useTranslations('common');
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

  const card = (
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
  );

  return (
    <div className="group px-3 py-1.5">
      {teamStatus === 'running' ? (
        <BorderGlide className="max-w-2xl rounded-md" rx="0.375rem" ry="0.375rem" color="var(--primary)" duration={3000}>
          {card}
        </BorderGlide>
      ) : (
        card
      )}
      <div className="flex h-6 max-w-2xl items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onCopy(summary?.runtime.output || message.content)}
          className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={tc('copy')}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onDelete}
          className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          title={tc('delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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
