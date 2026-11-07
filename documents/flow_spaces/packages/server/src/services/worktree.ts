import { v4 as uuid } from 'uuid';
import simpleGit from 'simple-git';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { WorktreeInfo, CreateWorktreeInput, Workspace, GitDiffResult } from '@agent-spaces/shared';
import { getDataDir, ensureDir } from '../storage/json-store.js';
import {
  listWorktrees, getWorktree, createWorktree as storeCreate,
  updateWorktree,
} from '../storage/worktree-store.js';
import {
  getWorkspace,
  createWorkspace,
  deleteWorkspace,
} from '../storage/workspace-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { runPullRequestAgent } from '../agents/pull-request-agent.js';

function worktreesBaseDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId, 'worktrees');
}

export function listWorkspaceWorktrees(workspaceId: string): WorktreeInfo[] {
  return listWorktrees(workspaceId).filter(wt => wt.status === 'active');
}

export function getWorkspaceWorktree(workspaceId: string, worktreeId: string): WorktreeInfo | null {
  return getWorktree(workspaceId, worktreeId);
}

export async function createWorkspaceWorktree(
  workspaceId: string, input: CreateWorktreeInput
): Promise<WorktreeInfo> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const id = uuid();
  let branch = input.branch || `${input.name}-${Date.now()}`;
  const wtPath = join(worktreesBaseDir(workspaceId), id);

  ensureDir(join(worktreesBaseDir(workspaceId)));

  const git = simpleGit(ws.boundDirs[0]);

  // Auto-resolve branch name conflicts
  const branches = await git.branch();
  let suffix = 1;
  const baseBranch = branch;
  while (branches.all.includes(branch)) {
    suffix++;
    branch = `${baseBranch}-${suffix}`;
  }

  await git.raw(['worktree', 'add', wtPath, '-b', branch]);

  const now = new Date().toISOString();
  const info: WorktreeInfo = {
    id, workspaceId, name: input.name, branch, path: wtPath,
    agentId: input.agentId, issueId: input.issueId, nodeExecutionId: input.nodeExecutionId,
    status: 'active', createdAt: now, updatedAt: now,
  };

  storeCreate(workspaceId, info);

  // Write virtual workspace.json so getWorkspace(wtId) resolves for all sub-routes
  const virtualWs: Workspace = {
    id, name: `${input.name} (Worktree)`, boundDirs: [wtPath],
    agentspaceDir: join(wtPath, '.agentspace'),
    isWorktree: true, parentWorkspaceId: workspaceId,
    createdAt: now, updatedAt: now, activeChannels: [], activeIssues: [],
  };
  createWorkspace(virtualWs);

  broadcastToWorkspace(workspaceId, 'worktree.created', info);
  return info;
}

export async function deleteWorkspaceWorktree(
  workspaceId: string, worktreeId: string
): Promise<void> {
  const info = getWorktree(workspaceId, worktreeId);
  if (!info) throw new Error('Worktree not found');

  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = simpleGit(ws.boundDirs[0]);
  await git.raw(['worktree', 'remove', info.path, '--force']).catch(() => {});

  // Clean up virtual workspace entry.
  deleteWorkspace(worktreeId);

  info.status = 'deleted';
  info.updatedAt = new Date().toISOString();
  updateWorktree(workspaceId, info);

  broadcastToWorkspace(workspaceId, 'worktree.deleted', { id: worktreeId, workspaceId });
}

export async function getWorktreeDiff(
  workspaceId: string, worktreeId: string
): Promise<GitDiffResult[]> {
  const info = getWorktree(workspaceId, worktreeId);
  if (!info) throw new Error('Worktree not found');

  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = simpleGit(ws.boundDirs[0]);
  const defaultBranch = await getDefaultBranch(git);
  const nameOnlyRaw = await git.diff(['--name-only', `${defaultBranch}...${info.branch}`]);
  const files = nameOnlyRaw.split('\n').filter(Boolean);

  const diffs: GitDiffResult[] = [];
  for (const f of files) {
    const binary = isBinaryPath(f);
    const oldContent = binary ? '' : await git.show([`${defaultBranch}:${f}`]).catch(() => '');
    const newContent = binary ? '' : await git.show([`${info.branch}:${f}`]).catch(() => '');
    diffs.push({ path: f, oldContent, newContent, isBinary: binary, isNew: !oldContent, isDeleted: !newContent });
  }
  return diffs;
}

