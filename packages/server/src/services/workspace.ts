import { v4 as uuid } from 'uuid';
import type { Workspace, CreateWorkspaceInput } from '@agent-spaces/shared';
import { listWorkspaces, getWorkspace, createWorkspace, updateWorkspace, deleteWorkspace } from '../storage/workspace-store.js';
import { ensureDir } from '../storage/json-store.js';
import { join } from 'node:path';

export function getAll(): Workspace[] {
  return listWorkspaces();
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
    agents: [],
  };

  ensureDir(agentspaceDir);
  createWorkspace(ws);
  return ws;
}

export function update(id: string, data: Partial<Pick<Workspace, 'name' | 'boundDirs'>>): Workspace | null {
  const ws = getWorkspace(id);
  if (!ws) return null;

  Object.assign(ws, data, { updatedAt: new Date().toISOString() });
  updateWorkspace(ws);
  return ws;
}

export function remove(id: string): boolean {
  const ws = getWorkspace(id);
  if (!ws) return false;
  deleteWorkspace(id);
  return true;
}
