import * as agentService from '../services/agent.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentConfig } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { simpleGit } from 'simple-git';

const DEFAULT_SYSTEM_PROMPT =
  'You are a git commit message generator. Generate a short conventional commit message (type: description). Types: feat, fix, docs, style, refactor, perf, test, chore. First line under 72 chars. Multiple changes: subject + blank line + bullet body. Output ONLY the commit message. No explanation, no markdown, no code fences.';

export async function runCommitAgent(workspaceId: string): Promise<string> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const diff = await collectDiff(ws);
  if (!diff.trim()) throw new Error('No changes found');

  const commitAgent = findCommitAgent(workspaceId);
  if (!commitAgent) throw new Error('No commit agent configured. Add a commit-type agent preset.');
  const session = agentService.getOrCreateSessionForConfig(workspaceId, commitAgent);
  agentService.updateStatus(workspaceId, session.id, 'active');

  const runtime = createAgentRuntime({
    kind: commitAgent.runtimeKind,
    provider: commitAgent.modelProvider,
    model: commitAgent.modelId,
    apiKey: commitAgent.apiKey,
    baseURL: commitAgent.apiBase,
  });

  const workingDir = agentService.resolveWorkingDir(workspaceId, commitAgent);
  const systemPrompt = commitAgent.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const truncatedDiff = diff.length > 8000 ? diff.substring(0, 8000) + '\n... (truncated)' : diff;

  const result = await runtime.execute(
    `Generate a commit message for these changes:\n\n${truncatedDiff}`,
    workingDir,
    {
      maxTurns: 100,
      systemPrompt,
    },
  );

  agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
    runtime: commitAgent.runtimeKind,
    model: commitAgent.modelId,
    summary: result.summary,
    output: result.output,
    usage: result.usage,
    costUsd: result.costUsd,
  });

  if (!result.success) {
    throw new Error(result.error || 'Commit agent failed');
  }

  // output has full text, summary is truncated to 160 chars — prefer output
  const msg = result.output.join('\n').trim();
  if (!msg) throw new Error('Empty response from commit agent');
  return msg;
}

function findCommitAgent(workspaceId: string): AgentConfig | null {
  const presets = agentService.listPresets(workspaceId);
  if (!presets) return null;
  return presets.find((a) => a.role === 'commit' && a.enabled !== false) ?? null;
}

async function collectDiff(ws: import('@agent-spaces/shared').Workspace): Promise<string> {
  const git = simpleGit(ws.boundDirs[0]);
  const parts: string[] = [];

  const unstagedDiff = await git.diff().catch(() => '');
  if (unstagedDiff) parts.push(unstagedDiff);

  const stagedDiff = await git.diff(['--cached']).catch(() => '');
  if (stagedDiff) parts.push(stagedDiff);

  const status = await git.status();
  if (status.not_added.length > 0) {
    parts.push(`New files:\n${status.not_added.map((f) => `  ${f}`).join('\n')}`);
  }

  return parts.join('\n\n');
}
