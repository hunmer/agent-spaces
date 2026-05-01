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
  data: { title: string; description: string; sandboxDirs?: string[] },
): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    issueId,
    workspaceId,
    title: data.title,
    description: data.description,
    status: 'pending',
    sandboxDirs: data.sandboxDirs,
    retryCount: 0,
    maxRetries: 3,
    createdAt: now,
    updatedAt: now,
  };
  createTask(task);
  return task;
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
