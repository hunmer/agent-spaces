import type { ExecutionEventChannel, ExecutionEventMap } from '@agent-spaces/shared';
import type { AgentContext } from './agent-context.js';
import * as issueService from '../services/issue.js';
import * as agentService from '../services/agent.js';
import * as workflowService from '../services/workflow.js';
import { getWorkflowExecutionManager } from '../services/builtin-tools/workflow-exec-tools.js';

function getIssueOwnerClientId(workspaceId: string, issueId: string): string {
  return `issue:${workspaceId}:${issueId}`;
}

function syncIssueWorkflowEvent(
  workspaceId: string,
  issueId: string,
  channel: ExecutionEventChannel,
  payload: ExecutionEventMap[ExecutionEventChannel],
  ctx: AgentContext,
): void {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) return;

  if (channel === 'execution:log') {
    const event = payload as ExecutionEventMap['execution:log'];
    const nextStatus = event.log.status === 'paused' ? 'paused' : event.log.status;
    const updated = issueService.save(workspaceId, {
      ...issue,
      workflowExecutionId: event.executionId,
      workflowExecutionStatus:
        nextStatus === 'running' ? 'running'
          : nextStatus === 'completed' ? 'completed'
            : nextStatus === 'paused' ? 'paused'
              : issue.status === 'stopped' ? 'stopped'
                : 'error',
    });
    ctx.broadcast('issue.updated', updated);
    return;
  }

  if (channel === 'workflow:paused') {
    const event = payload as ExecutionEventMap['workflow:paused'];
    const updated = issueService.save(workspaceId, {
      ...issue,
      status: 'in_progress',
      workflowExecutionId: event.executionId,
      workflowExecutionStatus: 'paused',
      lastError: undefined,
    });
    ctx.broadcast('issue.updated', updated);
    return;
  }

  if (channel === 'workflow:resumed' || channel === 'workflow:started') {
    const event = payload as ExecutionEventMap['workflow:resumed'] | ExecutionEventMap['workflow:started'];
    const from = issue.status;
    const updated = issueService.save(workspaceId, {
      ...issue,
      status: 'in_progress',
      workflowExecutionId: event.executionId,
      workflowExecutionStatus: 'running',
      lastError: undefined,
    });
    if (from !== 'in_progress') {
      ctx.broadcast('issue.status_changed', { issueId, from, to: 'in_progress' });
    }
    ctx.broadcast('issue.updated', updated);
    return;
  }

  if (channel === 'workflow:completed') {
    const event = payload as ExecutionEventMap['workflow:completed'];
    const from = issue.status;
    const updated = issueService.save(workspaceId, {
      ...issue,
      status: 'completed',
      workflowExecutionId: event.executionId,
      workflowExecutionStatus: 'completed',
      lastError: undefined,
      retryPaused: false,
    });
    if (from !== 'completed') {
      ctx.broadcast('issue.status_changed', { issueId, from, to: 'completed' });
    }
    ctx.broadcast('issue.updated', updated);
    return;
  }

  if (channel === 'workflow:error') {
    const event = payload as ExecutionEventMap['workflow:error'];
    const isStopped = event.error?.message === 'Execution stopped';
    const nextStatus = isStopped ? 'stopped' : 'error';
    const from = issue.status;
    const updated = issueService.save(workspaceId, {
      ...issue,
      status: nextStatus,
      workflowExecutionId: event.executionId,
      workflowExecutionStatus: isStopped ? 'stopped' : 'error',
      lastError: isStopped ? undefined : (event.error?.message || 'Workflow execution failed'),
      retryPaused: isStopped ? false : issue.retryPaused,
    });
    if (from !== nextStatus) {
      ctx.broadcast('issue.status_changed', { issueId, from, to: nextStatus });
    }
    ctx.broadcast('issue.updated', updated);
  }
}

export async function startIssueWorkflowExecution(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
  input?: Record<string, unknown>,
  env?: Record<string, unknown>,
): Promise<void> {
  const issue = issueService.ensureChannel(workspaceId, issueId);
  if (!issue) {
    console.warn(`[issue-runner] issue not found workspaceId=${workspaceId} issueId=${issueId}`);
    return;
  }
  if (!issue.workflowId) {
    markIssueError(workspaceId, issueId, 'Workflow is required for issue execution', ctx);
    return;
  }
  const template = workflowService.getWorkflow(issue.workflowId);
  if (!template) {
    markIssueError(workspaceId, issueId, `Workflow template ${issue.workflowId} not found`, ctx);
    return;
  }
  const manager = getWorkflowExecutionManager();
  if (!manager) {
    markIssueError(workspaceId, issueId, 'Workflow execution manager is not initialized', ctx);
    return;
  }

  const before = issue.status;
  const runningIssue = issueService.save(workspaceId, {
    ...issue,
    status: 'in_progress',
    workflowExecutionStatus: 'running',
    lastError: undefined,
    retryPaused: false,
  });
  if (before !== 'in_progress') {
    ctx.broadcast('issue.status_changed', { issueId, from: before, to: 'in_progress' });
  }
  ctx.broadcast('issue.updated', runningIssue);

  const defaultInput = {
    prompt: issue.description,
    issueId: issue.id,
    issueTitle: issue.title,
    issueDescription: issue.description,
    channelId: issue.channelId,
  };

  const result = await manager.execute(
    {
      workflowId: issue.workflowId,
      input: input ? { ...defaultInput, ...input } : defaultInput,
      env,
      context: {
        issueId: issue.id,
        issueTitle: issue.title,
        issueDescription: issue.description,
        channelId: issue.channelId,
        issueMembers: issue.members,
      },
    },
    getIssueOwnerClientId(workspaceId, issueId),
    (channel, payload) => {
      ctx.broadcast(channel, payload);
      if (
        channel === 'workflow:started'
        || channel === 'workflow:paused'
        || channel === 'workflow:resumed'
        || channel === 'workflow:completed'
        || channel === 'workflow:error'
        || channel === 'execution:log'
      ) {
        syncIssueWorkflowEvent(workspaceId, issueId, channel, payload as ExecutionEventMap[ExecutionEventChannel], ctx);
      }
    },
    workspaceId,
  );

  const updated = issueService.save(workspaceId, {
    ...runningIssue,
    status: 'in_progress',
    workflowExecutionId: result.executionId,
    workflowExecutionStatus: 'running',
    lastError: undefined,
  });
  ctx.broadcast('issue.updated', updated);
}

export async function runIssueAutomation(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  await startIssueWorkflowExecution(workspaceId, issueId, ctx);
}

export function hasActiveIssueAutomation(workspaceId: string): boolean {
  return issueService.list(workspaceId).some(
    (issue) => issue.status === 'in_progress' && issue.workflowExecutionStatus === 'running',
  ) || agentService.list(workspaceId).some(
    (session) => session.status === 'active' && !['scheduler', 'bot'].includes(session.role),
  );
}

function markIssueError(
  workspaceId: string,
  issueId: string,
  message: string,
  ctx: AgentContext,
): void {
  const issue = issueService.getById(workspaceId, issueId);
  const updated = issueService.markError(workspaceId, issueId, message);
  if (!updated) return;
  ctx.broadcast('issue.status_changed', { issueId, from: issue?.status ?? 'draft', to: 'error' });
  ctx.broadcast('issue.updated', updated);
}
