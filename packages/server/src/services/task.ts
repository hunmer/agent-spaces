import { v4 as uuid } from 'uuid';
import type { Task, TaskStatus, TaskResult } from '@agent-spaces/shared';
import { listTasks, getTask, createTask, updateTask, deleteTask } from '../storage/task-store.js';

export function list(workspaceId: string, issueId?: string): Task[] {
  const all = listTasks(workspaceId);
  return issueId ? all.filter((t) => t.issueId === issueId) : all;
}

export function getById(workspaceId: string, taskId: string): Task | null {
  return getTask(workspaceId, taskId);
}

export function create(
  workspaceId: string,
  issueId: string,
  data: { title: string; description: string; agentConfigId?: string; dependsOnTaskIds?: string[]; sandboxDirs?: string[] },
): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    issueId,
    workspaceId,
    title: data.title,
    description: data.description,
    status: 'pending',
    agentConfigId: data.agentConfigId,
    dependsOnTaskIds: normalizeTaskIds(data.dependsOnTaskIds),
    sandboxDirs: data.sandboxDirs,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
  createTask(task);
  return task;
}

export function update(
  workspaceId: string,
  taskId: string,
  data: { title?: string; description?: string; agentConfigId?: string; dependsOnTaskIds?: string[]; sandboxDirs?: string[] },
): Task | null {
  const task = getTask(workspaceId, taskId);
  if (!task) return null;
  if (task.status !== 'pending') return null;

  if (data.title !== undefined) task.title = data.title;
  if (data.description !== undefined) task.description = data.description;
  if (Object.hasOwn(data, 'agentConfigId')) task.agentConfigId = data.agentConfigId;
  if (data.dependsOnTaskIds !== undefined) task.dependsOnTaskIds = normalizeTaskIds(data.dependsOnTaskIds);
  if (Object.hasOwn(data, 'sandboxDirs')) task.sandboxDirs = data.sandboxDirs;
  task.updatedAt = new Date().toISOString();
  updateTask(task);
  return task;
}

export function replaceIssueTasks(
  workspaceId: string,
  issueId: string,
  data: Array<{ title: string; description: string; agentConfigId?: string; dependsOnTaskIds?: string[]; sandboxDirs?: string[] }>,
): Task[] {
  const existing = list(workspaceId, issueId);
  const removable = existing.filter((task) => task.status !== 'running' && task.status !== 'reviewing');
  for (const task of removable) deleteTask(workspaceId, task.id);

  return data.map((task) => create(workspaceId, issueId, {
    title: task.title,
    description: task.description,
    agentConfigId: task.agentConfigId,
    dependsOnTaskIds: task.dependsOnTaskIds,
    sandboxDirs: task.sandboxDirs,
  }));
}

export function updateStatus(
  workspaceId: string,
  taskId: string,
  status: TaskStatus,
  extra?: Partial<Task>,
): Task | null {
  const task = getTask(workspaceId, taskId);
  if (!task) return null;

  task.status = status;
  task.updatedAt = new Date().toISOString();
  if (extra) Object.assign(task, extra);
  updateTask(task);
  return task;
}

export function markRunningTasksFailed(workspaceId: string, reason: string): Task[] {
  const running = list(workspaceId).filter((task) =>
    task.status === 'running' || task.status === 'reviewing' || task.status === 'retrying');
  return running.map((task) => updateStatus(workspaceId, task.id, 'failed', {
    result: {
      success: false,
      summary: reason,
      artifacts: [],
      error: reason,
    },
  })).filter((task): task is Task => Boolean(task));
}

export function resetForRetry(
  workspaceId: string,
  taskId: string,
  options: { incrementRetry?: boolean; resetRetryCount?: boolean } = {},
): Task | null {
  const task = getTask(workspaceId, taskId);
  if (!task) return null;

  const retryCount = options.resetRetryCount
    ? 0
    : options.incrementRetry ? (task.retryCount ?? 0) + 1 : (task.retryCount ?? 0);
  return updateStatus(workspaceId, taskId, 'pending', {
    retryCount,
    assignedAgentId: undefined,
    result: undefined,
  });
}

export function assignAgent(
  workspaceId: string,
  taskId: string,
  agentId: string,
): Task | null {
  return updateStatus(workspaceId, taskId, 'running', { assignedAgentId: agentId });
}

export function complete(
  workspaceId: string,
  taskId: string,
  result: TaskResult,
): Task | null {
  return updateStatus(workspaceId, taskId, result.success ? 'done' : 'failed', { result });
}

export function retry(workspaceId: string, taskId: string): Task | null {
  const task = getTask(workspaceId, taskId);
  if (!task) return null;

  if (task.retryCount >= task.maxRetries) {
    return updateStatus(workspaceId, taskId, 'failed');
  }

  return updateStatus(workspaceId, taskId, 'retrying', {
    retryCount: task.retryCount + 1,
  });
}

export function cancel(workspaceId: string, taskId: string): Task | null {
  return updateStatus(workspaceId, taskId, 'cancelled');
}

export function remove(workspaceId: string, taskId: string): boolean {
  const task = getTask(workspaceId, taskId);
  if (!task) return false;
  deleteTask(workspaceId, taskId);
  return true;
}

function normalizeTaskIds(ids: string[] | undefined): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const normalized = ids.map((id) => id.trim()).filter(Boolean);
  return [...new Set(normalized)];
}
