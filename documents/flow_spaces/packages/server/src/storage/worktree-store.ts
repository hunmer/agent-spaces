import { join } from 'node:path';
import type { WorktreeInfo } from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile } from './json-store.js';

function worktreesDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId, 'worktrees');
}

function worktreesIndex(workspaceId: string) {
  return join(worktreesDir(workspaceId), 'index.json');
}

export function listWorktrees(workspaceId: string): WorktreeInfo[] {
  return readJsonFile<WorktreeInfo[]>(worktreesIndex(workspaceId)) || [];
}

export function getWorktree(workspaceId: string, worktreeId: string): WorktreeInfo | null {
  const list = listWorktrees(workspaceId);
  return list.find(wt => wt.id === worktreeId) ?? null;
}

export function createWorktree(workspaceId: string, info: WorktreeInfo): void {
  ensureDir(worktreesDir(workspaceId));
  const list = listWorktrees(workspaceId);
  list.push(info);
  writeJsonFile(worktreesIndex(workspaceId), list);
}

export function updateWorktree(workspaceId: string, info: WorktreeInfo): void {
  const list = listWorktrees(workspaceId);
  const idx = list.findIndex(wt => wt.id === info.id);
  if (idx >= 0) list[idx] = info;
  writeJsonFile(worktreesIndex(workspaceId), list);
}

export function deleteWorktreeFromIndex(workspaceId: string, worktreeId: string): void {
  const list = listWorktrees(workspaceId).filter(wt => wt.id !== worktreeId);
  writeJsonFile(worktreesIndex(workspaceId), list);
}
