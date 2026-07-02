import { v4 as uuid } from 'uuid';
import type { Workspace, CreateWorkspaceInput, WorktreeInfo } from '@agent-spaces/shared';
import { listWorkspaces, getWorkspace, createWorkspace, updateWorkspace, deleteWorkspace } from '../storage/workspace-store.js';
import { listWorktrees } from '../storage/worktree-store.js';
import { ensureDir } from '../storage/json-store.js';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { ensureGeneralChannel } from './channel.js';

const AGENTSPACE_DIRS = ['skills', 'agents', 'workflow-runs', 'cache', 'logs', 'cache/locks'];
const AGENTSPACE_FILES: Record<string, string> = {
  'claude.md': '# Agent Spaces Knowledge Base\n',
};

function initAgentspace(agentspaceDir: string): void {
  ensureDir(agentspaceDir);
  for (const sub of AGENTSPACE_DIRS) {
    ensureDir(join(agentspaceDir, sub));
  }
  for (const [file, content] of Object.entries(AGENTSPACE_FILES)) {
    const fullPath = join(agentspaceDir, file);
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, content, 'utf-8');
    }
  }
}

export function getAll(): Workspace[] {
  const workspaces = listWorkspaces();
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const worktreeWorkspaces = workspaces
    .filter((workspace) => !workspace.isWorktree)
    .flatMap((workspace) =>
      listWorktrees(workspace.id)
        .filter((worktree) => worktree.status === 'active' && !workspaceIds.has(worktree.id))
        .map(worktreeToWorkspace)
    );

  return [...workspaces, ...worktreeWorkspaces];
}

export function getById(id: string): Workspace | null {
  return getWorkspace(id);
}

export function create(input: CreateWorkspaceInput): Workspace {
  const id = uuid();
  const now = new Date().toISOString();
  const agentspaceDir = join(input.boundDirs[0], '.agentspace');

  const ws: Workspace = {
    id,
    name: input.name,
    boundDirs: input.boundDirs,
    agentspaceDir,
    createdAt: now,
    updatedAt: now,
    activeChannels: [],
    activeIssues: [],
  };

  ensureDir(agentspaceDir);
  initAgentspace(agentspaceDir);
  createWorkspace(ws);
  ensureGeneralChannel(id);
  return ws;
}

export function update(id: string, data: Partial<Pick<Workspace, 'name' | 'boundDirs' | 'autoProcessIssues' | 'notificationSettings' | 'hooksEnabled'>>): Workspace | null {
  const ws = getWorkspace(id);
  if (!ws) return null;

  const allowed: Partial<Pick<Workspace, 'name' | 'boundDirs' | 'autoProcessIssues' | 'notificationSettings' | 'hooksEnabled'>> = {};
  if (Object.hasOwn(data, 'name')) allowed.name = data.name;
  if (Object.hasOwn(data, 'boundDirs')) allowed.boundDirs = data.boundDirs;
  if (Object.hasOwn(data, 'autoProcessIssues')) allowed.autoProcessIssues = data.autoProcessIssues;
  if (Object.hasOwn(data, 'notificationSettings')) allowed.notificationSettings = data.notificationSettings;
  if (Object.hasOwn(data, 'hooksEnabled')) allowed.hooksEnabled = data.hooksEnabled;

  Object.assign(ws, allowed, { updatedAt: new Date().toISOString() });
  updateWorkspace(ws);
  return ws;
}

export function remove(id: string): boolean {
  const ws = getWorkspace(id);
  if (!ws) return false;
  deleteWorkspace(id);
  return true;
}

function worktreeToWorkspace(worktree: WorktreeInfo): Workspace {
  return {
    id: worktree.id,
    name: `${worktree.name} (Worktree)`,
    boundDirs: [worktree.path],
    agentspaceDir: join(worktree.path, '.agentspace'),
    isWorktree: true,
    parentWorkspaceId: worktree.workspaceId,
    createdAt: worktree.createdAt,
    updatedAt: worktree.updatedAt,
    activeChannels: [],
    activeIssues: [],
  };
}
