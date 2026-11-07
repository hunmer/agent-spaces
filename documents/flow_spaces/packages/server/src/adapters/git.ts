import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import type { GitStatusResult, GitFileStatus, GitLogEntry, GitDiffResult } from '@agent-spaces/shared';
import type { Workspace } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm',
  'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'dmg', 'iso',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib', 'bin', 'dat',
  'sqlite', 'db', 'pyc', 'o', 'obj', 'class', 'jar', 'wasm',
]);

function isBinaryPath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext ? BINARY_EXTENSIONS.has(ext) : true;
}

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

async function ensureRepo(git: SimpleGit, dir: string): Promise<void> {
  let initialized = false;
  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) { await git.init(false); initialized = true; }
  } catch {
    try { await git.init(false); initialized = true; } catch {}
  }
  if (initialized) {
    const gitignorePath = join(dir, '.gitignore');
    try {
      const existing = await readFile(gitignorePath, 'utf-8');
      if (!existing.includes('.agentspace')) {
        await writeFile(gitignorePath, existing.trimEnd() + '\n\n# Agent Spaces\n.agentspace/\n', 'utf-8');
      }
    } catch {
      await writeFile(gitignorePath, DEFAULT_GITIGNORE, 'utf-8');
    }
  }
}

function getGit(workspace: Workspace): SimpleGit {
  const existing = gitInstances.get(workspace.id);
  if (existing) return existing;

  const git = simpleGit(workspace.boundDirs[0], getGitOptions());
  gitInstances.set(workspace.id, git);
  return git;
}

function mapStatus(raw: StatusResult): GitStatusResult {
  const files: GitFileStatus[] = [];
  const addOrUpdate = (file: GitFileStatus) => {
    const existing = files.find(x => x.path === file.path);
    if (existing) {
      Object.assign(existing, file, {
        staged: existing.staged || file.staged,
        conflicted: existing.conflicted || file.conflicted,
        status: file.conflicted ? 'conflicted' : existing.status,
      });
    } else {
      files.push(file);
    }
  };

  for (const f of raw.staged) {
    addOrUpdate({ path: f, status: mapStatusCode(raw.files.find(r => r.path === f)?.index), staged: true });
  }
  for (const f of raw.modified) {
    addOrUpdate({ path: f, status: 'modified' });
  }
  for (const f of raw.not_added) {
    addOrUpdate({ path: f, status: 'untracked' });
  }
  for (const f of raw.deleted) {
    addOrUpdate({ path: f, status: 'deleted' });
  }
  for (const f of raw.created) {
    addOrUpdate({ path: f, status: 'added', staged: raw.staged.includes(f) });
  }
  for (const f of raw.conflicted) {
    addOrUpdate({ path: f, status: 'conflicted', conflicted: true });
  }

  return {
    branch: raw.current || 'HEAD',
    files,
    ahead: raw.ahead,
    behind: raw.behind,
    clean: raw.isClean(),
    insertions: 0,
    deletions: 0,
  };
}

async function getUpstreamRef(git: SimpleGit, branch?: string): Promise<string | null> {
  const refExists = async (ref: string): Promise<boolean> => {
    return git.raw(['rev-parse', '--verify', '--quiet', ref])
      .then(() => true)
      .catch(() => false);
  };

  const upstream = await git.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
    .then(v => v.trim())
    .catch(() => '');
  if (upstream && await refExists(upstream)) return upstream;

  if (!branch || branch === 'HEAD') return null;
  const originBranch = `origin/${branch}`;
  return await refExists(originBranch) ? originBranch : null;
}

function splitConflictSides(content: string): { left: string; right: string; hasConflict: boolean } {
  const left: string[] = [];
  const right: string[] = [];
  let mode: 'both' | 'left' | 'right' = 'both';
  let hasConflict = false;

  for (const line of content.split('\n')) {
    if (line.startsWith('<<<<<<< ')) {
      hasConflict = true;
      mode = 'left';
      continue;
    }
    if (line.startsWith('=======')) {
      mode = 'right';
      continue;
    }
    if (line.startsWith('>>>>>>> ')) {
      mode = 'both';
      continue;
    }

    if (mode === 'both' || mode === 'left') left.push(line);
    if (mode === 'both' || mode === 'right') right.push(line);
  }

  return { left: left.join('\n'), right: right.join('\n'), hasConflict };
}

