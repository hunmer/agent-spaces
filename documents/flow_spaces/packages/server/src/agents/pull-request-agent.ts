import type { AgentConfig, WorktreeInfo } from '@agent-spaces/shared';
import * as agentService from '../services/agent.js';
import { AGENT_GENERATOR_PRESET_ID } from '../services/agent.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import { getWorkspace } from '../storage/workspace-store.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { prependPersistentAgentContext } from '../services/persistent-agent-context.js';

const DEFAULT_SYSTEM_PROMPT = [
  'You are a pull request description generator.',
  'Return a concise, useful PR body based only on the provided commits and diff.',
  'Use Markdown with these sections: Summary and Changes.',
  'Keep it short. Do not greet, explain your process, ask questions, provide options, or wrap the response in code fences.',
  'Output only the final PR body text.',
].join(' ');

interface PullRequestAgentInput {
  worktree: WorktreeInfo;
  baseBranch: string;
  commits: string[];
  diff: string;
}

export async function runPullRequestAgent(
  workspaceId: string,
  input: PullRequestAgentInput,
): Promise<string> {
  const ws = getWorkspace(workspaceId);
  if (!ws) throw new Error('Workspace not found');
  if (!input.diff.trim() && input.commits.length === 0) throw new Error('No changes found');

  const agent = findPullRequestAgent(workspaceId);
  const session = agentService.getOrCreateSessionForConfig(workspaceId, agent);
  agentService.updateStatus(workspaceId, session.id, 'active');

  const runtime = createAgentRuntime({
    kind: agent.runtimeKind,
    provider: agent.modelProvider,
    model: agent.modelId,
    apiKey: agent.apiKey,
    baseURL: agent.apiBase,
    maxTokens: agent.maxTokens,
    ...getThinkingRuntimeConfig(agent),
  });

  const workingDir = agentService.resolveWorkingDir(workspaceId, agent);
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;
  const truncatedDiff = input.diff.length > 12000
    ? `${input.diff.substring(0, 12000)}\n... (truncated)`
    : input.diff;
  const userPrompt = [
    `Generate a pull request body for branch ${input.worktree.branch} targeting ${input.baseBranch}.`,
    '',
    'Commits:',
    input.commits.length > 0 ? input.commits.map((commit) => `- ${commit}`).join('\n') : '- No commit messages available',
    '',
    'Diff:',
    truncatedDiff,
  ].join('\n');

  const result = await runtime.execute(
    prependPersistentAgentContext(userPrompt, {
      workspaceId,
      workingDir,
      boundDirs: ws.boundDirs,
      includeWorkspacePrompt: false,
      excludeNativeClaudeMd: agent.runtimeKind === 'claude-code',
    }),
    workingDir,
    {
      maxTurns: 1,
      userPrompt,
      systemPrompt,
      outputStyle: agent.outputStyle,
    },
  );

  agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
    runtime: agent.runtimeKind,
    model: agent.modelId,
    summary: result.summary,
    output: result.output,
    usage: result.usage,
    costUsd: result.costUsd,
  });

  if (!result.success) {
    throw new Error(result.error || 'Pull request agent failed');
  }

  const body = sanitizePullRequestBody(result.output);
  if (!body) throw new Error('Empty response from pull request agent');
  return body;
}

function findPullRequestAgent(workspaceId: string): AgentConfig {
  const presets = agentService.listPresets(workspaceId);
  const preset = presets?.find((a) => a.id === AGENT_GENERATOR_PRESET_ID);
  if (preset) return preset;
  const template = agentService.readAgentTemplate(AGENT_GENERATOR_PRESET_ID);
  if (template) return template;
  return agentService.listTemplates().find((a) => a.id === AGENT_GENERATOR_PRESET_ID) ?? agentService.listTemplates()[0];
}

function sanitizePullRequestBody(output: string[] | string): string {
  const chunks = (Array.isArray(output) ? output : [output])
    .map((chunk) => cleanOutputChunk(chunk))
    .filter(Boolean);
  const uniqueChunks = dedupeAdjacentChunks(chunks);
  return (uniqueChunks.at(-1) || uniqueChunks.join('\n\n')).trim();
}

function cleanOutputChunk(chunk: string): string {
  return chunk
    .split('\n')
    .filter((line) => !isRuntimeNoise(line))
    .join('\n')
    .replace(/```(?:\w+)?\n([\s\S]*?)```/g, '$1')
    .trim();
}

function dedupeAdjacentChunks(chunks: string[]): string[] {
  const result: string[] = [];
  for (const chunk of chunks) {
    if (result.at(-1)?.trim() === chunk.trim()) continue;
    result.push(chunk);
  }
  return result;
}

function isRuntimeNoise(line: string): boolean {
  const trimmed = line.trim();
  return /^\[Usage\]/.test(trimmed)
    || /^Claude Code initialized\b/i.test(trimmed)
    || /^Codex initialized\b/i.test(trimmed)
    || /^Tool:/i.test(trimmed)
    || /^Todo:/i.test(trimmed);
}
