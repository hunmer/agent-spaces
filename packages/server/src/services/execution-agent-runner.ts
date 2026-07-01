import type { WorkflowNode, ExecutionLogEntry, AgentSession } from '@agent-spaces/shared';
import type { AgentRuntimeConfig } from '../adapters/agent-runtime-types.js';
import { listProviders } from '../storage/llm-store.js';
import { getThinkingRuntimeConfig } from './llm-model-config.js';
import * as workspaceService from './workspace.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';
import type { ExecutionSession } from './execution-types.js';
import { listAvailableAgentCapabilities } from './agent-capability-catalog.js';

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
  const presets = agentService.listPresets(workspaceId).filter(p => p.enabled !== false);
  const preset = resolveAgentPreset(resolvedData, presets);
  if (!preset) {
    const agentConfigId = resolveAgentConfigId(resolvedData);
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
  const workflowContext = [
    `当前工作流: ${session.workflow.name}${session.workflow.id ? ` (${session.workflow.id})` : ''}`,
    typeof session.workflow.description === 'string' && session.workflow.description.trim()
      ? `工作流描述:\n${session.workflow.description.trim()}`
      : '',
  ].filter(Boolean).join('\n\n');
  const fullPrompt = [workflowContext, prompt]
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
  const tools = Array.isArray(preset.tools) ? [...preset.tools] : undefined;
  const builtInTools = listAvailableAgentCapabilities().tools.map((tool) => ({ name: tool.name, description: tool.description }));

  appendLog('info', `Runtime: ${preset.runtimeKind || 'langchain'}; permissionMode=${permissionMode}; cwd=${workingDir}`);
  if (sandboxDirs.length) appendLog('info', `Additional directories: ${sandboxDirs.join(', ')}`);

  const startTime = Date.now();
  const result = await runtime.execute(
    buildAgentPrompt(workspaceId, preset.systemPrompt, fullPrompt, [], {
      runtimeKind: preset.runtimeKind,
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      boundDirs: workspace?.boundDirs ?? [],
      workingDir,
      excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
      builtInTools,
    }),
    workingDir,
    {
      maxTurns: 100,
      tools,
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

  // 创建 agent session 以便后续通过会话详情查看消息列表
  const agentSession = workspaceId
    ? agentService.create(workspaceId, (preset as { role?: AgentSession['role'] }).role ?? 'assistant', preset.id)
    : null;
  const agentSessionId = agentSession?.id;
  appendLog('info', agentSessionId ? `Agent session: ${agentSessionId}` : 'Agent session not recorded (no workspace)');

  if (!result.success) {
    if (agentSessionId) {
      agentService.complete(workspaceId, agentSessionId, result.error || result.summary, {
        runtime: preset.runtimeKind,
        model: preset.modelId,
        summary: result.summary,
        output: result.output,
        durationMs: Date.now() - startTime,
        usage: result.usage,
        costUsd: result.costUsd,
      });
      persistWorkflowAgentSessionHistory(agentService, agentSessionId, preset, prompt, result);
    }
    throw new Error(result.summary || 'Agent execution failed');
  }

  appendLog('info', `Agent completed: ${result.summary || 'done'}`);
  const message = result.output?.join('\n').trim() || result.summary;

  if (agentSessionId) {
    agentService.complete(workspaceId, agentSessionId, undefined, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: result.output,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    persistWorkflowAgentSessionHistory(agentService, agentSessionId, preset, prompt, result);
  }

  return {
    result: message,
    usage: result.usage,
    sessionId: agentSessionId,
      runtime: {
        cwd: workingDir,
        additionalDirectories: sandboxDirs,
        permissionMode,
        enabledPlugins: session.workflow.enabledPlugins,
        tools,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        workspaceId,
      agentConfigId: preset.id,
    },
  };
}

function persistWorkflowAgentSessionHistory(
  agentService: typeof import('./agent.js'),
  agentSessionId: string,
  preset: Record<string, unknown>,
  userPrompt: string,
  result: { success: boolean; summary: string; output: string[]; error?: string; usage?: unknown; costUsd?: number },
): void {
  const now = new Date().toISOString();
  const messages = [
    { id: `${agentSessionId}-user`, role: 'user', content: userPrompt, createdAt: now, senderId: 'workflow' },
    {
      id: `${agentSessionId}-agent`,
      role: 'agent',
      content: result.output.join('\n').trim() || result.summary,
      createdAt: now,
      senderId: typeof preset.id === 'string' ? preset.id : 'agent',
      senderRole: typeof preset.role === 'string' ? preset.role : 'assistant',
    },
  ];
  const detail = agentService.getSessionDetail(agentSessionId);
  const payload = {
    session: detail?.session ?? null,
    usage: detail?.usage ?? null,
    messages,
    generatedAt: now,
  };
  agentService.writeWorkflowAgentSessionHistory(agentSessionId, payload);
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

function getAgentOverrideFields(resolvedData: Record<string, any>): Record<string, unknown> {
  const overrideKeys = [
    'name',
    'description',
    'runtimeKind',
    'modelProvider',
    'providerId',
    'modelId',
    'apiBase',
    'apiKey',
    'workingDir',
    'mcps',
    'skills',
    'tools',
    'systemPrompt',
    'outputStyle',
    'temperature',
    'maxTokens',
    'sandboxDirs',
    'avatarUrl',
    'icon',
    'enabled',
  ] as const;

  const overrides: Record<string, unknown> = {};
  for (const key of overrideKeys) {
    if (resolvedData[key] !== undefined) overrides[key] = resolvedData[key];
  }
  return overrides;
}

function findPresetByNodeConfig(resolvedData: Record<string, any>, presets: any[]): any | null {
  const modelProvider = typeof resolvedData.modelProvider === 'string' ? resolvedData.modelProvider.trim() : '';
  const providerId = typeof resolvedData.providerId === 'string' ? resolvedData.providerId.trim() : '';
  const modelId = typeof resolvedData.modelId === 'string' ? resolvedData.modelId.trim() : '';
  if (!modelProvider && !providerId && !modelId) return null;

  return presets.find((preset) => (
    (!modelProvider || preset.modelProvider === modelProvider)
    && (!providerId || preset.providerId === providerId)
    && (!modelId || preset.modelId === modelId)
  )) ?? null;
}

function resolveAgentPreset(resolvedData: Record<string, any>, presets: any[]): any | null {
  const agent = resolvedData.agent;
  if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
    const agentRecord = agent as Record<string, unknown>;
    const id = typeof agentRecord.id === 'string' ? agentRecord.id.trim() : '';
    const storedPreset = id ? presets.find(p => p.id === id) : null;
    const basePreset = storedPreset ?? findPresetByNodeConfig(agentRecord as Record<string, any>, presets) ?? presets[0];
    const merged = basePreset ? { ...basePreset, ...agentRecord } : agentRecord;
    return resolveProviderBackedAgentConfig(merged);
  }

  const localOverrides = getAgentOverrideFields(resolvedData);
  const agentConfigId = resolveAgentConfigId(resolvedData);
  const basePreset = agentConfigId
    ? presets.find(p => p.id === agentConfigId) ?? null
    : findPresetByNodeConfig(resolvedData, presets) ?? presets[0] ?? null;
  if (basePreset) return resolveProviderBackedAgentConfig({ ...basePreset, ...localOverrides });
  return Object.keys(localOverrides).length > 0 ? resolveProviderBackedAgentConfig(localOverrides) : null;
}

export function __resolveAgentPresetForTest(resolvedData: Record<string, any>, presets: any[]): any | null {
  return resolveAgentPreset(resolvedData, presets);
}

function resolveProviderBackedAgentConfig(config: Record<string, unknown>): Record<string, unknown> {
  const providerId = typeof config.providerId === 'string' ? config.providerId.trim() : '';
  if (providerId) {
    const provider = listProviders().find((entry) => entry.id === providerId);
    if (provider) {
      return {
        ...config,
        apiBase: provider.apiBase,
        apiKey: provider.apiKey,
      };
    }
  }

  const apiBase = typeof config.apiBase === 'string' ? config.apiBase.trim() : '';
  if (apiBase) {
    const provider = listProviders().find((entry) => entry.apiBase === apiBase);
    if (provider) {
      return {
        ...config,
        providerId: config.providerId ?? provider.id,
        apiBase: provider.apiBase,
        apiKey: provider.apiKey,
      };
    }
  }

  return config;
}
