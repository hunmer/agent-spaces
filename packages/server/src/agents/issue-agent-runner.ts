import type { AgentContext } from './agent-context.js';
import { runPlanner } from './planner-agent.js';
import { scheduleRunnableIssueTasks, syncIssueTasksAfterPlanning } from './issue-task-controller.js';
import * as issueService from '../services/issue.js';
import * as issueCommentService from '../services/issue-comment.js';
import * as taskService from '../services/task.js';
import * as agentService from '../services/agent.js';

export interface RunIssueAutomationOptions {
  forcePlanner?: boolean;
}

export async function runIssueAutomation(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
  options: RunIssueAutomationOptions = {},
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[issue-runner] issue not found workspaceId=${workspaceId} issueId=${issueId}`);
    return;
  }

  const tasks = taskService.list(workspaceId, issueId);
  const shouldPlan = options.forcePlanner || tasks.length === 0;
  if (shouldPlan) {
    await runPlanner(workspaceId, issueId, ctx);
    return;
  }

  await syncIssueTasksAfterPlanning(workspaceId, issueId, {
    planSummary: latestUserCommentSummary(workspaceId, issueId),
    planOutput: [],
  }, ctx);
}

export function shouldForcePlannerFromMentions(workspaceId: string, mentions: string[]): boolean {
  const mentionedIds = new Set(mentions);
  return (agentService.listPresets(workspaceId) ?? []).some(
    (agent) => mentionedIds.has(agent.id) && agent.role === 'planner' && agent.enabled !== false,
  );
}

export function hasActiveIssueAutomation(workspaceId: string): boolean {
  return agentService.list(workspaceId).some(
    (session) =>
      session.status === 'active' &&
      ['planner', 'custom', 'executor', 'reviewer'].includes(session.role),
  );
}

function latestUserCommentSummary(workspaceId: string, issueId: string): string {
  const latest = [...issueCommentService.listIssueComments(workspaceId, issueId)]
    .reverse()
    .find((comment) => comment.senderId === 'user');
  return latest?.content ?? '';
}
