import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import type { GitStatusResult, GitFileStatus, GitLogEntry, GitDiffResult } from '@agent-spaces/shared';
import type { Workspace } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

const gitInstances = new Map<string, SimpleGit>();

function getGitOptions(): Partial<import('simple-git').SimpleGitOptions> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  const config: string[] = [];
  if (proxy) {
    config.push(`http.proxy=${proxy}`, `https.proxy=${proxy}`);
  }
  return config.length ? { config } : {};
}

function getGit(workspace: Workspace): SimpleGit {
  const existing = gitInstances.get(workspace.id);
  if (existing) return existing;

  const git = simpleGit(workspace.boundDirs[0], getGitOptions());
  git.outputHandler((_binary, stdout, stderr) => {
    stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[git:${workspace.id}] ${text}`);
    });
    stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[git:${workspace.id}] ${text}`);
    });
  });
  gitInstances.set(workspace.id, git);
  return git;
}

function mapStatus(raw: StatusResult): GitStatusResult {
  const files: GitFileStatus[] = [];

  for (const f of raw.staged) {
    files.push({ path: f, status: mapStatusCode(raw.files.find(r => r.path === f)?.index) });
  }
  for (const f of raw.modified) {
    if (!files.find(x => x.path === f)) {
      files.push({ path: f, status: 'modified' });
    }
  }
  for (const f of raw.not_added) {
    files.push({ path: f, status: 'untracked' });
  }
  for (const f of raw.deleted) {
    if (!files.find(x => x.path === f)) {
      files.push({ path: f, status: 'deleted' });
    }
  }
  for (const f of raw.created) {
    if (!files.find(x => x.path === f)) {
      files.push({ path: f, status: 'added' });
    }
  }

  return {
    branch: raw.current || 'HEAD',
    files,
    ahead: raw.ahead,
    behind: raw.behind,
    clean: raw.isClean(),
  };
}

function mapStatusCode(code: string | undefined): GitFileStatus['status'] {
  switch (code) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'M': return 'modified';
    default: return 'modified';
  }
}

export async function gitStatus(workspaceId: string): Promise<GitStatusResult> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const raw = await git.status();
  return mapStatus(raw);
}

export async function gitDiff(workspaceId: string, filePath?: string): Promise<GitDiffResult[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const diffs: GitDiffResult[] = [];

  if (filePath) {
    const diff = await git.diff([filePath]);
    const oldContent = await git.show([`HEAD:${filePath}`]).catch(() => '');
    const newContent = await import('node:fs/promises').then(fs =>
      fs.readFile(`${ws.boundDirs[0]}/${filePath}`, 'utf-8')
    ).catch(() => '');

    diffs.push({
      path: filePath,
      oldContent,
      newContent,
      isBinary: false,
      isNew: !oldContent,
      isDeleted: !newContent,
    });
  } else {
    const raw = await git.diff(['--name-only']);
    const files = raw.split('\n').filter(Boolean);

    for (const f of files) {
      const oldContent = await git.show([`HEAD:${f}`]).catch(() => '');
      const newContent = await import('node:fs/promises').then(fs =>
        fs.readFile(`${ws.boundDirs[0]}/${f}`, 'utf-8')
      ).catch(() => '');

      diffs.push({
        path: f,
        oldContent,
        newContent,
        isBinary: false,
        isNew: !oldContent,
        isDeleted: !newContent,
      });
    }

    // Also check untracked (staged new files)
    const status = await git.status();
    for (const f of status.not_added) {
      const newContent = await import('node:fs/promises').then(fs =>
        fs.readFile(`${ws.boundDirs[0]}/${f}`, 'utf-8')
      ).catch(() => '');
      if (newContent) {
        diffs.push({
          path: f,
          oldContent: '',
          newContent,
          isBinary: false,
          isNew: true,
          isDeleted: false,
        });
      }
    }
  }

  return diffs;
}

export async function gitLog(workspaceId: string, maxCount = 50): Promise<GitLogEntry[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const log = await git.log({ maxCount });

  return log.all.map(entry => ({
    hash: entry.hash.substring(0, 7),
    message: entry.message,
    author: entry.author_name,
    date: entry.date,
  }));
}

export async function gitCommit(workspaceId: string, message: string): Promise<{ hash: string }> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.add('-A');
  const result = await git.commit(message);
  return { hash: result.commit };
}

export async function gitDiscard(workspaceId: string, filePath: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.checkout(['--', filePath]);
}

