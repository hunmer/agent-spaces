import type { AgentContext } from '../agents/agent-context.js';
import * as issueService from './issue.js';
import * as channelService from './channel.js';
import * as messageService from './message.js';
import { startIssueWorkflowExecution } from '../agents/issue-agent-runner.js';
import { listWorkspaces } from '../storage/workspace-store.js';

const RECOVERY_ERROR = 'Server restarted while workflow execution was running';

export function recoverRunningWorkOnStartup(ctxFactory?: (workspaceId: string) => AgentContext): void {
  for (const workspace of listWorkspaces()) {
    const ctx = ctxFactory?.(workspace.id);

    // 1. Mark in_progress issues as error
    const inProgressIssues = issueService.list(workspace.id)
      .filter((issue) => issue.status === 'in_progress');
    for (const issue of inProgressIssues) {
      const updated = issueService.markError(workspace.id, issue.id, RECOVERY_ERROR);
      if (!updated) continue;
      ctx?.broadcast('issue.status_changed', { issueId: issue.id, from: issue.status, to: 'error' });
      ctx?.broadcast('issue.updated', updated);
    }

    // 2. Mark streaming/pending/waiting_for_user channel messages as error
    const channels = channelService.listChannels(workspace.id);
    for (const channel of channels) {
      const messages = messageService.listMessages(workspace.id, channel.id);
      for (const message of messages) {
        if (message.status !== 'streaming' && message.status !== 'pending' && message.status !== 'waiting_for_user') continue;
        const updated = messageService.updateMessage(workspace.id, channel.id, message.id, {
          status: 'error',
          parts: message.parts?.map((part) => {
            if ('status' in part && part.status === 'streaming') {
              return { ...part, status: 'completed' as const };
            }
            return part;
          }),
        });
        if (updated) {
          ctx?.broadcast('channel.message.updated', updated);
        }
      }
    }
  }
}

export async function retryErrorIssues(workspaceId: string, ctx: AgentContext): Promise<void> {
  const issues = issueService.list(workspaceId)
    .filter((issue) => issue.status === 'error' && !issue.retryPaused);

  for (const issue of issues) {
    await retryIssue(workspaceId, issue.id, ctx, { manual: false });
  }
}

export async function retryIssue(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
  options: { manual?: boolean } = {},
): Promise<{ issue: ReturnType<typeof issueService.getById>; retried: boolean; reason?: string }> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) return { issue: null, retried: false, reason: 'issue not found' };

  if (!options.manual && (issue.retryPaused || (issue.retryCount ?? 0) >= (issue.maxRetries ?? 3))) {
    const paused = issueService.save(workspaceId, { ...issue, retryPaused: true });
    ctx.broadcast('issue.updated', paused);
    return { issue: paused, retried: false, reason: 'issue retry limit reached' };
  }

  const updated = issueService.prepareRetry(workspaceId, issueId, { manual: options.manual });
  if (!updated) return { issue: null, retried: false, reason: 'issue not found' };
  ctx.broadcast('issue.status_changed', { issueId, from: issue.status, to: updated.status });
  ctx.broadcast('issue.updated', updated);

  await startIssueWorkflowExecution(workspaceId, issueId, ctx);
  return { issue: issueService.getById(workspaceId, issueId), retried: true };
}
