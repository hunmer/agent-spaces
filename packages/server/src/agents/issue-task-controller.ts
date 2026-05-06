import type { AgentConfig, Issue, Task, TaskResult, TaskStatus } from '@agent-spaces/shared';
import type { AgentContext } from './agent-context.js';
import type { AgentFunctionTool } from '../adapters/agent-runtime-types.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import * as agentService from '../services/agent.js';
import * as channelService from '../services/channel.js';
import * as issueService from '../services/issue.js';
import * as taskService from '../services/task.js';
import { onExecutorComplete } from '../hooks/agent-hooks.js';
import { createIssueFunctionTools } from '../services/builtin-tools.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { completeIssueAgentProgress, createIssueAgentProgress, createIssueAgentProgressTracker } from './issue-agent-progress.js';

const ACTIVE_TASK_STATUSES: TaskStatus[] = ['running', 'reviewing', 'retrying', 'waiting_review'];

export interface PlannerTaskSyncInput {
  plannerPreset?: AgentConfig;
  plannerSessionId?: string;
  planSummary?: string;
  planOutput?: string[];
}

interface TaskDraft {
  key: string;
  title: string;
  description: string;
  agentConfigId?: string;
  dependsOnKeys?: string[];
  sandboxDirs?: string[];
}

export async function syncIssueTasksAfterPlanning(
  workspaceId: string,
  issueId: string,
  input: PlannerTaskSyncInput,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) {
    console.warn(`[issue-task-controller] issue not found workspaceId=${workspaceId} issueId=${issueId}`);
    return;
  }

  const taskSyncPreset = findTaskCreatorForIssue(workspaceId, issue, input.plannerPreset);
  if (!taskSyncPreset) {
    console.warn(`[issue-task-controller] no task creator or executor member found workspaceId=${workspaceId} issueId=${issueId}`);
    updateIssueStatus(workspaceId, issueId, 'error', ctx);
    return;
  }
  const taskSyncAgent = agentService.getOrCreateSessionForConfig(workspaceId, taskSyncPreset);
  ctx.broadcast('agent.started', taskSyncAgent);

  const fromStatus = taskSyncAgent.status;
  agentService.updateStatus(workspaceId, taskSyncAgent.id, 'active');
  issueService.addAgent(workspaceId, issueId, taskSyncPreset.id);
  ctx.broadcast('agent.status_changed', { agentId: taskSyncAgent.id, from: fromStatus, to: 'active' });
  ctx.broadcast('agent.output', { agentId: taskSyncAgent.id, data: `Syncing issue tasks: ${issueId}` });

  const startTime = Date.now();
  const taskSyncWorkingDir = agentService.resolveWorkingDir(workspaceId, taskSyncPreset);
  const progress = createIssueAgentProgress(workspaceId, issue, taskSyncPreset, taskSyncAgent.id, {
    runtime: taskSyncPreset.runtimeKind,
    model: taskSyncPreset.modelId,
    phase: 'task_creator',
  });
  const taskSyncTracker = createIssueAgentProgressTracker({
    workspaceId,
    issue,
    progress,
    agentSessionId: taskSyncAgent.id,
    onOutput: (line) => {
      ctx.broadcast('agent.output', { agentId: taskSyncAgent.id, data: line });
    },
  });
  const runtime = createRuntimeForPreset(taskSyncPreset);
  const result = await runtime.execute(
    buildTaskSyncPrompt(issue, input, taskSyncWorkingDir),
    taskSyncWorkingDir,
    {
      maxTurns: 20,
      mcpServers: undefined,
      functionTools: createTaskSyncTools(workspaceId, issue, taskSyncPreset, ctx),
      skills: [],
      configDir: agentService.getAgentConfigDir(workspaceId, taskSyncPreset),
      sandboxDirs: taskSyncPreset.sandboxDirs,
      onEvent: taskSyncTracker.handleEvent,
    },
  );

  if (taskSyncTracker.output.length === 0) {
    for (const line of result.output) {
      taskSyncTracker.output.push(line);
      ctx.broadcast('agent.output', { agentId: taskSyncAgent.id, data: line });
    }
  }
  completeIssueAgentProgress(workspaceId, issue, progress, result.summary, taskSyncTracker.output, {
    runtime: taskSyncPreset.runtimeKind,
    model: taskSyncPreset.modelId,
    duration: Date.now() - startTime,
    messageStatus: result.success ? 'completed' : 'error',
    parts: taskSyncTracker.buildParts({
      sessionId: taskSyncAgent.id,
      model: taskSyncPreset.modelId,
      usage: result.usage,
      success: result.success,
      error: result.error,
    }),
  });

  agentService.complete(workspaceId, taskSyncAgent.id, result.success ? undefined : result.error || result.summary, {
    runtime: taskSyncPreset.runtimeKind,
    model: taskSyncPreset.modelId,
    summary: result.summary,
    output: taskSyncTracker.output.length ? taskSyncTracker.output : result.output,
    durationMs: Date.now() - startTime,
    usage: result.usage,
    costUsd: result.costUsd,
  });
  ctx.broadcast('agent.completed', { agentId: taskSyncAgent.id, result });

  if (!result.success) {
    updateIssueStatus(workspaceId, issueId, 'error', ctx);
    return;
  }

  if (taskService.list(workspaceId, issueId).length === 0) {
    const fallbackTasks = replaceIssueTasksFromDrafts(workspaceId, issueId, ctx, [
      {
        key: 'implementation',
        title: `Implement: ${issue.title}`,
        description: issue.description || input.planSummary || input.planOutput?.join('\n') || `Implement issue: ${issue.title}`,
      },
    ]);
    console.warn(`[issue-task-controller] task sync produced no tasks; created fallback count=${fallbackTasks.length}`);
  }

  updateIssueStatus(workspaceId, issueId, 'in_progress', ctx);
  await scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
}