async function buildWorkingDiff(
  git: SimpleGit,
  rootDir: string,
  filePath: string,
  conflicted = false,
): Promise<GitDiffResult> {
  const binary = isBinaryPath(filePath);
  const workingContent = binary ? '' : await readFile(join(rootDir, filePath), 'utf-8').catch(() => '');

  if (!binary && conflicted) {
    const conflict = splitConflictSides(workingContent);
    if (conflict.hasConflict) {
      return {
        path: filePath,
        oldContent: conflict.left,
        newContent: conflict.right,
        isBinary: false,
        isNew: false,
        isDeleted: false,
        isConflict: true,
      };
    }
  }

  const oldContent = binary ? '' : await git.show([`HEAD:${filePath}`]).catch(() => '');

  return {
    path: filePath,
    oldContent,
    newContent: workingContent,
    isBinary: binary,
    isNew: !oldContent,
    isDeleted: !workingContent,
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
  await ensureRepo(git, ws.boundDirs[0]);
  const raw = await git.status();
  const result = mapStatus(raw);

  try {
    const headHash = await git.revparse(['--short', 'HEAD']);
    result.headHash = headHash.trim();
  } catch {}

  try {
    const upstream = await getUpstreamRef(git, result.branch);
    if (upstream) {
      const counts = await git.raw(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]);
      const [ahead, behind] = counts.trim().split(/\s+/).map((value) => Number(value));
      if (Number.isFinite(ahead)) result.ahead = ahead;
      if (Number.isFinite(behind)) result.behind = behind;

      const remoteHeadHash = await git.revparse(['--short', upstream]);
      result.remoteHeadHash = remoteHeadHash.trim();
    }
  } catch {}

  if (!result.clean) {
    try {
      // Tracked changes: modified/deleted/renamed
      const trackedStat = await git.diff(['--shortstat']);
      let insertions = 0, deletions = 0;
      const mIns = trackedStat.match(/(\d+) insertion/);
      const mDel = trackedStat.match(/(\d+) deletion/);
      if (mIns) insertions += parseInt(mIns[1]);
      if (mDel) deletions += parseInt(mDel[1]);

      // Staged new files: --cached --shortstat
      const stagedStat = await git.diff(['--cached', '--shortstat']);
      const sIns = stagedStat.match(/(\d+) insertion/);
      const sDel = stagedStat.match(/(\d+) deletion/);
      if (sIns) insertions += parseInt(sIns[1]);
      if (sDel) deletions += parseInt(sDel[1]);

      result.insertions = insertions;
      result.deletions = deletions;
    } catch {
      result.insertions = 0;
      result.deletions = 0;
    }
  } else {
    result.insertions = 0;
    result.deletions = 0;
  }

  return result;
}

export async function gitDiff(workspaceId: string, filePath?: string): Promise<GitDiffResult[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const diffs: GitDiffResult[] = [];
  const status = await git.status();
  const conflicted = new Set(status.conflicted);

  if (filePath) {
    diffs.push(await buildWorkingDiff(git, ws.boundDirs[0], filePath, conflicted.has(filePath)));
  } else {
    const raw = await git.diff(['--name-only']);
    const cachedRaw = await git.diff(['--cached', '--name-only']);
    const files = Array.from(new Set([
      ...raw.split('\n').filter(Boolean),
      ...cachedRaw.split('\n').filter(Boolean),
      ...status.not_added,
      ...status.conflicted,
    ]));

    for (const f of files) {
      diffs.push(await buildWorkingDiff(git, ws.boundDirs[0], f, conflicted.has(f)));
    }
  }

  return diffs;
}

export async function gitStage(workspaceId: string, filePath: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.add(filePath);
}

export async function gitUnstage(workspaceId: string, filePath: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.raw(['restore', '--staged', '--', filePath]).catch(async () => {
    await git.raw(['reset', 'HEAD', '--', filePath]);
  });
}

export async function gitResolveFile(workspaceId: string, filePath: string, content: string, stage = true): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await writeFile(join(ws.boundDirs[0], filePath), content, 'utf-8');
  if (stage) await git.add(filePath);
}

export async function gitLog(workspaceId: string, maxCount = 50): Promise<GitLogEntry[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const status = await git.status();
  const upstream = await getUpstreamRef(git, status.current || 'HEAD');
  const refs = upstream ? ['HEAD', upstream] : ['HEAD'];
  const pretty = '%H%x1f%P%x1f%s%x1f%an%x1f%aI%x1f%D%x1e';
  const logArgs = ['log', `--max-count=${maxCount}`, `--pretty=format:${pretty}`];
  const raw = await git.raw([...logArgs, ...refs]).catch((err: unknown) => {
    if (!upstream) throw err;
    return git.raw([...logArgs, 'HEAD']);
  });

  return raw.split('\x1e')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [hash = '', parentHashes = '', message = '', author = '', date = '', refsRaw = ''] = record.split('\x1f');
      const parents = parentHashes ? parentHashes.split(' ').map(p => p.substring(0, 7)) : [];
      const refs = refsRaw ? refsRaw.split(', ').map(r => r.trim()).filter(Boolean) : [];
      return {
        hash: hash.substring(0, 7),
        parents,
        message,
        author,
        date,
        refs,
      };
    });
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
  const status = await git.status();
  const isUntracked = status.not_added.includes(filePath);

  if (isUntracked) {
    await git.clean('f', ['-d', '--', filePath]);
  } else {
    await git.checkout(['--', filePath]);
  }
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

  await git.push('origin', branch, ['--set-upstream']);
}

