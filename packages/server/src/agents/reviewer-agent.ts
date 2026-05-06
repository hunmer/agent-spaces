/**
 * Reviewer Agent reviews completed task output.
 */

import * as agentService from '../services/agent.js';
import * as taskService from '../services/task.js';
import * as issueService from '../services/issue.js';
import * as channelService from '../services/channel.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentContext } from './agent-context.js';
import type { AgentConfig, TaskResult } from '@agent-spaces/shared';
import { createIssueFunctionTools } from '../services/builtin-tools.js';
import { completeIssueAgentProgress, createIssueAgentProgress, createIssueAgentProgressTracker } from './issue-agent-progress.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';

export async function runReviewer(
  workspaceId: string,
  taskId: string,
  issueId: string,
  taskResult: TaskResult,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[reviewer] issue not found workspaceId=${workspaceId} issueId=${issueId} taskId=${taskId}`);
    return;
  }

  const reviewerPreset = findIssueMemberAgent(workspaceId, issue, 'reviewer');
  if (!reviewerPreset) {
    console.warn(`[reviewer] no reviewer member found workspaceId=${workspaceId} issueId=${issueId} channelId=${issue.channelId} taskId=${taskId}`);
    const currentTask = taskService.getById(workspaceId, taskId);
    const doneTask = taskService.updateStatus(workspaceId, taskId, 'done', { result: taskResult });
    ctx.broadcast('task.status_changed', { taskId, from: currentTask?.status ?? 'running', to: 'done' });
    if (doneTask) ctx.broadcast('task.updated', doneTask);
    return;
  }

  const reviewer = agentService.getOrCreateSessionForConfig(workspaceId, reviewerPreset);
  ctx.broadcast('agent.started', reviewer);

  const currentTask = taskService.getById(workspaceId, taskId);
  const reviewingTask = taskService.updateStatus(workspaceId, taskId, 'reviewing', { result: taskResult });
  ctx.broadcast('task.status_changed', { taskId, from: currentTask?.status ?? 'running', to: 'reviewing' });
  if (reviewingTask) ctx.broadcast('task.updated', reviewingTask);

  const reviewerFromStatus = reviewer.status;
  agentService.updateStatus(workspaceId, reviewer.id, 'active');
  issueService.addAgent(workspaceId, issueId, reviewerPreset.id);
  ctx.broadcast('agent.status_changed', { agentId: reviewer.id, from: reviewerFromStatus, to: 'active' });

  ctx.broadcast('agent.output', {
    agentId: reviewer.id,
    data: `Reviewing task: ${taskId}`,
  });

  const startTime = Date.now();
  const progress = createIssueAgentProgress(workspaceId, issue, reviewerPreset, reviewer.id, {
    runtime: reviewerPreset.runtimeKind,
    model: reviewerPreset.modelId,
    taskId,
    phase: 'reviewer',
  });
  const reviewerWorkingDir = agentService.resolveWorkingDir(workspaceId, reviewerPreset);
  const reviewerTracker = createIssueAgentProgressTracker({
    workspaceId,
    issue,
    progress,
    agentSessionId: reviewer.id,
    workspaceRoot: reviewerWorkingDir,
    onOutput: (line) => {
      ctx.broadcast('agent.output', { agentId: reviewer.id, data: line });
    },
  });

  // Use runtime to review.
  const runtime = createAgentRuntime({
    kind: reviewerPreset.runtimeKind,
    provider: reviewerPreset.modelProvider,
    model: reviewerPreset.modelId,
    apiKey: reviewerPreset.apiKey,
    baseURL: reviewerPreset.apiBase,
    ...getThinkingRuntimeConfig(reviewerPreset),
  });
  const reviewResult = await runtime.execute(
    buildReviewerPrompt(issue, taskId, taskResult, reviewerWorkingDir),
    reviewerWorkingDir,
    {
      maxTurns: 100,
      mcpServers: agentService.getMcpServers(reviewerPreset.mcps),
      functionTools: createReviewerIssueTools(workspaceId, issue, reviewerPreset),
      skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir(workspaceId, reviewerPreset), reviewerPreset.skills),
      configDir: agentService.getAgentConfigDir(workspaceId, reviewerPreset),
      sandboxDirs: reviewerPreset.sandboxDirs,
      onEvent: reviewerTracker.handleEvent,
    },
  );

  if (reviewerTracker.output.length === 0) {
    for (const line of reviewResult.output) {
      reviewerTracker.output.push(line);
      ctx.broadcast('agent.output', { agentId: reviewer.id, data: line });
    }
  }
  completeIssueAgentProgress(workspaceId, issue, progress, reviewResult.summary, reviewerTracker.output, {
    runtime: reviewerPreset.runtimeKind,
    model: reviewerPreset.modelId,
    duration: Date.now() - startTime,
    messageStatus: reviewResult.success ? 'completed' : 'error',
    parts: reviewerTracker.buildParts({
      sessionId: reviewer.id,
      workspaceRoot: reviewerWorkingDir,
      model: reviewerPreset.modelId,
      usage: reviewResult.usage,
      success: reviewResult.success,
      error: reviewResult.error,
    }),
  });

  // Mock: always approve for now
  const approved = true;

  agentService.complete(workspaceId, reviewer.id, undefined, {
    runtime: reviewerPreset.runtimeKind,
    model: reviewerPreset.modelId,
    summary: reviewResult.summary,
    output: reviewerTracker.output.length ? reviewerTracker.output : reviewResult.output,
    durationMs: Date.now() - startTime,
    usage: reviewResult.usage,
    costUsd: reviewResult.costUsd,
  });
  ctx.broadcast('agent.completed', {
    agentId: reviewer.id,
    result: { success: true, summary: approved ? 'Approved' : 'Changes requested', artifacts: [] },
  });

  if (approved) {
    const doneTask = taskService.updateStatus(workspaceId, taskId, 'done', { result: taskResult });
    ctx.broadcast('task.status_changed', { taskId, from: 'reviewing', to: 'done' });
    if (doneTask) ctx.broadcast('task.updated', doneTask);

    ctx.broadcast('agent.output', {
      agentId: reviewer.id,
      data: `Task ${taskId} approved.`,
    });
  } else {
    const failedTask = taskService.updateStatus(workspaceId, taskId, 'failed', {
      result: { ...taskResult, error: 'Changes requested by reviewer' },
    });
    ctx.broadcast('task.status_changed', { taskId, from: 'reviewing', to: 'failed' });
    if (failedTask) ctx.broadcast('task.updated', failedTask);

    const changedIssue = issueService.updateStatus(workspaceId, issueId, 'changes_requested');
    ctx.broadcast('issue.status_changed', { issueId, from: 'in_progress', to: 'changes_requested' });
    if (changedIssue) ctx.broadcast('issue.updated', changedIssue);
  }
}

function findIssueMemberAgent(
  workspaceId: string,
  issue: NonNullable<ReturnType<typeof issueService.getById>>,
  role: AgentConfig['role'],
): AgentConfig | null {
  const channel = channelService.getChannel(workspaceId, issue.channelId);
  if (!channel) return null;

  return agentService.findEnabledPresetByRoleInMembers(workspaceId, channel.members, role);
}

function buildReviewerPrompt(issue: NonNullable<ReturnType<typeof issueService.getById>>, taskId: string, taskResult: TaskResult, workingDir: string): string {
  return [
    'Before reviewing, call ViewCurrentChannelIssue with the current channel id to load the latest shared issue context and comments.',
    `The current workspace working directory is: ${workingDir}`,
    'Review files under this working directory. Treat deliverables outside it, especially in /tmp, as misplaced unless the task explicitly asked for temporary output.',
    'For Bash commands that inspect files under this working directory, prefer relative paths instead of absolute paths.',
    '',
    'Current issue:',
    `- Issue id: ${issue.id}`,
    `- Channel id: ${issue.channelId}`,
    `- Title: ${issue.title}`,
    '',
    'Task result to review:',
    `- Task id: ${taskId}`,
    `- Success: ${taskResult.success}`,
    `- Summary: ${taskResult.summary}`,
    taskResult.error ? `- Error: ${taskResult.error}` : '',
  ].filter(Boolean).join('\n');
}

function createReviewerIssueTools(
  workspaceId: string,
  issue: NonNullable<ReturnType<typeof issueService.getById>>,
  preset: AgentConfig,
) {
  const channel = channelService.getChannel(workspaceId, issue.channelId);
  return createIssueFunctionTools(workspaceId, channel, {
    senderId: preset.id,
    senderRole: preset.role,
  }, ['ViewCurrentChannelIssue', 'AddCurrentChannelComment']);
}
