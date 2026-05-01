/**
 * Reviewer Agent — reviews diff of completed task, outputs approve/changes_requested/reject.
 */

import * as agentService from '../services/agent.js';
import * as taskService from '../services/task.js';
import * as issueService from '../services/issue.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentContext } from './agent-context.js';
import type { TaskResult } from '@agent-spaces/shared';

export async function runReviewer(
  workspaceId: string,
  taskId: string,
  issueId: string,
  taskResult: TaskResult,
  ctx: AgentContext,
): Promise<void> {
  const reviewer = agentService.create(workspaceId, 'reviewer');
  ctx.broadcast('agent.started', reviewer);

  agentService.updateStatus(workspaceId, reviewer.id, 'active');
  ctx.broadcast('agent.status_changed', { agentId: reviewer.id, from: 'idle', to: 'active' });

  ctx.broadcast('agent.output', {
    agentId: reviewer.id,
    data: `Reviewing task: ${taskId}`,
  });

  // Use runtime to "review" (mock)
  const runtime = createAgentRuntime();
  const reviewResult = await runtime.execute(
    `Review the following task result:\nSuccess: ${taskResult.success}\nSummary: ${taskResult.summary}`,
    '',
  );

  for (const line of reviewResult.output) {
    ctx.broadcast('agent.output', { agentId: reviewer.id, data: line });
  }

  // Mock: always approve for now
  const approved = true;

  agentService.complete(workspaceId, reviewer.id);
  ctx.broadcast('agent.completed', {
    agentId: reviewer.id,
    result: { success: true, summary: approved ? 'Approved' : 'Changes requested', artifacts: [] },
  });

  if (approved) {
    // Mark task as done
    taskService.updateStatus(workspaceId, taskId, 'done', { result: taskResult });
    ctx.broadcast('task.status_changed', { taskId, from: 'running', to: 'done' });

    // Move issue to review_pending → approved
    issueService.updateStatus(workspaceId, issueId, 'review_pending');
    ctx.broadcast('issue.status_changed', { issueId, from: 'in_progress', to: 'review_pending' });

    issueService.updateStatus(workspaceId, issueId, 'approved');
    ctx.broadcast('issue.status_changed', { issueId, from: 'review_pending', to: 'approved' });

    // Notify channel
    ctx.broadcast('agent.output', {
      agentId: reviewer.id,
      data: `Issue ${issueId} approved. All tasks completed.`,
    });
  } else {
    // Request changes
    taskService.updateStatus(workspaceId, taskId, 'failed', {
      result: { ...taskResult, error: 'Changes requested by reviewer' },
    });
    ctx.broadcast('task.status_changed', { taskId, from: 'running', to: 'failed' });

    issueService.updateStatus(workspaceId, issueId, 'changes_requested');
    ctx.broadcast('issue.status_changed', { issueId, from: 'in_progress', to: 'changes_requested' });
  }
}