export async function createWorktreePR(
  workspaceId: string, worktreeId: string, title?: string, body?: string
): Promise<string> {
  const info = getWorktree(workspaceId, worktreeId);
  if (!info) throw new Error('Worktree not found');

  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = simpleGit(ws.boundDirs[0]);
  const defaultBranch = await getDefaultBranch(git);
  const log = await git.log([`${defaultBranch}..${info.branch}`]);
  if (log.total === 0) {
    throw new Error('Cannot create PR: no commits on this branch. Make changes and commit first.');
  }

  try {
    await git.push('origin', info.branch, ['--set-upstream']);
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e);
    throw new Error(`Failed to push branch before creating PR: ${msg.replace(/^(Command failed: )?git\s*/, '').trim()}`);
  }

  const prTitle = title || `[${info.name}] ${info.branch}`;
  const ghArgs = [
    'pr', 'create',
    '--base', defaultBranch,
    '--head', info.branch,
    '--title', prTitle,
    '--body', body || '',
  ];

  let result: string;
  try {
    result = execFileSync('gh', ghArgs, { cwd: ws.boundDirs[0], encoding: 'utf-8' });
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e);
    throw new Error(`Failed to create PR: ${msg.replace(/^(Command failed: )?gh\s*/, '').trim()}`);
  }
  const urlMatch = result.match(/https:\/\/[^\s]+/);
  if (!urlMatch) throw new Error('PR created but failed to parse URL from output');

  info.prUrl = urlMatch[0];
  info.updatedAt = new Date().toISOString();
  updateWorktree(workspaceId, info);

  broadcastToWorkspace(workspaceId, 'worktree.pr_created', info);
  return info.prUrl;
}

export async function getWorktreePRDraft(
  workspaceId: string, worktreeId: string, title?: string
): Promise<{ title: string; body: string; baseBranch: string }> {
  const info = getWorktree(workspaceId, worktreeId);
  if (!info) throw new Error('Worktree not found');

  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = simpleGit(ws.boundDirs[0]);
  const defaultBranch = await getDefaultBranch(git);
  const commits = await git.log([`${defaultBranch}..${info.branch}`])
    .then((log) => log.all.map((entry) => entry.message));
  const diff = await git.diff([`${defaultBranch}...${info.branch}`]);
  const body = await runPullRequestAgent(workspaceId, {
    worktree: info,
    baseBranch: defaultBranch,
    commits,
    diff,
  });

  return {
    title: title || `[${info.name}] ${info.branch}`,
    body,
    baseBranch: defaultBranch,
  };
}

export async function mergeWorktreePR(
  workspaceId: string, worktreeId: string
): Promise<void> {
  const info = getWorktree(workspaceId, worktreeId);
  if (!info) throw new Error('Worktree not found');
  if (!info.prUrl) throw new Error('No PR associated with this worktree');

  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = simpleGit(ws.boundDirs[0]);

  try {
    execFileSync('gh', ['pr', 'merge', info.prUrl, '--merge'], { cwd: ws.boundDirs[0], encoding: 'utf-8' });
  } catch (e: any) {
    const msg = e?.stderr || e?.message || String(e);
    throw new Error(`Failed to merge PR: ${msg.replace(/^(Command failed: )?gh\s*/, '').trim()}`);
  }
  await git.raw(['worktree', 'remove', info.path]).catch(() => {});
  await git.raw(['branch', '-d', info.branch]).catch(() => {});

  // Clean up virtual workspace entry.
  deleteWorkspace(worktreeId);

  info.status = 'merged';
  info.updatedAt = new Date().toISOString();
  updateWorktree(workspaceId, info);

  broadcastToWorkspace(workspaceId, 'worktree.merged', info);
}

const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif', '.mp3', '.mp4', '.zip', '.gz', '.tar', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.wasm']);

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTS.has(ext);
}

async function getDefaultBranch(git: ReturnType<typeof simpleGit>): Promise<string> {
  try {
    const result = await git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const match = result.match(/refs\/remotes\/origin\/(.+)/);
    if (match) return match[1].trim();
  } catch {}
  // Fallback: try common names
  const branches = await git.branch();
  if (branches.all.includes('main')) return 'main';
  if (branches.all.includes('master')) return 'master';
  return 'main';
}
