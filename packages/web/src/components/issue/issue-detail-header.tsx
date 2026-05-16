'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvatarGroup } from '@/components/ui/avatar';
import { AgentIcon } from '@/components/common/agent-icon';
import { ArrowLeft, Play, RotateCcw, Clock, GitBranch, Info, Pencil, MessagesSquare } from 'lucide-react';
import { useMobilePanelStore } from '@/stores/mobile-panel';
import { useChannelStore } from '@/stores/channel';
import { getMemberDisplayName } from '@/lib/agent-members';
import { ISSUE_STATUS_COLOR } from './issue-status-colors';
import type { AgentConfig, Issue } from '@agent-spaces/shared';

interface IssueDetailHeaderProps {
  issue: Issue;
  workspaceId: string;
  t: (key: string, params?: Record<string, string | number | Date>) => string;
  setEditOpen: (open: boolean) => void;
  setInfoOpen: (open: boolean) => void;
  startIssue: (wsId: string, issueId: string) => void;
  resumeIssue: (wsId: string, issueId: string) => void;
  members: string[];
  enabledAgents: AgentConfig[];
}

export function IssueDetailHeader({
  issue,
  workspaceId,
  t,
  setEditOpen,
  setInfoOpen,
  startIssue,
  resumeIssue,
  members,
  enabledAgents,
}: IssueDetailHeaderProps) {
  return (
    <div className="shrink-0 p-4 pb-3 border-b">
      <div className="flex items-center gap-2 mb-1">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden shrink-0"
          onClick={() => useMobilePanelStore.getState().setActivePanel('issue-list')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-lg font-semibold truncate shrink min-w-0">{issue.title}</h2>
        <Badge variant={ISSUE_STATUS_COLOR[issue.status]}>
          {t(`status.${issue.status}`)}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('detail.openChatChannel') as string}
            onClick={() => { if (issue?.channelId) useChannelStore.getState().ensureAndActivateChannel(workspaceId, issue.channelId); }}
          >
            <MessagesSquare className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setInfoOpen(true)}>
            <Info className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {members.length > 0 && (
          <span className="flex items-center gap-1">
            <AvatarGroup>
              {members.slice(0, 4).map((member) => (
                <AgentIcon
                  key={member}
                  agentId={member !== 'user' ? member : undefined}
                  name={getMemberDisplayName(enabledAgents, member)}
                  className="size-6 rounded-full"
                />
              ))}
            </AvatarGroup>
            <span>{t('detail.memberCount', { count: members.length })}</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t('detail.created')} {new Date(issue.createdAt).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {t('detail.updated')} {new Date(issue.updatedAt).toLocaleDateString()}
        </span>
        {issue.branch && (
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {issue.branch}
          </span>
        )}
        {issue.prUrl && (
          <span>{t('detail.pr')} {issue.prUrl}</span>
        )}
      </div>
      {issue.description && (
        <p className="text-sm text-muted-foreground mt-2">{issue.description}</p>
      )}
      {issue.status === 'draft' && (
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={() => startIssue(workspaceId, issue.id)}>
            <Play className="h-3 w-3 mr-1" />
            {t('detail.start')}
          </Button>
        </div>
      )}
      {issue.status === 'error' && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => resumeIssue(workspaceId, issue.id)}>
            <RotateCcw className="h-3 w-3 mr-1" />
            {t('detail.resumeFailed')}
          </Button>
          {issue.retryPaused && (
            <span className="text-[11px] text-muted-foreground">
              {t('detail.retryPaused', { failed: issue.retryCount, total: issue.maxRetries })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
