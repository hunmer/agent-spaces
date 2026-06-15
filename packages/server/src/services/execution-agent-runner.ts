import type { WorkflowNode, ExecutionLogEntry } from '@agent-spaces/shared';
import type { AgentRuntimeConfig } from '../adapters/agent-runtime-types.js';
import { getThinkingRuntimeConfig } from './llm-model-config.js';
import * as workspaceService from './workspace.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';
import type { ExecutionSession } from './execution-types.js';

type AppendLog = (level: ExecutionLogEntry['level'], message: string) => void;

export async function executeAgentRun(
  session: ExecutionSession,
  node: WorkflowNode,
  resolvedData: Record<string, any>,
  appendLog: AppendLog,
): Promise<any> {
  const prompt = typeof resolvedData.prompt === 'string' ? resolvedData.prompt : '';
  if (!prompt.trim()) throw new Error('agent_run node missing prompt');

  appendLog('info', 'Executing agent_run node');
  return executeAgentWithRuntime(session, node, resolvedData, appendLog);
}

async function executeAgentWithRuntime(
  session: ExecutionSession,
  _node: WorkflowNode,
  resolvedData: Record<string, any>,
  appendLog: AppendLog,
): Promise<any> {
  const { createAgentRuntime } = await import('../adapters/agent-runtime.js');
  const agentService = await import('./agent.js');

  const workspaceId = resolveWorkflowAgentWorkspaceId();
  const workspace = workspaceService.getById(workspaceId);
  const agentConfigId = resolveAgentConfigId(resolvedData);
  const presets = agentService.listPresets(workspaceId).filter(p => p.enabled !== false);
  const preset = agentConfigId
    ? presets.find(p => p.id === agentConfigId)
    : presets[0];
  if (!preset) {
    throw new Error(agentConfigId ? `Agent preset not found: ${agentConfigId}` : 'No enabled agent preset available');
  }

  appendLog('info', `Using agent: ${preset.name || preset.id}`);

  const permissionMode = normalizeAgentPermissionMode(resolvedData.permissionMode);
  const runtime = createAgentRuntime({
    kind: preset.runtimeKind as any,
    provider: preset.modelProvider as any,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
    adapterBaseURL: preset.apiBase,
    permissionMode,
    ...getThinkingRuntimeConfig(preset),
  });

  const prompt = String(resolvedData.prompt || '');
  const systemPrompt = typeof resolvedData.systemPrompt === 'string' ? resolvedData.systemPrompt : undefined;
  const extraInstructions = typeof resolvedData.extraInstructions === 'string' ? resolvedData.extraInstructions.trim() : '';
  const ruleLoadingInstructions = [
    resolvedData.loadProjectClaudeMd === false ? '不要主动加载项目 CLAUDE.md/AGENTS.md 规则文件。' : '',
    resolvedData.loadRuleMd === false ? '不要主动加载 .claude/rules 或同类规则目录。' : '',
  ].filter(Boolean).join('\n');
  const workflowContext = [
    `当前工作流: ${session.workflow.name}${session.workflow.id ? ` (${session.workflow.id})` : ''}`,
    typeof session.workflow.description === 'string' && session.workflow.description.trim()
      ? `工作流描述:\n${session.workflow.description.trim()}`
      : '',
  ].filter(Boolean).join('\n\n');
  const fullPrompt = [systemPrompt, extraInstructions, ruleLoadingInstructions, workflowContext, prompt]
    .map(part => typeof part === 'string' ? part.trim() : '')
    .filter(Boolean)
    .join('\n\n');
  const workingDir = typeof resolvedData.cwd === 'string' && resolvedData.cwd.trim()
    ? resolvedData.cwd.trim()
    : agentService.resolveWorkingDir(workspaceId, preset);
  const configDir = agentService.getAgentConfigDir(workspaceId, preset);
  const sandboxDirs = uniqueStrings([
    ...normalizeStringList(preset.sandboxDirs),
    ...normalizeStringList(resolvedData.additionalDirectories),
  ]);
  const mcpServers = agentService.getMcpServers(preset.mcps);
  const skills = agentService.getAvailableSkillNames(configDir, preset.skills);

  appendLog('info', `Runtime: ${preset.runtimeKind || 'open-agent-sdk'}; permissionMode=${permissionMode}; cwd=${workingDir}`);
  if (sandboxDirs.length) appendLog('info', `Additional directories: ${sandboxDirs.join(', ')}`);

  const result = await runtime.execute(
    buildAgentPrompt(workspaceId, preset.systemPrompt, fullPrompt, [], {
      runtimeKind: preset.runtimeKind,
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      boundDirs: workspace?.boundDirs ?? [],
      workingDir,
      excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
    }),
    workingDir,
    {
      maxTurns: 100,
      mcpServers,
      skills,
      configDir,
      sandboxDirs,
      systemPrompt: preset.systemPrompt,
      outputStyle: preset.outputStyle,
      userPrompt: prompt,
      onEvent: (event) => {
        if (event.type === 'output') {
          appendLog('info', event.line);
        } else if (event.type === 'tool_use') {
          appendLog('info', `Tool: ${event.name}`);
        }
      },
    },
  );

  if (!result.success) {
    throw new Error(result.summary || 'Agent execution failed');
  }

  appendLog('info', `Agent completed: ${result.summary || 'done'}`);
  const message = result.output?.join('\n').trim() || result.summary;
  return {
    result: message,
    usage: result.usage,
    runtime: {
      cwd: workingDir,
      additionalDirectories: sandboxDirs,
      permissionMode,
      extraInstructions,
      loadProjectClaudeMd: resolvedData.loadProjectClaudeMd !== false,
      loadRuleMd: resolvedData.loadRuleMd !== false,
      enabledPlugins: session.workflow.enabledPlugins,
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      workspaceId,
      agentConfigId: preset.id,
    },
  };
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function normalizeAgentPermissionMode(value: unknown): AgentRuntimeConfig['permissionMode'] {
  switch (value) {
    case 'default':
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
    case 'dontAsk':
    case 'auto':
      return value;
    default:
      return 'dontAsk';
  }
}

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
}

function resolveWorkflowAgentWorkspaceId(): string {
  return workspaceService.getAll()[0]?.id ?? 'default';
}

function resolveAgentConfigId(resolvedData: Record<string, any>): string {
  if (typeof resolvedData.agentConfigId === 'string' && resolvedData.agentConfigId.trim()) {
    return resolvedData.agentConfigId.trim();
  }
  const agent = resolvedData.agent;
  if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
    const id = (agent as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return '';
}