export async function gitDiscardAll(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.checkout(['--', '.']);
  await git.clean('f', ['-d']);
}

export async function gitBranches(workspaceId: string): Promise<import('@agent-spaces/shared').GitBranch[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const raw = await git.branch();
  return raw.all.map(name => ({
    name,
    current: name === raw.current,
  }));
}

export async function gitCheckout(workspaceId: string, branch: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.checkout(branch);
}

const DEFAULT_GITIGNORE = `node_modules/
dist/
.env
.env.local
.env.*.local

# OS files
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# Logs
*.log
npm-debug.log*

# Coverage
coverage/

# Agent Spaces
.agentspace/
`;

export async function gitGenerateCommitMsg(workspaceId: string): Promise<string> {
  const { runCommitAgent } = await import('../agents/commit-agent.js');
  return runCommitAgent(workspaceId);
}

export async function gitPush(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const status = await git.status();
  const branch = status.current || 'HEAD';

  const remotes = await git.getRemotes(true);
  if (!remotes.length) throw new Error('No remote repository configured. Please add a remote first.');

  await git.push('origin', branch);
}

export async function gitPull(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const status = await git.status();
  const branch = status.current || 'HEAD';

  await git.pull('origin', branch);
}

export async function gitGetRemotes(workspaceId: string): Promise<{ name: string; refs: { fetch: string; push: string } }[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  return git.getRemotes(true);
}

export async function gitAddRemote(workspaceId: string, name: string, url: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const remotes = await git.getRemotes();
  if (remotes.some(r => r.name === name)) {
    await git.remote(['set-url', name, url]);
  } else {
    await git.addRemote(name, url);
  }
}

export async function gitInit(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const rootDir = ws.boundDirs[0];
  const git = simpleGit(rootDir, getGitOptions());
  await git.init();

  const gitignorePath = join(rootDir, '.gitignore');
  try {
    const existing = await readFile(gitignorePath, 'utf-8');
    if (!existing.includes('.agentspace')) {
      await writeFile(gitignorePath, existing.trimEnd() + '\n\n# Agent Spaces\n.agentspace/\n', 'utf-8');
    }
  } catch {
    await writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
  }

  gitInstances.delete(workspaceId);
}

export interface GitCloneProgress {
  phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'done' | 'error';
  progress: number;
  received?: number;
  total?: number;
  error?: string;
}

export async function gitClone(
  targetDir: string,
  url: string,
  onProgress: (progress: GitCloneProgress) => void,
): Promise<string> {
  if (!existsSync(targetDir)) {
    await mkdir(targetDir, { recursive: true });
  }

  const repoName = basename(url, '.git').replace(/\.git$/, '') || 'repo';
  const cloneDir = join(targetDir, repoName);

  if (existsSync(cloneDir)) {
    throw new Error(`目录 ${cloneDir} 已存在`);
  }

  const git = simpleGit(getGitOptions());
  git.outputHandler((_binary, stdout, stderr) => {
    stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      console.log(`[git:clone] ${text.trim()}`);
      const parsed = parseCloneProgress(text);
      if (parsed) onProgress(parsed);
    });
    stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[git:clone] ${text}`);
    });
  });

  await git.clone(url, cloneDir, ['--progress']);
  return cloneDir;
}

function parseCloneProgress(text: string): GitCloneProgress | null {
  // git --progress 输出用 \r 覆盖，可能有多个阶段在同一段文本中
  const lines = text.split('\r').filter(Boolean);
  let result: GitCloneProgress | null = null;

  for (const line of lines) {
    const m =
      line.match(/Counting objects:\s*(\d+)%\s*\((\d+)\/(\d+)\)/) ||
      line.match(/Compressing objects:\s*(\d+)%\s*\((\d+)\/(\d+)\)/) ||
      line.match(/Receiving objects:\s*(\d+)%\s*\((\d+)\/(\d+)\)/) ||
      line.match(/Resolving deltas:\s*(\d+)%\s*\((\d+)\/(\d+)\)/);

    if (m) {
      const phaseMap: Record<string, GitCloneProgress['phase']> = {
        Counting: 'counting',
        Compressing: 'compressing',
        Receiving: 'receiving',
        Resolving: 'resolving',
      };
      const keyword = m[0].split(' ')[0];
      result = {
        phase: phaseMap[keyword] || 'receiving',
        progress: parseInt(m[1]),
        received: parseInt(m[2]),
        total: parseInt(m[3]),
      };
    }
  }

  return result;
}