export async function scheduleRunnableIssueTasks(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  const tasks = taskService.list(workspaceId, issueId);
  const doneIds = new Set(tasks.filter((task) => task.status === 'done').map((task) => task.id));
  const hasActive = tasks.some((task) => ACTIVE_TASK_STATUSES.includes(task.status));
  const runnable = tasks.filter((task) =>
    task.status === 'pending'
    && (task.dependsOnTaskIds ?? []).every((dependencyId) => doneIds.has(dependencyId)));

  if (runnable.length === 0) {
    if (!hasActive && tasks.length > 0 && tasks.every((task) => task.status === 'done')) {
      updateIssueStatus(workspaceId, issueId, 'completed', ctx);
    }
    return;
  }

  for (const task of runnable) {
    await runIssueTask(workspaceId, issueId, task.id, ctx);
  }
}

export async function runIssueTask(
  workspaceId: string,
  issueId: string,
  taskId: string,
  ctx: AgentContext,
): Promise<void> {
  const issue = issueService.getById(workspaceId, issueId);
  const task = taskService.getById(workspaceId, taskId);
  if (!issue || !task) {
    console.warn(`[issue-task-controller] missing issue/task workspaceId=${workspaceId} issueId=${issueId} taskId=${taskId}`);
    return;
  }

  const executorPreset = findExecutorForTask(workspaceId, issue, task);
  if (!executorPreset) {
    const missingExecutorResult = {
      success: false,
      summary: 'No executor agent configured in issue channel members',
      artifacts: [],
      error: 'No executor member found for issue channel',
    };
    const failed = taskService.updateStatus(workspaceId, taskId, 'failed', {
      result: {
        success: false,
        summary: missingExecutorResult.summary,
        artifacts: [],
        error: missingExecutorResult.error,
      },
    });
    broadcastTaskUpdate(ctx, failed, task.status);
    await handleTaskFailure(workspaceId, issueId, taskId, missingExecutorResult, ctx);
    return;
  }

  const executor = agentService.getOrCreateSessionForConfig(workspaceId, executorPreset);
  ctx.broadcast('agent.started', executor);

  const executorFromStatus = executor.status;
  agentService.updateStatus(workspaceId, executor.id, 'active');
  issueService.addAgent(workspaceId, issueId, executorPreset.id);
  ctx.broadcast('agent.status_changed', { agentId: executor.id, from: executorFromStatus, to: 'active' });

  const runningTask = taskService.assignAgent(workspaceId, taskId, executor.id);
  if (!runningTask) {
    agentService.complete(workspaceId, executor.id, 'Task not found');
    return;
  }
  broadcastTaskUpdate(ctx, runningTask, task.status);
  agentService.assignTask(workspaceId, executor.id, taskId);

  const runtime = createRuntimeForPreset(executorPreset);
  const executorWorkingDir = agentService.resolveWorkingDir(workspaceId, executorPreset);
  const startTime = Date.now();
  const progress = createIssueAgentProgress(workspaceId, issue, executorPreset, executor.id, {
    runtime: executorPreset.runtimeKind,
    model: executorPreset.modelId,
    taskId,
    phase: 'executor',
  });
  const executorTracker = createIssueAgentProgressTracker({
    workspaceId,
    issue,
    progress,
    agentSessionId: executor.id,
    workspaceRoot: executorWorkingDir,
    onOutput: (line) => {
      ctx.broadcast('agent.output', { agentId: executor.id, data: line });
      ctx.broadcast('task.output', { taskId, data: line });
    },
  });
  ctx.broadcast('agent.output', { agentId: executor.id, data: `Executing task: ${runningTask.title}` });
  ctx.broadcast('agent.output', {
    agentId: executor.id,
    data: `[debug] executor agentConfigId=${executorPreset.id} taskAgentConfigId=${runningTask.agentConfigId || '(fallback)'} runtime=${executorPreset.runtimeKind ?? 'open-agent-sdk'}`,
  });

  const result = await runtime.execute(
    buildExecutorPrompt(issue, runningTask, executorWorkingDir),
    executorWorkingDir,
    {
      maxTurns: 100,
      mcpServers: agentService.getMcpServers(executorPreset.mcps),
      functionTools: createCurrentIssueTools(workspaceId, issue, executorPreset),
      skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir(workspaceId, executorPreset), executorPreset.skills),
      configDir: agentService.getAgentConfigDir(workspaceId, executorPreset),
      sandboxDirs: runningTask.sandboxDirs ?? executorPreset.sandboxDirs,
      onEvent: executorTracker.handleEvent,
    },
  );

  if (executorTracker.output.length === 0) {
    for (const line of result.output) {
      executorTracker.output.push(line);
      ctx.broadcast('agent.output', { agentId: executor.id, data: line });
      ctx.broadcast('task.output', { taskId, data: line });
    }
  }
  completeIssueAgentProgress(workspaceId, issue, progress, result.summary, executorTracker.output, {
    runtime: executorPreset.runtimeKind,
    model: executorPreset.modelId,
    duration: Date.now() - startTime,
    messageStatus: result.success ? 'completed' : 'error',
    parts: executorTracker.buildParts({
      sessionId: executor.id,
      workspaceRoot: executorWorkingDir,
      model: executorPreset.modelId,
      usage: result.usage,
      success: result.success,
      error: result.error,
    }),
  });

  if (!result.success) {
    const failedTask = taskService.updateStatus(workspaceId, taskId, 'failed', { result });
    broadcastTaskUpdate(ctx, failedTask, 'running');
  }

  agentService.complete(workspaceId, executor.id, result.success ? undefined : result.error || result.summary, {
    runtime: executorPreset.runtimeKind,
    model: executorPreset.modelId,
    summary: result.summary,
    output: executorTracker.output.length ? executorTracker.output : result.output,
    durationMs: Date.now() - startTime,
    usage: result.usage,
    costUsd: result.costUsd,
  });
  ctx.broadcast('agent.completed', { agentId: executor.id, result });

  if (!result.success) {
    await handleTaskFailure(workspaceId, issueId, taskId, result, ctx);
    return;
  }

  await onExecutorComplete(workspaceId, taskId, issueId, result, ctx);
  await scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
}

