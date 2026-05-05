import * as agentService from '../services/agent.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentConfig } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { simpleGit } from 'simple-git';

const DEFAULT_SYSTEM_PROMPT =
  'You are a git commit message generator. Based on the provided diff, generate a concise commit message following conventional commits format (type: description). Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci. Keep the first line under 72 chars. If there are multiple changes, use a subject line + blank line + bullet body. Output ONLY the commit message text, nothing else.';

export async function runCommitAgent(workspaceId: string): Promise<string> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');

  const diff = await collectDiff(ws);
  if (!diff.trim()) throw new Error('No changes found');

  const commitAgent = findCommitAgent(workspaceId);
  if (!commitAgent) throw new Error('No commit agent configured. Add a commit-type agent preset.');

  const runtime = createAgentRuntime({
    kind: commitAgent.runtimeKind,
    provider: commitAgent.modelProvider,
    model: commitAgent.modelId,
    apiKey: commitAgent.apiKey,
    baseURL: commitAgent.apiBase,
  });

  const workingDir = agentService.resolveWorkingDir(workspaceId, commitAgent);
  const systemPrompt = commitAgent.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const result = await runtime.execute(
    `${systemPrompt}\n\nGenerate a commit message for these changes:\n\n${diff.substring(0, 8000)}`,
    workingDir,
    {
      maxTurns: 1,
      mcpServers: agentService.getMcpServers(commitAgent.mcps),
      configDir: agentService.getAgentConfigDir(workspaceId, commitAgent),
      skills: agentService.getAvailableSkillNames(
        agentService.getAgentConfigDir(workspaceId, commitAgent),
        commitAgent.skills,
      ),
      sandboxDirs: commitAgent.sandboxDirs,
    },
  );

  if (!result.success) {
    throw new Error(result.error || 'Commit agent failed');
  }

  const msg = result.summary?.trim() || result.output.join('\n').trim();
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
