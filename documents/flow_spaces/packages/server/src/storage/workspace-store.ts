import { join } from 'node:path';
import type { Workspace } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

function workspacesIndex() {
  return join(getDataDir(), 'workspaces', 'index.json');
}

function workspaceDir(id: string) {
  return join(getDataDir(), 'workspaces', id);
}

export function listWorkspaces(): Workspace[] {
  return readJsonFile<Workspace[]>(workspacesIndex()) || [];
}

export function getWorkspace(id: string): Workspace | null {
  return readJsonFile<Workspace>(join(workspaceDir(id), 'workspace.json'));
}

export function createWorkspace(ws: Workspace): void {
  const dir = workspaceDir(ws.id);
  ensureDir(dir);
  writeJsonFile(join(dir, 'workspace.json'), ws);

  const list = listWorkspaces();
  list.push(ws);
  writeJsonFile(workspacesIndex(), list);
}

export function updateWorkspace(ws: Workspace): void {
  writeJsonFile(join(workspaceDir(ws.id), 'workspace.json'), ws);

  const list = listWorkspaces();
  const idx = list.findIndex((w) => w.id === ws.id);
  if (idx >= 0) list[idx] = ws;
  writeJsonFile(workspacesIndex(), list);
}

export function deleteWorkspace(id: string): void {
  const list = listWorkspaces().filter((w) => w.id !== id);
  writeJsonFile(workspacesIndex(), list);
}
