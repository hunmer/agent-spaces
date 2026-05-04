/**
 * Planner Agent — receives an issue, decomposes into tasks, assigns Executors.
 */

import * as agentService from '../services/agent.js';
import * as issueService from '../services/issue.js';
import * as issueCommentService from '../services/issue-comment.js';
import * as messageService from '../services/message.js';
import * as taskService from '../services/task.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentConfig, MessagePart } from '@agent-spaces/shared';
import type { AgentContext } from './agent-context.js';
import { onExecutorComplete } from '../hooks/agent-hooks.js';
import * as wsService from '../services/workspace.js';
import * as channelService from '../services/channel.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { createAgentMessagePartsTracker } from './agent-message-parts.js';

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
    console.warn(`[planner] no planner member found workspaceId=${workspaceId} issueId=${issueId} channelId=${issue.channelId}`);
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
  ctx.broadcast('issue.status_changed', { issueId, from: 'draft', to: 'planned' });

  // Use runtime to plan.
  const runtime = createRuntimeForPreset(plannerPreset);
  const workspace = wsService.getById(workspaceId);
  const startTime = Date.now();
  const progress = createIssueAgentProgress(workspaceId, plannedIssue, plannerPreset, planner.id, {
    runtime: plannerPreset.runtimeKind,
    model: plannerPreset.modelId,
  });
  const tracker = createAgentMessagePartsTracker({
    workspaceId,
    channelId: plannedIssue.channelId,
    messageId: progress.message.id,
    workspaceRoot: workspace?.boundDirs?.[0],
    onOutput: (line) => {
      ctx.broadcast('agent.output', { agentId: planner.id, data: line });
      const live = messageService.updateMessage(workspaceId, plannedIssue.channelId, progress.message.id, {
        content: tracker.output.join('\n') || progress.message.content,
        status: 'streaming',
        metadata: {
          ...progress.message.metadata,
          duration: Date.now() - startTime,
        },
        parts: tracker.buildParts({
          sessionId: planner.id,
          workspaceRoot: workspace?.boundDirs?.[0],
          model: plannerPreset.modelId,
          success: true,
        }),
      });
      if (live) broadcastToWorkspace(workspaceId, 'channel.message.updated', live);
    },
  });
  const planResult = await runtime.execute(
    buildPlannerPrompt(plannedIssue),
    agentService.resolveWorkingDir(workspaceId, plannerPreset),
    {
      maxTurns: 100,
      mcpServers: agentService.getMcpServers(plannerPreset.mcps),
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
      success: planResult.success,
      error: planResult.error,
    }),
  });

  // Decompose into a single task covering the issue.
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
  });
}

function buildPlannerPrompt(issue: NonNullable<ReturnType<typeof issueService.getById>>): string {
  return [
    '你是策划者 Agent。请基于下面的议题内容制定执行计划。',
    '',
    'Current issue context:',
    `- Issue id: ${issue.id}`,
    `- Title: ${issue.title}`,
    `- Status: ${issue.status}`,
    `- Description: ${issue.description || '(empty)'}`,
    '',
    '请直接基于上述议题内容输出计划。不要声称无法查看当前议题；议题内容已经在 prompt 中提供。',
  ].join('\n');
}

function createIssueAgentProgress(
  workspaceId: string,
  issue: NonNullable<ReturnType<typeof issueService.getById>>,
  preset: AgentConfig,
  agentSessionId: string,
  metadata: { runtime?: string; model?: string },
): {
  message: ReturnType<typeof messageService.createMessage>;
  comment: NonNullable<ReturnType<typeof issueCommentService.createIssueComment>> | null;
} {
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
    },
  });
  if (comment) broadcastToWorkspace(workspaceId, 'issue.updated', issueService.getById(workspaceId, issue.id));

  return { message, comment };
}