export async function gitFetch(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  await git.fetch('origin');
}

export async function gitPull(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const status = await git.status();
  const branch = status.current || 'HEAD';
  const upstream = await getUpstreamRef(git, branch);

  if (upstream?.startsWith('origin/')) {
    await git.pull('origin', upstream.slice('origin/'.length));
    return;
  }

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

export async function gitCheckoutDetached(workspaceId: string, commitHash: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  await git.checkout([commitHash]);
}

export async function gitCherryPick(workspaceId: string, commitHash: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  await git.raw(['cherry-pick', commitHash]);
}

export async function gitCreateBranch(workspaceId: string, name: string, startPoint?: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  const args = startPoint ? [name, startPoint] : [name];
  await git.branch(args);
}

export async function gitDeleteBranch(workspaceId: string, name: string, force = false): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  await git.branch([force ? '-D' : '-d', name]);
}

export async function gitCreateTag(workspaceId: string, name: string, commitHash?: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  const args = [name];
  if (commitHash) args.push(commitHash);
  await git.addTag(args.join(' '));
}

export async function gitCommitDiff(workspaceId: string, commitHash: string): Promise<GitDiffResult[]> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);

  const diff = await git.diff([`${commitHash}^`, commitHash]);
  const nameOnlyRaw = await git.diff(['--name-only', `${commitHash}^`, commitHash]);
  const files = nameOnlyRaw.split('\n').filter(Boolean);

  const diffs: GitDiffResult[] = [];
  for (const f of files) {
    const binary = isBinaryPath(f);
    const oldContent = binary ? '' : await git.show([`${commitHash}^:${f}`]).catch(() => '');
    const newContent = binary ? '' : await git.show([`${commitHash}:${f}`]).catch(() => '');
    diffs.push({ path: f, oldContent, newContent, isBinary: binary, isNew: !oldContent, isDeleted: !newContent });
  }
  return diffs;
}

export async function gitGetRemoteUrl(workspaceId: string): Promise<string | null> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  const remotes = await git.getRemotes(true);
  return remotes.find(r => r.name === 'origin')?.refs?.push ?? null;
}

export async function gitMergeBase(workspaceId: string): Promise<string> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  const result = await git.raw(['merge-base', 'HEAD', 'origin/HEAD']).catch(() => '');
  return result.trim();
}

export interface GitConfig {
  name: string;
  email: string;
  proxy: string;
}

export async function gitReset(workspaceId: string, commitHash: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  const git = getGit(ws);
  await git.reset([`--${mode}`, commitHash]);
}

export async function gitGetConfig(scope: 'global' | 'local', workspaceId?: string): Promise<GitConfig> {
  const scopeFlag = scope === 'global' ? '--global' : '--local';
  const git = workspaceId ? getGit(getWorkspace(workspaceId)!) : simpleGit();

  const get = (key: string) => git.raw(['config', scopeFlag, '--get', key]).then(v => v.trim()).catch(() => '');

  const [name, email, proxy] = await Promise.all([
    get('user.name'),
    get('user.email'),
    get('http.proxy'),
  ]);

  return { name, email, proxy };
}

export async function gitSetConfig(scope: 'global' | 'local', config: Partial<GitConfig>, workspaceId?: string): Promise<void> {
  const scopeFlag = scope === 'global' ? '--global' : '--local';
  const git = workspaceId ? getGit(getWorkspace(workspaceId)!) : simpleGit();

  const set = (key: string, value: string) => {
    if (value) return git.raw(['config', scopeFlag, key, value]);
    return git.raw(['config', scopeFlag, '--unset', key]).catch(() => {});
  };

  await Promise.all([
    config.name !== undefined ? set('user.name', config.name) : Promise.resolve(),
    config.email !== undefined ? set('user.email', config.email) : Promise.resolve(),
    config.proxy !== undefined ? set('http.proxy', config.proxy) : Promise.resolve(),
    config.proxy !== undefined ? set('https.proxy', config.proxy) : Promise.resolve(),
  ]);
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
  git.outputHandler((_binary, _stdout, stderr) => {
    stderr.on('data', (chunk: Buffer) => {
      const parsed = parseCloneProgress(chunk.toString());
      if (parsed) onProgress(parsed);
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
