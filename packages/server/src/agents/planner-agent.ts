/**
 * Planner Agent receives an issue and delegates task orchestration.
 */

import * as agentService from '../services/agent.js';
import * as issueService from '../services/issue.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentConfig } from '@agent-spaces/shared';
import type { AgentContext } from './agent-context.js';
import * as wsService from '../services/workspace.js';
import * as channelService from '../services/channel.js';
import { syncIssueTasksAfterPlanning } from './issue-task-controller.js';
import { completeIssueAgentProgress, createIssueAgentProgress, createIssueAgentProgressTracker } from './issue-agent-progress.js';
import { createIssueFunctionTools } from '../services/builtin-tools.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';

export async function runPlanner(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[planner] issue not found workspaceId=${workspaceId} issueId=${issueId}`);
    return;
  }

  const plannerPreset = findIssueMemberAgent(workspaceId, issue, 'planner');
  if (!plannerPreset) {
    console.warn(`[planner] no planner member found; continuing with task creator workspaceId=${workspaceId} issueId=${issueId} channelId=${issue.channelId}`);
    await syncIssueTasksAfterPlanning(workspaceId, issueId, {
      planSummary: '',
      planOutput: [],
    }, ctx);
    return;
  }

  const planner = agentService.getOrCreateSessionForConfig(workspaceId, plannerPreset);
  ctx.broadcast('agent.started', planner);
  const plannerFromStatus = planner.status;
  agentService.updateStatus(workspaceId, planner.id, 'active');
  issueService.addAgent(workspaceId, issueId, plannerPreset.id);
  ctx.broadcast('agent.status_changed', { agentId: planner.id, from: plannerFromStatus, to: 'active' });

  ctx.broadcast('agent.output', { agentId: planner.id, data: `Planning issue: ${issueId}` });

  // Move issue to planned
  const plannedIssue = issueService.updateStatus(workspaceId, issueId, 'planned');
  if (!plannedIssue) return;
  ctx.broadcast('issue.status_changed', { issueId, from: issue.status, to: 'planned' });
  ctx.broadcast('issue.updated', plannedIssue);

  // Use runtime to plan.
  const runtime = createRuntimeForPreset(plannerPreset);
  const workspace = wsService.getById(workspaceId);
  const plannerWorkingDir = agentService.resolveWorkingDir(workspaceId, plannerPreset);
  const startTime = Date.now();
  const progress = createIssueAgentProgress(workspaceId, plannedIssue, plannerPreset, planner.id, {
    runtime: plannerPreset.runtimeKind,
    model: plannerPreset.modelId,
    phase: 'planner',
  });
  const tracker = createIssueAgentProgressTracker({
    workspaceId,
    issue: plannedIssue,
    progress,
    agentSessionId: planner.id,
    workspaceRoot: workspace?.boundDirs?.[0],
    onOutput: (line) => {
      ctx.broadcast('agent.output', { agentId: planner.id, data: line });
    },
  });
  const planResult = await runtime.execute(
    buildPlannerPrompt(plannedIssue, plannerPreset, plannerWorkingDir),
    plannerWorkingDir,
    {
      maxTurns: 100,
      mcpServers: agentService.getMcpServers(plannerPreset.mcps),
      functionTools: createPlannerIssueTools(workspaceId, plannedIssue, plannerPreset),
      skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir(workspaceId, plannerPreset), plannerPreset.skills),
      configDir: agentService.getAgentConfigDir(workspaceId, plannerPreset),
      sandboxDirs: plannerPreset.sandboxDirs,
      onEvent: tracker.handleEvent,
    },
  );

  if (tracker.output.length === 0) {
    for (const line of planResult.output) {
      tracker.output.push(line);
      ctx.broadcast('agent.output', { agentId: planner.id, data: line });
    }
  }
  completeIssueAgentProgress(workspaceId, plannedIssue, progress, planResult.summary, tracker.output, {
    runtime: plannerPreset.runtimeKind,
    model: plannerPreset.modelId,
    duration: Date.now() - startTime,
    messageStatus: planResult.success ? 'completed' : 'error',
    parts: tracker.buildParts({
      sessionId: planner.id,
      workspaceRoot: workspace?.boundDirs?.[0],
      model: plannerPreset.modelId,
      usage: planResult.usage,
      success: planResult.success,
      error: planResult.error,
    }),
  });

  // Complete planner
  agentService.complete(workspaceId, planner.id, planResult.success ? undefined : planResult.error || planResult.summary, {
    runtime: plannerPreset.runtimeKind,
    model: plannerPreset.modelId,
    summary: planResult.summary,
    output: tracker.output.length ? tracker.output : planResult.output,
    durationMs: Date.now() - startTime,
    usage: planResult.usage,
    costUsd: planResult.costUsd,
  });
  ctx.broadcast('agent.completed', { agentId: planner.id, result: planResult });

  if (!planResult.success) {
    const erroredIssue = issueService.updateStatus(workspaceId, issueId, 'error');
    ctx.broadcast('issue.status_changed', { issueId, from: 'planned', to: 'error' });
    if (erroredIssue) ctx.broadcast('issue.updated', erroredIssue);
    return;
  }

  await syncIssueTasksAfterPlanning(workspaceId, issueId, {
    plannerPreset,
    plannerSessionId: planner.id,
    planSummary: planResult.summary,
    planOutput: tracker.output.length ? tracker.output : planResult.output,
  }, ctx);
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

function createRuntimeForPreset(preset: AgentConfig) {
  return createAgentRuntime({
    kind: preset.runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: preset.apiBase,
    ...getThinkingRuntimeConfig(preset),
  });
}

function buildPlannerPrompt(issue: NonNullable<ReturnType<typeof issueService.getById>>, plannerPreset: AgentConfig, workingDir: string): string {
  return [
    plannerPreset.systemPrompt?.trim(),
    'Before planning, call ViewCurrentChannelIssue to load the latest issue context and comments for this channel.',
    `The current workspace working directory is: ${workingDir}`,
    'Plan work as changes to files under this workspace unless the issue explicitly says otherwise.',
    'For Bash commands that inspect files under this working directory, prefer relative paths instead of absolute paths.',
    '',
    'Current issue context:',
    `- Issue id: ${issue.id}`,
    `- Channel id: ${issue.channelId}`,
    `- Title: ${issue.title}`,
    `- Status: ${issue.status}`,
    `- Description: ${issue.description || '(empty)'}`,
  ].filter(Boolean).join('\n');
}

function createPlannerIssueTools(
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
