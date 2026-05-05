import * as agentService from '../services/agent.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentConfig } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import { simpleGit } from 'simple-git';

const DEFAULT_SYSTEM_PROMPT =
  [
    'You are a git commit message generator.',
    'Return exactly one concise commit message for the provided git diff.',
    'Use conventional format: type: description.',
    'Allowed types: feat, fix, docs, style, refactor, perf, test, chore.',
    'Keep the subject under 72 characters.',
    'If a body is needed, add one blank line and at most 3 short bullet lines.',
    'Do not greet, explain, ask questions, provide options, use markdown, or wrap in code fences.',
    'Output only the final commit message text.',
  ].join(' ');

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
    [
      'Generate exactly one commit message for these changes.',
      'Do not inspect files or run commands. Use only this diff.',
      'Output only the commit message.',
      '',
      truncatedDiff,
    ].join('\n'),
    workingDir,
    {
      maxTurns: 1,
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
  const msg = sanitizeCommitMessage(result.output.join('\n'));
  if (!msg) throw new Error('Empty response from commit agent');
  return msg;
}

function sanitizeCommitMessage(output: string): string {
  const cleanedOutput = output
    .split('\n')
    .filter((line) => !isRuntimeNoise(line))
    .join('\n')
    .trim();
  const text = stripCodeFences(cleanedOutput).trim();
  if (!text) return '';

  const optionMessage = extractOptionMessage(cleanedOutput);
  if (optionMessage) return optionMessage;

  const conventional = extractConventionalMessage(text);
  if (conventional) return conventional;

  const fallback = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !isMarkdownHeading(line) && !isExplanatoryLine(line));
  return fallback ? normalizeCandidate(fallback) : '';
}

function stripCodeFences(text: string): string {
  return text
    .replace(/```(?:\w+)?\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1');
}

function extractOptionMessage(text: string): string {
  const codeBlock = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  if (codeBlock?.[1]) {
    const message = extractConventionalMessage(codeBlock[1]) || firstMeaningfulLine(codeBlock[1]);
    if (message) return message;
  }

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\boption\s*\d+\b/i.test(lines[i])) continue;
    const following = lines.slice(i + 1, i + 8).join('\n');
    const message = extractConventionalMessage(following) || firstMeaningfulLine(following);
    if (message) return message;
  }

  return '';
}

function extractConventionalMessage(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => isConventionalSubject(line.trim()));
  if (start < 0) return '';

  const message: string[] = [normalizeSubject(lines[start])];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (message.length === 1) message.push('');
      continue;
    }
    if (message.length === 1) break;
    if (!trimmed.startsWith('- ')) break;
    message.push(trimmed);
    if (message.filter((item) => item.startsWith('- ')).length >= 3) break;
  }

  return message.join('\n').trim();
}

function firstMeaningfulLine(text: string): string {
  const line = text
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !isMarkdownHeading(item) && !isExplanatoryLine(item));
  return line ? normalizeCandidate(line) : '';
}

function isRuntimeNoise(line: string): boolean {
  const trimmed = line.trim();
  return /^\[Usage\]/.test(trimmed)
    || /^Claude Code initialized\b/i.test(trimmed)
    || /^Codex initialized\b/i.test(trimmed)
    || /^Tool:/i.test(trimmed)
    || /^Todo:/i.test(trimmed);
}

function isConventionalSubject(line: string): boolean {
  return /^(feat|fix|docs|style|refactor|perf|test|chore)(\([^)]+\))?: .{1,72}$/i.test(line);
}

function isMarkdownHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line) || /^\*\*[^*]+:\*\*$/.test(line);
}

function isExplanatoryLine(line: string): boolean {
  return /^(i'll|i will|let me|based on|here are|which style|i recommend|option\s*\d+|a complete|this commit)/i.test(
    line.trim().replace(/^\*\*|\*\*$/g, ''),
  );
}

function normalizeSubject(line: string): string {
  return line
    .trim()
    .replace(/^\s*[-*]\s+/, '')
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^["']|["']$/g, '')
    .slice(0, 72);
}

function normalizeCandidate(line: string): string {
  const subject = normalizeSubject(line);
  if (isConventionalSubject(subject)) return subject;

  const type = inferType(subject);
  const description = subject
    .replace(/^(add|adds|added|implement|implements|implemented|create|creates|created)\b/i, '')
    .replace(/^(fix|fixes|fixed|resolve|resolves|resolved)\b/i, '')
    .replace(/^(document|documents|documented)\b/i, '')
    .replace(/^(refactor|refactors|refactored)\b/i, '')
    .replace(/^(test|tests|tested)\b/i, '')
    .trim()
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
  return `${type}: ${description || subject.replace(/^[A-Z]/, (char) => char.toLowerCase())}`.slice(0, 72);
}

function inferType(subject: string): string {
  if (/^(add|adds|added|implement|implements|implemented|create|creates|created)\b/i.test(subject)) return 'feat';
  if (/^(fix|fixes|fixed|resolve|resolves|resolved)\b/i.test(subject)) return 'fix';
  if (/^(document|documents|documented)\b/i.test(subject)) return 'docs';
  if (/^(refactor|refactors|refactored)\b/i.test(subject)) return 'refactor';
  if (/^(test|tests|tested)\b/i.test(subject)) return 'test';
  return 'chore';
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