export async function continueIssueTaskScheduling(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
): Promise<void> {
  await scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
}

function createTaskSyncTools(
  workspaceId: string,
  issue: Issue,
  preset: AgentConfig,
  ctx: AgentContext,
): AgentFunctionTool[] {
  return [
    ...createCurrentIssueTools(workspaceId, issue, preset),
    {
      name: 'ReplaceIssueTasks',
      description: 'Replace current non-running issue tasks. Use stable task keys and dependsOnKeys; the controller maps keys to stored task ids.',
      inputSchema: {
        type: 'object',
        properties: {
          issueId: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                agentConfigId: { type: 'string' },
                dependsOnKeys: { type: 'array', items: { type: 'string' } },
                sandboxDirs: { type: 'array', items: { type: 'string' } },
              },
              required: ['key', 'title', 'description'],
              additionalProperties: false,
            },
          },
        },
        required: ['issueId', 'tasks'],
        additionalProperties: false,
      },
      annotations: { destructive: true, openWorld: false },
      execute: async (input) => {
        assertIssueId(issue.id, input);
        const data = input as { tasks?: unknown };
        const tasks = parseTaskDrafts(data.tasks);
        return replaceIssueTasksFromDrafts(workspaceId, issue.id, ctx, tasks);
      },
    },
  ];
}

