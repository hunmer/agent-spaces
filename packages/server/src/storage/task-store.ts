import { join } from 'node:path';
import type { Task } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

function tasksDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId, 'tasks');
}

function tasksIndex(workspaceId: string) {
  return join(tasksDir(workspaceId), 'index.json');
}

function taskFile(workspaceId: string, taskId: string) {
  return join(tasksDir(workspaceId), `${taskId}.json`);
}

export function listTasks(workspaceId: string): Task[] {
  return readJsonFile<Task[]>(tasksIndex(workspaceId)) || [];
}

export function getTask(workspaceId: string, taskId: string): Task | null {
  return readJsonFile<Task>(taskFile(workspaceId, taskId));
}

export function createTask(task: Task): void {
  ensureDir(tasksDir(task.workspaceId));
  writeJsonFile(taskFile(task.workspaceId, task.id), task);

  const list = listTasks(task.workspaceId);
  list.push(task);
  writeJsonFile(tasksIndex(task.workspaceId), list);
}

export function updateTask(task: Task): void {
  writeJsonFile(taskFile(task.workspaceId, task.id), task);

  const list = listTasks(task.workspaceId);
  const idx = list.findIndex((t) => t.id === task.id);
  if (idx >= 0) list[idx] = task;
  writeJsonFile(tasksIndex(task.workspaceId), list);
}

export function deleteTask(workspaceId: string, taskId: string): void {
  const list = listTasks(workspaceId).filter((t) => t.id !== taskId);
  writeJsonFile(tasksIndex(workspaceId), list);
}
