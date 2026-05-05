import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';
import type { GitStatusResult, GitFileStatus, GitLogEntry, GitDiffResult } from '@agent-spaces/shared';
import type { Workspace } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { listModels, listProviders } from '../storage/llm-store.js';
import { listPresets } from '../services/agent.js';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const gitInstances = new Map<string, SimpleGit>();

function getGit(workspace: Workspace): SimpleGit {
  const existing = gitInstances.get(workspace.id);
  if (existing) return existing;

  const git = simpleGit(workspace.boundDirs[0]);
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
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const git = getGit(ws);
  const parts: string[] = [];

  const unstagedDiff = await git.diff().catch(() => '');
  if (unstagedDiff) parts.push(unstagedDiff);

  const stagedDiff = await git.diff(['--cached']).catch(() => '');
  if (stagedDiff) parts.push(stagedDiff);

  const status = await git.status();
  if (status.not_added.length > 0) {
    parts.push(`New files:\n${status.not_added.map(f => `  ${f}`).join('\n')}`);
  }

  const diff = parts.join('\n\n');
  if (!diff.trim()) throw new Error('No changes found');

  // Find commit-type agent preset
  const commitAgent = (listPresets(workspaceId) ?? []).find(
    (a) => a.role === 'commit' && a.enabled !== false,
  );

  let apiBase: string;
  let apiKey: string;
  let modelId: string;
  let systemPrompt: string;
  let maxTokens: number;
  let temperature: number;

  if (commitAgent && commitAgent.apiBase && commitAgent.apiKey && commitAgent.modelId) {
    apiBase = commitAgent.apiBase.replace(/\/$/, '');
    apiKey = commitAgent.apiKey;
    modelId = commitAgent.modelId;
    systemPrompt = commitAgent.systemPrompt || 'Generate a concise git commit message. Output ONLY the commit message.';
    maxTokens = commitAgent.maxTokens ?? 200;
    temperature = commitAgent.temperature ?? 0.3;
  } else {
    // Fallback to first LLM provider/model
    const models = listModels();
    const providers = listProviders();
    if (models.length === 0 || providers.length === 0) {
      throw new Error('No commit agent or LLM configured. Add a commit-type agent or configure an LLM provider.');
    }
    const model = models[0];
    const provider = providers.find(p => p.name === model.provider) || providers[0];
    if (!provider.apiBase || !provider.apiKey) {
      throw new Error('LLM provider missing apiBase or apiKey');
    }
    apiBase = provider.apiBase.replace(/\/$/, '');
    apiKey = provider.apiKey;
    modelId = model.modelId;
    systemPrompt = 'Generate a concise git commit message following conventional commits format (type: description). Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci. Keep first line under 72 chars. If multiple changes, use subject + blank line + bullet body. Output ONLY the commit message, nothing else.';
    maxTokens = 200;
    temperature = 0.3;
  }

  const url = `${apiBase}/chat/completions`;
  const truncatedDiff = diff.length > 6000 ? diff.substring(0, 6000) + '\n... (truncated)' : diff;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a commit message for these changes:\n\n${truncatedDiff}` },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LLM API error (${response.status}): ${text}`);
  }

  const data = await response.json() as any;

  // OpenAI format: { choices: [{ message: { content } }] }
  let msg = data.choices?.[0]?.message?.content?.trim();

  // Anthropic format: { content: [{ type: 'text', text }] }
  if (!msg && Array.isArray(data.content)) {
    msg = data.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
      .trim();
  }

  // Google Gemini format: { candidates: [{ content: { parts: [{ text }] } }] }
  if (!msg && data.candidates?.[0]?.content?.parts) {
    msg = data.candidates[0].content.parts
      .map((p: any) => p.text)
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (!msg) {
    const preview = JSON.stringify(data).substring(0, 200);
    throw new Error(`Empty response from LLM. Response: ${preview}`);
  }
  return msg;
}

export async function gitInit(workspaceId: string): Promise<void> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const rootDir = ws.boundDirs[0];
  const git = simpleGit(rootDir);
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

  // 清除缓存的实例，强制下次使用新实例
  gitInstances.delete(workspaceId);
}