function replaceIssueTasksFromDrafts(
  workspaceId: string,
  issueId: string,
  ctx: AgentContext,
  drafts: TaskDraft[],
): Task[] {
  const issue = requireIssue(workspaceId, issueId);
  const validAgentIds = new Set(getIssueMemberPresets(workspaceId, issue).map((agent) => agent.id));
  const normalizedDrafts = drafts.map((task) => ({
    ...task,
    agentConfigId: task.agentConfigId && validAgentIds.has(task.agentConfigId) ? task.agentConfigId : undefined,
  }));

  const created = taskService.replaceIssueTasks(workspaceId, issueId, normalizedDrafts.map((task) => ({
    title: task.title,
    description: task.description,
    agentConfigId: task.agentConfigId,
    sandboxDirs: task.sandboxDirs,
  })));
  const idByKey = new Map(normalizedDrafts.map((task, index) => [task.key, created[index]?.id]));

  const updated = created.map((task, index) => {
    const dependencyIds = (normalizedDrafts[index]?.dependsOnKeys ?? [])
      .map((key) => idByKey.get(key))
      .filter((id): id is string => Boolean(id));
    return taskService.update(workspaceId, task.id, { dependsOnTaskIds: dependencyIds }) ?? task;
  });

  const runningTaskIds = taskService.list(workspaceId, issueId)
    .filter((task) => task.status === 'running')
    .map((task) => task.id);
  const issueTasks = issueService.replaceTasks(workspaceId, issueId, [
    ...runningTaskIds,
    ...updated.map((task) => task.id),
  ]);
  for (const task of updated) ctx.broadcast('task.created', task);
  if (issueTasks) ctx.broadcast('issue.updated', issueTasks);
  return updated;
}

function findExecutorForTask(
  workspaceId: string,
  issue: Issue,
  task: Task,
): AgentConfig | null {
  const assignable = getIssueMemberPresets(workspaceId, issue);
  if (task.agentConfigId) {
    const assigned = assignable.find((agent) => agent.id === task.agentConfigId && agent.role === 'executor');
    if (assigned) return assigned;
  }
  return assignable.find((agent) => agent.role === 'executor') ?? null;
}

