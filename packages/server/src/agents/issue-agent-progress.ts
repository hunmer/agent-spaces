import type { AgentConfig, Issue, MessagePart } from '@agent-spaces/shared';
import * as issueCommentService from '../services/issue-comment.js';
import * as issueService from '../services/issue.js';
import * as messageService from '../services/message.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

export interface IssueAgentProgress {
  message: ReturnType<typeof messageService.createMessage>;
  comment: NonNullable<ReturnType<typeof issueCommentService.createIssueComment>> | null;
}

export function createIssueAgentProgress(
  workspaceId: string,
  issue: Issue,
  preset: AgentConfig,
  agentSessionId: string,
  metadata: {
    runtime?: string;
    model?: string;
    taskId?: string;
    phase?: 'planner' | 'task_creator' | 'executor' | 'reviewer';
  },
): IssueAgentProgress {
  const content = `${preset.name || preset.role} is processing...`;
  const message = messageService.createMessage(workspaceId, issue.channelId, {
    senderId: preset.id,
    senderRole: preset.role,
    content,
    type: 'text',
    status: 'streaming',
    metadata: {
      agentSessionId,
      runtime: metadata.runtime,
      model: metadata.model,
      summary: content,
      duration: 0,
      taskId: metadata.taskId,
      phase: metadata.phase,
    },
  });
  broadcastToWorkspace(workspaceId, 'channel.message', message);

  const comment = issueCommentService.createIssueComment(workspaceId, issue.id, {
    senderId: preset.id,
    senderRole: preset.role,
    content,
    source: 'agent_progress',
    metadata: {
      channelId: issue.channelId,
      messageId: message.id,
      agentSessionId,
      runtime: metadata.runtime,
      model: metadata.model,
      summary: content,
      duration: 0,
      taskId: metadata.taskId,
      phase: metadata.phase,
    },
  });
  if (comment) broadcastToWorkspace(workspaceId, 'issue.updated', issueService.getById(workspaceId, issue.id));

  return { message, comment };
}

export function completeIssueAgentProgress(
  workspaceId: string,
  issue: Issue,
  progress: IssueAgentProgress,
  summary: string,
  output: string[],
  metadata: {
    runtime?: string;
    model?: string;
    duration: number;
    messageStatus: 'completed' | 'error';
    parts?: MessagePart[];
  },
): void {
  const content = output.join('\n').trim() || summary;
  if (!content.trim()) return;

  const message = messageService.updateMessage(workspaceId, issue.channelId, progress.message.id, {
    content,
    type: 'text',
    status: metadata.messageStatus,
    metadata: {
      ...progress.message.metadata,
      runtime: metadata.runtime,
      model: metadata.model,
      summary,
      duration: metadata.duration,
    },
    parts: metadata.parts,
  });
  if (message) broadcastToWorkspace(workspaceId, 'channel.message.updated', message);

  const comment = progress.comment
    ? issueCommentService.updateIssueComment(workspaceId, issue.id, progress.comment.id, {
      content,
      metadata: {
        ...progress.comment.metadata,
        channelId: issue.channelId,
        messageId: progress.message.id,
        runtime: metadata.runtime,
        model: metadata.model,
        summary,
        duration: metadata.duration,
      },
    })
    : null;
  if (comment) broadcastToWorkspace(workspaceId, 'issue.updated', issueService.getById(workspaceId, issue.id));
}