function completeIssueAgentProgress(
  workspaceId: string,
  issue: NonNullable<ReturnType<typeof issueService.getById>>,
  progress: ReturnType<typeof createIssueAgentProgress>,
  summary: string,
  output: string[],
  metadata: {
    runtime?: string;
    model?: string;
    duration: number;
    messageStatus: 'completed' | 'error';
    parts: MessagePart[];
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
    content: summary || content,
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

async function runExecutor(
  workspaceId: string,
  taskId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[executor] issue not found workspaceId=${workspaceId} issueId=${issueId} taskId=${taskId}`);
    return;
  }

  const executorPreset = findIssueMemberAgent(workspaceId, issue, 'executor');
  if (!executorPreset) {
    console.warn(`[executor] no executor member found workspaceId=${workspaceId} issueId=${issueId} channelId=${issue.channelId} taskId=${taskId}`);
    taskService.updateStatus(workspaceId, taskId, 'failed', {
      result: {
        success: false,
        summary: 'No executor agent configured in issue channel members',
        artifacts: [],
        error: 'No executor member found for issue channel',
      },
    });
    ctx.broadcast('task.status_changed', { taskId, from: 'pending', to: 'failed' });
    return;
  }

  const executor = agentService.getOrCreateSessionForConfig(workspaceId, executorPreset);
  ctx.broadcast('agent.started', executor);

  const executorFromStatus = executor.status;
  agentService.updateStatus(workspaceId, executor.id, 'active');
  issueService.addAgent(workspaceId, issueId, executorPreset.id);
  ctx.broadcast('agent.status_changed', { agentId: executor.id, from: executorFromStatus, to: 'active' });

  const task = taskService.assignAgent(workspaceId, taskId, executor.id);
  if (!task) {
    agentService.complete(workspaceId, executor.id, 'Task not found');
    return;
  }
  ctx.broadcast('task.status_changed', { taskId, from: 'pending', to: 'running' });

  agentService.assignTask(workspaceId, executor.id, taskId);

  console.log(
    `[executor] starting runtime workspaceId=${workspaceId} taskId=${taskId} issueId=${issueId} executorAgentId=${executor.id} agentConfigId=${executorPreset.id} runtime=${executorPreset.runtimeKind ?? 'open-agent-sdk'} sandboxDirs=${JSON.stringify(task.sandboxDirs ?? executorPreset.sandboxDirs ?? [])}`,
  );
  const runtime = createRuntimeForPreset(executorPreset);
  ctx.broadcast('agent.output', { agentId: executor.id, data: `Executing task: ${task.title}` });
  ctx.broadcast('agent.output', {
    agentId: executor.id,
    data: `[debug] executor agentConfigId=${executorPreset.id} runtime=${executorPreset.runtimeKind ?? 'open-agent-sdk'}; hook:onExecutorComplete should run after this executor finishes`,
  });

  const result = await runtime.execute(
    `${task.title}\n\n${task.description}`,
    agentService.resolveWorkingDir(workspaceId, executorPreset),
    {
      maxTurns: 100,
      mcpServers: agentService.getMcpServers(executorPreset.mcps),
      skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir(workspaceId, executorPreset), executorPreset.skills),
      configDir: agentService.getAgentConfigDir(workspaceId, executorPreset),
      sandboxDirs: task.sandboxDirs ?? executorPreset.sandboxDirs,
    },
  );
  console.log(
    `[executor] runtime completed workspaceId=${workspaceId} taskId=${taskId} issueId=${issueId} executorAgentId=${executor.id} success=${result.success} summary=${JSON.stringify(result.summary)}`,
  );

  for (const line of result.output) {
    ctx.broadcast('agent.output', { agentId: executor.id, data: line });
    ctx.broadcast('task.output', { taskId, data: line });
  }

  // Complete executor
  agentService.complete(workspaceId, executor.id);
  ctx.broadcast('agent.completed', { agentId: executor.id, result });

  // Hook: executor complete → triggers reviewer
  console.log(`[executor] invoking hook:onExecutorComplete taskId=${taskId} issueId=${issueId}`);
  await onExecutorComplete(workspaceId, taskId, issueId, result, ctx);
}
