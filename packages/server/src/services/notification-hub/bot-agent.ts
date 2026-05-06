import type { AgentConfig } from '@agent-spaces/shared';
import * as workspaceService from '../workspace.js';
import * as agentService from '../agent.js';
import { createAgentRuntime } from '../../adapters/agent-runtime.js';
import { getThinkingRuntimeConfig } from '../llm-model-config.js';
import type { AgentContext } from '../../agents/agent-context.js';
import { hasActiveIssueAutomation, runIssueAutomation } from '../../agents/issue-agent-runner.js';
import { publishWorkspaceEvent } from './events.js';

export function getConfiguredBotAgent(workspaceId: string): AgentConfig | null {
  const workspace = workspaceService.getById(workspaceId);
  const botAgentId = workspace?.notificationSettings?.botAgentId;
  if (!botAgentId) return null;
  return (agentService.listPresets(workspaceId) ?? [])
    .find((agent) => agent.id === botAgentId && agent.role === 'bot' && agent.enabled !== false) ?? null;
}

export async function runBotAgent(workspaceId: string, preset: AgentConfig, message: string): Promise<string> {
  const session = agentService.getOrCreateSessionForConfig(workspaceId, preset);
  agentService.updateStatus(workspaceId, session.id, 'active');
  const startedAt = Date.now();
  const runtime = createAgentRuntime({
    kind: preset.runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: preset.apiBase,
    ...getThinkingRuntimeConfig(preset),
  });
  const workingDir = agentService.resolveWorkingDir(workspaceId, preset);

  try {
    const result = await runtime.execute(
      buildBotPrompt(message),
      workingDir,
      {
        maxTurns: 20,
        mcpServers: agentService.getMcpServers(preset.mcps),
        skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir(workspaceId, preset), preset.skills),
        configDir: agentService.getAgentConfigDir(workspaceId, preset),
        sandboxDirs: preset.sandboxDirs,
        systemPrompt: preset.systemPrompt,
      },
    );
    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error || result.summary, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: result.output,
      durationMs: Date.now() - startedAt,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    return formatBotFinalMessage(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    agentService.updateStatus(workspaceId, session.id, 'crashed', { error });
    return `处理失败：${error}`;
  }
}

export function startIssueAutomation(workspaceId: string, issueId: string): void {
  runIssueAutomation(workspaceId, issueId, createBotAgentContext(workspaceId)).catch((err) => {
    console.error(`[bot-command] issue automation error workspaceId=${workspaceId} issueId=${issueId}:`, err);
  });
}

export function createBotAgentContext(workspaceId: string): AgentContext {
  return {
    workspaceId,
    broadcast: (event, data) => publishWorkspaceEvent(workspaceId, event, data),
    getSession: (sessionId) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId, status, extra) => agentService.updateStatus(workspaceId, sessionId, status, extra),
  };
}

function buildBotPrompt(message: string): string {
  return [
    'User message from external chat platform:',
    message,
    '',
    'Reply to the user directly. Output only the final reply.',
  ].join('\n');
}

function formatBotFinalMessage(result: { success: boolean; summary: string; output: string[]; error?: string }): string {
  if (!result.success) return result.error || result.summary || '处理失败';
  const finalOutput = result.output
    .map((line) => line.trim())
    .filter((line) => line && !isUsageLine(line))
    .at(-1);
  return finalOutput || result.summary || '处理完成';
}

function isUsageLine(line: string): boolean {
  return /^\[usage\]\s+tokens=/i.test(line);
}