function findTaskCreatorForIssue(
  workspaceId: string,
  issue: Issue,
  plannerPreset?: AgentConfig,
): AgentConfig | null {
  return findIssueMemberAgent(workspaceId, issue, 'custom')
    ?? plannerPreset
    ?? findIssueMemberAgent(workspaceId, issue, 'executor');
}

function findIssueMemberAgent(
  workspaceId: string,
  issue: Issue,
  role: AgentConfig['role'],
): AgentConfig | null {
  const channel = channelService.getChannel(workspaceId, issue.channelId);
  if (!channel) return null;
  return agentService.findEnabledPresetByRoleInMembers(workspaceId, channel.members, role);
}

function getIssueMemberPresets(workspaceId: string, issue: Issue): AgentConfig[] {
  const channel = channelService.getChannel(workspaceId, issue.channelId);
  if (!channel) return [];
  const members = new Set(channel.members);
  return (agentService.listPresets(workspaceId) ?? [])
    .filter((agent) => members.has(agent.id) && agent.enabled !== false);
}

function updateIssueStatus(
  workspaceId: string,
  issueId: string,
  status: Issue['status'],
  ctx: AgentContext,
): Issue | null {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) return null;
  if (issue.status === status) {
    ctx.broadcast('issue.updated', issue);
    return issue;
  }

  const updated = issueService.updateStatus(workspaceId, issueId, status);
  if (!updated) return null;
  ctx.broadcast('issue.status_changed', { issueId, from: issue.status, to: status });
  ctx.broadcast('issue.updated', updated);
  return updated;
}

async function handleTaskFailure(
  workspaceId: string,
  issueId: string,
  taskId: string,
  result: TaskResult,
  ctx: AgentContext,
): Promise<void> {
  const task = taskService.getById(workspaceId, taskId);
  if (!task) return;

  if ((task.retryCount ?? 0) < (task.maxRetries ?? 3)) {
    const reset = taskService.resetForRetry(workspaceId, taskId, { incrementRetry: true });
    if (reset) {
      ctx.broadcast('task.status_changed', { taskId, from: task.status, to: reset.status });
      ctx.broadcast('task.updated', reset);
      ctx.broadcast('task.output', {
        taskId,
        data: `Retrying task after agent error (${reset.retryCount}/${reset.maxRetries}).`,
      });
    }
    await scheduleRunnableIssueTasks(workspaceId, issueId, ctx);
    return;
  }

  const issue = issueService.getById(workspaceId, issueId);
  const updated = issueService.markError(workspaceId, issueId, result.error || result.summary || 'Task failed after retries');
  if (!updated) return;
  ctx.broadcast('issue.status_changed', { issueId, from: issue?.status ?? 'in_progress', to: 'error' });
  ctx.broadcast('issue.updated', updated);
}

