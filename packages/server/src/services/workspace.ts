import { v4 as uuid } from 'uuid';
import type { Workspace, CreateWorkspaceInput } from '@agent-spaces/shared';
import { listWorkspaces, getWorkspace, createWorkspace, updateWorkspace, deleteWorkspace } from '../storage/workspace-store.js';
import { ensureDir } from '../storage/json-store.js';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

const AGENTSPACE_DIRS = ['skills', 'agents', 'tasks', 'cache', 'logs', 'cache/locks'];
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
  initAgentspace(agentspaceDir);
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
