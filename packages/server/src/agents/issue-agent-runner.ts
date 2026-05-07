import type { AgentContext } from './agent-context.js';
import { scheduleRunnableIssueTasks, createTasksFromWorkflow } from './issue-task-controller.js';
import * as issueService from '../services/issue.js';
import * as taskService from '../services/task.js';
import * as agentService from '../services/agent.js';
import * as workflowService from '../services/workflow.js';

export async function runIssueAutomation(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[issue-runner] issue not found workspaceId=${workspaceId} issueId=${issueId}`);
    return;
  }

  // Workflow template branch
  if (issue.workflowId) {
    const template = workflowService.getWorkflow(issue.workflowId);
    if (template) {
      try {
        createTasksFromWorkflow(workspaceId, issueId, template, ctx);
        return;
      } catch (err: any) {
        console.warn(`Workflow execution failed for issue ${issueId}: ${err.message}.`);
        markIssueError(workspaceId, issueId, `Workflow execution failed: ${err.message}`, ctx);
        return;
      }
    } else {
      console.warn(`Workflow template ${issue.workflowId} not found`);
      markIssueError(workspaceId, issueId, `Workflow template ${issue.workflowId} not found`, ctx);
      return;
    }
  }

  const tasks = taskService.list(workspaceId, issueId);
  if (tasks.length > 0) {
    await scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
    return;
  }

  console.warn(`[issue-runner] no workflow configured for issue workspaceId=${workspaceId} issueId=${issueId}`);
  markIssueError(workspaceId, issueId, 'No workflow configured for issue', ctx);
}

export function hasActiveIssueAutomation(workspaceId: string): boolean {
  return agentService.list(workspaceId).some(
    (session) =>
      session.status === 'active' &&
      !['scheduler', 'bot'].includes(session.role),
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
