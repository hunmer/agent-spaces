/**
 * Planner Agent — receives an issue, decomposes into tasks, assigns Executors.
 * Uses the mock runtime for now (planning is deterministic).
 */

import * as agentService from '../services/agent.js';
import * as issueService from '../services/issue.js';
import * as taskService from '../services/task.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentContext } from './agent-context.js';
import { onExecutorComplete } from '../hooks/agent-hooks.js';

export async function runPlanner(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  // Create planner session
  const planner = agentService.create(workspaceId, 'planner');
  ctx.broadcast('agent.started', planner);
  agentService.updateStatus(workspaceId, planner.id, 'active');
  ctx.broadcast('agent.status_changed', { agentId: planner.id, from: 'idle', to: 'active' });

  ctx.broadcast('agent.output', { agentId: planner.id, data: `Planning issue: ${issueId}` });

  // Move issue to planned
  const issue = issueService.updateStatus(workspaceId, issueId, 'planned');
  if (!issue) {
    agentService.complete(workspaceId, planner.id, 'Issue not found');
    return;
  }
  ctx.broadcast('issue.status_changed', { issueId, from: 'draft', to: 'planned' });

  // Use runtime to "plan" (mock returns quickly)
  const runtime = createAgentRuntime();
  const planResult = await runtime.execute(
    `Decompose this issue into tasks: ${issue.title}\n\n${issue.description}`,
    '',
  );

  for (const line of planResult.output) {
    ctx.broadcast('agent.output', { agentId: planner.id, data: line });
  }

  // Decompose into 1-3 tasks (mock: single task covering the issue)
  const tasks = [
    taskService.create(workspaceId, issueId, {
      title: `Implement: ${issue.title}`,
      description: issue.description,
    }),
  ];

  for (const task of tasks) {
    issueService.addTask(workspaceId, issueId, task.id);
    ctx.broadcast('task.created', task);
  }

  // Move issue to in_progress
  issueService.updateStatus(workspaceId, issueId, 'in_progress');
  ctx.broadcast('issue.status_changed', { issueId, from: 'planned', to: 'in_progress' });

  // Complete planner
  agentService.complete(workspaceId, planner.id);
  ctx.broadcast('agent.completed', { agentId: planner.id, result: { success: true, summary: `Planned ${tasks.length} tasks`, artifacts: [] } });

  // Start executors for each task (sequentially for now)
  for (const task of tasks) {
    await runExecutor(workspaceId, task.id, issueId, ctx);
  }
}

async function runExecutor(
  workspaceId: string,
  taskId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  const executor = agentService.create(workspaceId, 'executor');
  ctx.broadcast('agent.started', executor);

  agentService.updateStatus(workspaceId, executor.id, 'active');
  ctx.broadcast('agent.status_changed', { agentId: executor.id, from: 'idle', to: 'active' });

  const task = taskService.assignAgent(workspaceId, taskId, executor.id);
  if (!task) {
    agentService.complete(workspaceId, executor.id, 'Task not found');
    return;
  }
  ctx.broadcast('task.status_changed', { taskId, from: 'pending', to: 'running' });

  agentService.assignTask(workspaceId, executor.id, taskId);

  const runtime = createAgentRuntime();
  ctx.broadcast('agent.output', { agentId: executor.id, data: `Executing task: ${task.title}` });

  const result = await runtime.execute(
    `${task.title}\n\n${task.description}`,
    '',
    { sandboxDirs: task.sandboxDirs },
  );

  for (const line of result.output) {
    ctx.broadcast('agent.output', { agentId: executor.id, data: line });
    ctx.broadcast('task.output', { taskId, data: line });
  }

  // Complete executor
  agentService.complete(workspaceId, executor.id);
  ctx.broadcast('agent.completed', { agentId: executor.id, result });

  // Hook: executor complete → triggers reviewer
  await onExecutorComplete(workspaceId, taskId, issueId, result, ctx);
}