function broadcastTaskUpdate(ctx: AgentContext, task: Task | null, from: TaskStatus): void {
  if (!task) return;
  ctx.broadcast('task.status_changed', { taskId: task.id, from, to: task.status });
  ctx.broadcast('task.updated', task);
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

function buildTaskSyncPrompt(issue: Issue, input: PlannerTaskSyncInput, workingDir: string): string {
  return [
    'You are the issue task synchronization controller.',
    'First call ViewCurrentChannelIssue with the current channel id to load the shared issue context, comments, tasks, channel members, and valid assignable agent config ids.',
    `The current workspace working directory is: ${workingDir}`,
    'All implementation tasks must be scoped to this workspace unless the issue explicitly says otherwise.',
    'For Bash commands that create or modify files under the current working directory, use relative paths instead of absolute paths.',
    'Use ReplaceIssueTasks to write tasks. Do not rely on private planner-only context.',
    'Create coarse-grained, independently deliverable tasks. Default to a single implementation task for one cohesive issue.',
    'NEVER create review/audit/审查 tasks. The review phase is handled automatically by the system after all implementation tasks complete — do not include it as a task.',
    'Split into multiple tasks only when the issue clearly requires major cross-area work, such as separate frontend and backend changes, database/API contract changes plus UI changes, or independent workstreams that different executors can complete without stepping on each other.',
    'Do not split by tiny implementation steps such as "update types", "add route", "adjust UI text", "run tests", or "write docs" unless that item is itself a substantial deliverable.',
    'Each task description should include the relevant implementation scope and expected verification, so executor agents do not need a separate task for every small step.',
    'Assign only valid agentConfigId values from ViewCurrentChannelIssue.validAgentConfigIds. Express task dependencies with dependsOnKeys only when one task truly cannot start before another completes.',
    '',
    'Current issue:',
    `- Issue id: ${issue.id}`,
    `- Channel id: ${issue.channelId}`,
    `- Title: ${issue.title}`,
    `- Status: ${issue.status}`,
    `- Description: ${issue.description || '(empty)'}`,
    '',
    'Planner result:',
    `Summary: ${input.planSummary || '(empty)'}`,
    input.planOutput?.join('\n').trim(),
  ].filter(Boolean).join('\n');
}

function buildExecutorPrompt(issue: Issue, task: Task, workingDir: string): string {
  return [
    'Before executing, call ViewCurrentChannelIssue with the current channel id to load the latest shared issue context and comments.',
    `The current workspace working directory is: ${workingDir}`,
    'Create and modify project files under this working directory. Do not place deliverables in /tmp unless the task explicitly asks for temporary scratch output.',
    'For Bash commands that create or modify files under this working directory, use relative paths such as `mkdir -p css js` instead of absolute paths.',
    'When reporting created files, use paths under the workspace working directory.',
    '',
    'Current issue:',
    `- Issue id: ${issue.id}`,
    `- Channel id: ${issue.channelId}`,
    `- Title: ${issue.title}`,
    '',
    'Current task:',
    `- Task id: ${task.id}`,
    `- Title: ${task.title}`,
    `- Description: ${task.description}`,
  ].join('\n');
}

function createCurrentIssueTools(workspaceId: string, issue: Issue, preset: AgentConfig): AgentFunctionTool[] {
  const channel = channelService.getChannel(workspaceId, issue.channelId);
  return createIssueFunctionTools(workspaceId, channel, {
    senderId: preset.id,
    senderRole: preset.role,
  }, ['ViewCurrentChannelIssue', 'AddCurrentChannelComment']);
}

function parseTaskDrafts(value: unknown): TaskDraft[] {
  if (!Array.isArray(value)) throw new Error('tasks must be an array.');
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`tasks[${index}] must be an object.`);
    }
    const data = item as Record<string, unknown>;
    const key = asNonEmptyString(data.key, `tasks[${index}].key`);
    if (seen.has(key)) throw new Error(`duplicate task key: ${key}`);
    seen.add(key);
    return {
      key,
      title: asNonEmptyString(data.title, `tasks[${index}].title`),
      description: typeof data.description === 'string' ? data.description.trim() : '',
      agentConfigId: typeof data.agentConfigId === 'string' ? data.agentConfigId.trim() || undefined : undefined,
      dependsOnKeys: asStringArray(data.dependsOnKeys),
      sandboxDirs: asStringArray(data.sandboxDirs),
    };
  });
}

function assertIssueId(issueId: string, input: unknown): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object.');
  if ((input as { issueId?: unknown }).issueId !== issueId) throw new Error(`issueId must match current issue id: ${issueId}`);
}

function requireIssue(workspaceId: string, issueId: string): Issue {
  const issue = issueService.getById(workspaceId, issueId);
  if (!issue) throw new Error(`Issue not found: ${issueId}`);
  return issue;
}

function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const normalized = value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : undefined;
}
