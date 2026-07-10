import { v4 as uuid } from 'uuid';
import type { Team, TeamMembership, TeamMessage, Workspace, BuiltInAgentToolName, MessageAgentContext, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
import { join } from 'node:path';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime, AgentRuntimeKind, AgentRuntimeConfig, AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { listProviders } from '../storage/llm-store.js';
import { handleTeamMessageDelete, handleTeamMessageSend, handleTeamMessageUpdate, resolveTeamAgentSource, type TeamServiceResult } from './team.js';
import * as agentService from './agent.js';
import * as chatService from './chat.js';
import { listPresets } from './agent.js';
import { findAgent as findChatAgent } from './chat.js';
import { getThinkingRuntimeConfig } from './llm-model-config.js';
import { prependPersistentAgentContext } from './persistent-agent-context.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { createAgentMessagePartsTracker } from '../agents/agent-message-parts.js';
import {
  createCommandFunctionTools,
  createDatabaseFunctionTools,
  createTeamFunctionTools,
  createWorkflowExecutionFunctionTools,
  createWorkspaceFileFunctionTools,
} from './builtin-tools/index.js';

const TEAM_RUNTIME_WORKSPACE_ID = '__team__';
let runtimeFactory: (config?: AgentRuntimeConfig) => AgentRuntime = createAgentRuntime;
const activeTeamRuns = new Map<string, { runtime: AgentRuntime; token: string }>();

export function setTeamRuntimeFactoryForTests(factory?: (config?: AgentRuntimeConfig) => AgentRuntime): void {
  runtimeFactory = factory ?? createAgentRuntime;
}

type TeamRuntimeStatus = 'idle' | 'running' | 'completed' | 'error';

type TeamRuntime = {
  id: string;
  teamId: string;
  actorAgentId: string;
  leaderAgentId: string;
  status: TeamRuntimeStatus;
  updatedAt: string;
};

type TeamRuntimeLeader = {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  icon?: string;
  role?: string;
  runtimeKind?: string;
  modelProvider?: string;
  providerId?: string;
  modelId?: string;
  apiBase?: string;
  systemPrompt?: string;
  backgroundUrl?: string;
  tools?: string[];
  skills?: string[];
  mcps?: Record<string, unknown>;
};

type TeamRuntimeParticipant = TeamRuntimeLeader;

type TeamRuntimeMessage = {
  id: string;
  runtimeId: string;
  teamId: string;
  messageId: string;
  deliveryId?: string;
  senderAgentId: string;
  recipientAgentId: string;
  content: string;
  parts?: MessagePart[];
  createdAt: string;
  status: 'running' | 'completed' | 'error';
};

type TeamAgentReply = {
  content: string;
  model?: string;
  usage?: MessageTokenUsage;
  agentContext: MessageAgentContext;
};

type StoredTeamRuntime = TeamRuntime & {
  lastMessageId?: string;
  startedAt?: string;
};

type Delivery = {
  id: string;
  messageId: string;
  recipientAgentId: string;
  senderAgentId: string;
  messageType: string;
  createdAt?: string;
};

type QueuedTeamHandoff = {
  targetAgentId: string;
  content: string;
  messageId: string;
};

function ok<T>(message: string, data?: T, code = 'OK'): TeamServiceResult<T> {
  return { success: true, code, message, data };
}

function fail(message: string, code: string): TeamServiceResult<never> {
  return { success: false, code, message };
}

function teamDir(): string {
  return join(getDataDir(), 'team');
}

function teamDataDir(teamId: string): string {
  return join(teamDir(), teamId);
}

function teamFilePath(teamId: string): string {
  return join(teamDataDir(teamId), 'info.json');
}

function teamMembershipsPath(teamId: string): string {
  return join(teamDataDir(teamId), 'memberships.json');
}

function teamMessagesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'messages.json');
}

function teamDeliveriesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'deliveries.json');
}

function teamRuntimesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'runtimes.json');
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function asNumber(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isFinite(input) ? input : undefined;
}

function asStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  return input as Record<string, unknown>;
}

function buildRuntimeProfile(id: string, source: Record<string, unknown>): TeamRuntimeLeader {
  return {
    id,
    name: asString(source.name) ?? id,
    description: asString(source.description),
    avatarUrl: asString(source.avatarUrl),
    icon: asString(source.icon),
    role: asString(source.role),
    runtimeKind: asString(source.runtimeKind),
    modelProvider: asString(source.modelProvider),
    providerId: asString(source.providerId),
    modelId: asString(source.modelId),
    apiBase: asString(source.apiBase),
    systemPrompt: asString(source.systemPrompt),
    backgroundUrl: asString(source.backgroundUrl),
    tools: asStringArray(source.tools),
    skills: asStringArray(source.skills),
    mcps: asRecord(source.mcps),
  };
}

function normalizeContextLength(input: unknown): number {
  const value = asNumber(input);
  if (value === undefined) return 20;
  return Math.max(0, Math.min(20, Math.floor(value)));
}

export function resolveCustomAgentProvider(agent: Record<string, unknown>) {
  const providers = listProviders();
  const providerId = asString(agent.providerId);
  if (providerId) {
    const byId = providers.find((provider) => provider.id === providerId);
    if (byId) return byId;
  }

  const apiBase = asString(agent.apiBase) ?? asString(agent.baseURL);
  const apiKey = asString(agent.apiKey);
  if (!apiBase && !apiKey) return undefined;
  return providers.find((provider) =>
    (!apiBase || provider.apiBase === apiBase)
    && (!apiKey || provider.apiKey === apiKey),
  );
}

function listMemberships(teamId: string): TeamMembership[] {
  return readJsonFile<TeamMembership[]>(teamMembershipsPath(teamId)) ?? [];
}

function listMessages(teamId: string): TeamMessage[] {
  return readJsonFile<TeamMessage[]>(teamMessagesPath(teamId)) ?? [];
}

function updateTeamMessage(teamId: string, messageId: string, patch: Partial<TeamMessage>): TeamMessage | null {
  const messages = listMessages(teamId);
  const current = messages.find((message) => message.id === messageId);
  if (!current) return null;
  const updated = { ...current, ...patch };
  writeJsonFile(teamMessagesPath(teamId), messages.map((message) => message.id === messageId ? updated : message));
  return updated;
}

function listDeliveries(teamId: string): Delivery[] {
  return readJsonFile<Delivery[]>(teamDeliveriesPath(teamId)) ?? [];
}

function listRuntimes(teamId: string): StoredTeamRuntime[] {
  return readJsonFile<StoredTeamRuntime[]>(teamRuntimesPath(teamId)) ?? [];
}

function saveRuntimes(teamId: string, items: StoredTeamRuntime[]): void {
  writeJsonFile(teamRuntimesPath(teamId), items);
}

function loadTeam(teamId: string): Team | null {
  return readJsonFile<Team>(teamFilePath(teamId));
}

function isActiveMember(membership: TeamMembership | undefined): membership is TeamMembership {
  return membership?.status === 'active';
}

function resolveLeader(teamId: string, actorAgentId: string): string | null {
  const memberships = listMemberships(teamId).filter((item) => item.status === 'active');
  return memberships.find((item) => item.role === 'owner' && item.agentId !== actorAgentId)?.agentId
    ?? memberships.find((item) => item.role === 'admin' && item.agentId !== actorAgentId)?.agentId
    ?? memberships.find((item) => item.agentId !== actorAgentId)?.agentId
    ?? null;
}

function ensureRuntime(teamId: string, actorAgentId: string, leaderAgentId: string): StoredTeamRuntime {
  const runtimes = listRuntimes(teamId);
  const existing = runtimes.find((item) => item.actorAgentId === actorAgentId && item.leaderAgentId === leaderAgentId);
  if (existing) return existing;
  const created: StoredTeamRuntime = {
    id: uuid(),
    teamId,
    actorAgentId,
    leaderAgentId,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  };
  saveRuntimes(teamId, [...runtimes, created]);
  return created;
}

function findLatestRuntime(teamId: string, actorAgentId: string): StoredTeamRuntime | null {
  return listRuntimes(teamId)
    .filter((item) => item.actorAgentId === actorAgentId)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] ?? null;
}

function resolveLeaderProfile(leaderAgentId: string): TeamRuntimeLeader {
  const source = resolveTeamAgentSource(leaderAgentId);
  if (source?.agentStore === 'agent') {
    const preset = listPresets('').find((item) => item.id === leaderAgentId);
    if (!preset) return { id: leaderAgentId, name: leaderAgentId };
    return buildRuntimeProfile(preset.id, preset as unknown as Record<string, unknown>);
  }
  if (source?.agentStore === 'chat') {
    const chatAgent = findChatAgent(leaderAgentId);
    if (!chatAgent) return { id: leaderAgentId, name: leaderAgentId };
    return buildRuntimeProfile(chatAgent.id, chatAgent as unknown as Record<string, unknown>);
  }
  if (source?.agentStore === 'custom' && source.agent) {
    return buildRuntimeProfile(leaderAgentId, source.agent as Record<string, unknown>);
  }
  return {
    id: leaderAgentId,
    name: leaderAgentId,
  };
}

function resolveParticipantProfile(membership: TeamMembership): TeamRuntimeParticipant {
  const customAgent = (membership as TeamMembership & { agent?: Record<string, unknown> }).agent;
  const profile = customAgent && typeof customAgent === 'object'
    ? buildRuntimeProfile(membership.agentId, customAgent)
    : resolveLeaderProfile(membership.agentId);
  return { ...profile, role: membership.role };
}

function listParticipants(teamId: string, actorAgentId: string): TeamRuntimeParticipant[] {
  return listMemberships(teamId)
    .filter((item) => item.status === 'active' && item.agentId !== actorAgentId)
    .map(resolveParticipantProfile);
}

function resolveDefaultOwner(teamId: string, actorAgentId: string): string | null {
  const memberships = listMemberships(teamId).filter((item) => item.status === 'active');
  return memberships.find((item) => item.role === 'owner' && item.agentId !== actorAgentId)?.agentId
    ?? memberships.find((item) => item.agentId !== actorAgentId)?.agentId
    ?? null;
}

function resolveTargetAgentId(teamId: string, actorAgentId: string, requestedTargetAgentId?: string): string | null {
  if (requestedTargetAgentId) {
    const requested = listMemberships(teamId).find((item) => item.status === 'active' && item.agentId === requestedTargetAgentId);
    if (requested && requested.agentId !== actorAgentId) return requested.agentId;
  }
  return resolveDefaultOwner(teamId, actorAgentId);
}

function buildTeamAgentPrompt(
  teamId: string,
  actorAgentId: string,
  message: string,
  history: TeamRuntimeMessage[],
  participants: TeamRuntimeParticipant[] = [],
): string {
  const historyBlock = history.length === 0
    ? 'No prior messages.'
    : history.map((item) => `${item.senderAgentId}: ${item.content}`).join('\n');
  const participantBlock = participants.length === 0
    ? 'No active team members.'
    : participants.map((item) => `- ${item.id} (${item.name}${item.role ? `, role=${item.role}` : ''})`).join('\n');
  return [
    'You are replying inside a team chat.',
    'Reply to the latest user message directly and concisely.',
    'Do not mention system internals.',
    `Current team_id: ${teamId}`,
    `Your actor_agent_id: ${actorAgentId}`,
    'Always use these exact ids in team tool calls; never use a recipient agent id as team_id.',
    'If another teammate should continue the work, call `team_message_send` with that teammate\'s agent id instead of only mentioning them in plain text.',
    'If a requested tool like `AddCurrentChannelComment` is unavailable, use the available team tools to hand off work to the correct teammate.',
    '',
    'Current team members (agent id, name, team role):',
    participantBlock,
    '',
    'Conversation history:',
    historyBlock,
    '',
    'Latest user message:',
    message,
  ].join('\n');
}

function formatAgentReply(result: { success: boolean; summary: string; output: string[]; error?: string }): string {
  if (!result.success) return result.error || result.summary || '处理失败';
  return result.output
    .map((line) => line.replace(/<think>[\s\S]*?<\/think>/gi, '').trim())
    .filter((line) => line && !/^\[usage\]/i.test(line))
    .at(-1)
    || result.summary
    || '已处理';
}

function buildAdHocWorkspace(workingDir: string): Workspace {
  const now = new Date().toISOString();
  return {
    id: `team-runtime:${workingDir}`,
    name: 'Team Runtime Workspace',
    boundDirs: [workingDir],
    agentspaceDir: workingDir,
    createdAt: now,
    updatedAt: now,
    activeChannels: [],
    activeIssues: [],
  };
}

function resolveTeamRuntimeTools(
  tools: unknown,
  workingDir: string,
  teamId: string,
  actorAgentId: string,
  handoffs: QueuedTeamHandoff[],
): { tools?: string[]; functionTools?: ReturnType<typeof createTeamFunctionTools> } {
  const allowedTools = asStringArray(tools);
  const allowedToolNames = allowedTools as BuiltInAgentToolName[] | undefined;
  const workspace = buildAdHocWorkspace(workingDir);
  const functionTools = [
    ...createTeamFunctionTools('', allowedToolNames, {
      teamId,
      actorAgentId,
      handleMessageSend: (input) => {
        if (handoffs.length > 0 && input && typeof input === 'object') {
          const map = input as Record<string, unknown>;
          if (asString(map.mode) === 'direct') {
            return fail('this agent run already queued a direct handoff', 'CONFLICT');
          }
        }
        const result = handleTeamMessageSend(input);
        if (!result.success || !input || typeof input !== 'object') return result;
        const map = input as Record<string, unknown>;
        const recipients = Array.isArray(map.recipient_agent_ids) ? map.recipient_agent_ids : [];
        const targetAgentId = recipients.find((item): item is string => typeof item === 'string' && item.length > 0);
        const content = asString(map.body);
        const messageId = (result.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
        if (asString(map.mode) === 'direct' && targetAgentId && content && messageId) {
          handoffs.push({ targetAgentId, content, messageId });
        }
        return result;
      },
    }),
    ...createCommandFunctionTools('', allowedToolNames),
    ...createDatabaseFunctionTools('', allowedToolNames),
    ...createWorkspaceFileFunctionTools('', allowedToolNames, () => workspace),
    ...createWorkflowExecutionFunctionTools('', allowedToolNames),
  ];
  const toolNames = functionTools.map((tool) => tool.name);
  return {
    tools: toolNames.length ? toolNames : undefined,
    functionTools: functionTools.length ? functionTools : undefined,
  };
}

async function executePresetTeamReply(
  teamId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
): Promise<TeamAgentReply> {
  const preset = listPresets('').find((item) => item.id === targetAgentId);
  if (!preset) throw new Error(`agent not found: ${targetAgentId}`);
  const session = agentService.getOrCreateSessionForConfig('', preset);
  agentService.updateStatus('', session.id, 'active');
  const startedAt = Date.now();
  const runtime = runtimeFactory({
    kind: preset.runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: preset.apiBase,
    maxTokens: preset.maxTokens,
    ...getThinkingRuntimeConfig(preset),
  });
  onRuntime?.(runtime);
  const workingDir = agentService.resolveWorkingDir('', preset);
  const userPrompt = buildTeamAgentPrompt(teamId, targetAgentId, content, history, listParticipants(teamId, ''));
  const runtimeTools = resolveTeamRuntimeTools(preset.tools, workingDir, teamId, targetAgentId, handoffs);
  try {
    const fullPrompt = prependPersistentAgentContext(userPrompt, {
        workspaceId: '',
        workingDir,
        includeWorkspacePrompt: false,
        excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
      });
    const result = await runtime.execute(
      fullPrompt,
      workingDir,
      {
        maxTurns: 20,
        tools: runtimeTools.tools,
        functionTools: runtimeTools.functionTools,
        userPrompt,
        mcpServers: agentService.getMcpServers(preset.mcps),
        skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir('', preset), preset.skills),
        configDir: agentService.getAgentConfigDir('', preset),
        sandboxDirs: preset.sandboxDirs,
        systemPrompt: preset.systemPrompt,
        outputStyle: preset.outputStyle,
        onEvent,
      },
    );
    agentService.complete('', session.id, result.success ? undefined : result.error || result.summary, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: result.output,
      durationMs: Date.now() - startedAt,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    return {
      content: formatAgentReply(result),
      model: preset.modelId,
      usage: result.usage,
      agentContext: {
        sessionId: result.sessionId ?? '',
        agentConfigId: preset.id,
        name: preset.name,
        role: preset.role,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        userPrompt: content,
        fullPrompt,
        output: result.output.join('\n'),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agentService.updateStatus('', session.id, 'crashed', { error: message });
    throw error;
  }
}

async function executeChatTeamReply(
  teamId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
): Promise<TeamAgentReply> {
  const agent = chatService.findAgent(targetAgentId);
  if (!agent) throw new Error(`chat agent not found: ${targetAgentId}`);
  const runtime = runtimeFactory({
    kind: agent.runtimeKind ?? 'langchain',
    provider: agent.modelProvider ?? agent.provider,
    model: agent.modelId ?? agent.model,
    apiKey: agent.apiKey,
    baseURL: agent.apiBase ?? agent.baseURL,
    maxTokens: agent.maxTokens,
  });
  onRuntime?.(runtime);
  const userPrompt = buildTeamAgentPrompt(teamId, targetAgentId, content, history, listParticipants(teamId, ''));
  const workingDir = chatService.getAgentWorkingDir(targetAgentId) || process.cwd();
  const runtimeTools = resolveTeamRuntimeTools(agent.tools, workingDir, teamId, targetAgentId, handoffs);
  const result = await runtime.execute(userPrompt, workingDir, {
    maxTurns: 20,
    tools: runtimeTools.tools,
    functionTools: runtimeTools.functionTools,
    userPrompt,
    mcpServers: agentService.getMcpServers(agent.mcps as Parameters<typeof agentService.getMcpServers>[0]),
    skills: Array.isArray(agent.skills) ? agent.skills.filter((item): item is string => typeof item === 'string') : [],
    configDir: chatService.getAgentConfigDir(targetAgentId) || undefined,
    systemPrompt: agent.systemPrompt,
    outputStyle: agent.outputStyle,
    onEvent,
  });
  const model = agent.modelId ?? agent.model;
  return {
    content: formatAgentReply(result),
    model,
    usage: result.usage,
    agentContext: {
      sessionId: result.sessionId ?? '',
      agentConfigId: agent.id,
      name: agent.name,
      role: agent.role,
      runtime: agent.runtimeKind,
      model,
      systemPrompt: agent.systemPrompt,
      userPrompt: content,
      fullPrompt: userPrompt,
      output: result.output.join('\n'),
    },
  };
}

async function executeCustomTeamReply(
  teamId: string,
  targetAgentId: string,
  agent: Record<string, unknown>,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
): Promise<TeamAgentReply> {
  const provider = resolveCustomAgentProvider(agent);
  const runtime = runtimeFactory({
    kind: (asString(agent.runtimeKind) ?? 'claude-code') as AgentRuntimeKind,
    provider: asString(agent.modelProvider) ?? provider?.modelProvider,
    model: asString(agent.modelId),
    apiKey: provider?.apiKey ?? asString(agent.apiKey),
    baseURL: provider?.apiBase ?? asString(agent.apiBase) ?? asString(agent.baseURL),
    maxTokens: typeof agent.maxTokens === 'number' ? agent.maxTokens : undefined,
  });
  onRuntime?.(runtime);
  const workingDir = asString(agent.workingDir) || process.cwd();
  const userPrompt = buildTeamAgentPrompt(teamId, targetAgentId, content, history, listParticipants(teamId, ''));
  const runtimeKind = asString(agent.runtimeKind);
  const skills = Array.isArray(agent.skills) ? agent.skills.filter((item): item is string => typeof item === 'string') : [];
  const runtimeTools = resolveTeamRuntimeTools(agent.tools, workingDir, teamId, targetAgentId, handoffs);
  const fullPrompt = prependPersistentAgentContext(userPrompt, {
      workspaceId: '',
      workingDir,
      includeWorkspacePrompt: false,
      excludeNativeClaudeMd: runtimeKind === 'claude-code',
    });
  const result = await runtime.execute(
    fullPrompt,
    workingDir,
    {
      maxTurns: 20,
      tools: runtimeTools.tools,
      functionTools: runtimeTools.functionTools,
      userPrompt,
      mcpServers: agentService.getMcpServers((agent.mcps && typeof agent.mcps === 'object' && !Array.isArray(agent.mcps))
        ? agent.mcps as Parameters<typeof agentService.getMcpServers>[0]
        : undefined),
      skills,
      systemPrompt: asString(agent.systemPrompt),
      outputStyle: asString(agent.outputStyle),
      onEvent,
    },
  );
  const model = asString(agent.modelId);
  return {
    content: formatAgentReply(result),
    model,
    usage: result.usage,
    agentContext: {
      sessionId: result.sessionId ?? '',
      agentConfigId: targetAgentId,
      name: asString(agent.name),
      role: asString(agent.role),
      runtime: runtimeKind,
      model,
      systemPrompt: asString(agent.systemPrompt),
      userPrompt: content,
      fullPrompt,
      output: result.output.join('\n'),
    },
  };
}

async function executeTeamReply(
  teamId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
): Promise<TeamAgentReply> {
  const membership = listMemberships(teamId).find((item) => item.status === 'active' && item.agentId === targetAgentId) as
    | (TeamMembership & { agentStore?: 'agent' | 'chat' | 'custom'; agent?: Record<string, unknown> })
    | undefined;
  const source = membership?.agentStore
    ? { agentStore: membership.agentStore, agent: membership.agent }
    : resolveTeamAgentSource(targetAgentId);

  if (source?.agentStore === 'agent') {
    return executePresetTeamReply(teamId, targetAgentId, content, history, onRuntime, onEvent, handoffs);
  }
  if (source?.agentStore === 'custom' && source.agent && typeof source.agent === 'object') {
    return executeCustomTeamReply(teamId, targetAgentId, source.agent, content, history, onRuntime, onEvent, handoffs);
  }
  return executeChatTeamReply(teamId, targetAgentId, content, history, onRuntime, onEvent, handoffs);
}

async function dispatchQueuedHandoff(
  teamId: string,
  actorAgentId: string,
  runtime: StoredTeamRuntime,
  handoff: QueuedTeamHandoff,
): Promise<void> {
  const message = listMessages(teamId).find((item) => item.id === handoff.messageId);
  const nextRuntime = updateRuntime(teamId, {
    ...runtime,
    leaderAgentId: handoff.targetAgentId,
    status: 'running',
    updatedAt: new Date().toISOString(),
    startedAt: runtime.startedAt ?? message?.createdAt,
    lastMessageId: handoff.messageId,
  });
  const conversation = collectConversationMessages(teamId, actorAgentId, handoff.targetAgentId, nextRuntime);
  const history = conversation
    .filter((item) => item.messageId !== handoff.messageId)
    .slice(-normalizeContextLength(undefined));
  broadcastTeamRuntimeEvent('team.message.created', { teamId, actorAgentId, message });
  await dispatchTeamReply(teamId, actorAgentId, handoff.targetAgentId, handoff.content, nextRuntime, history);
}

function broadcastTeamRuntimeEvent(event: string, payload: Record<string, unknown>): void {
  broadcastToWorkspace(TEAM_RUNTIME_WORKSPACE_ID, event, payload);
}

async function dispatchTeamReply(teamId: string, actorAgentId: string, targetAgentId: string, content: string, runtime: StoredTeamRuntime, history: TeamRuntimeMessage[]): Promise<void> {
  const runKey = `${teamId}:${actorAgentId}:${targetAgentId}`;
  activeTeamRuns.get(runKey)?.runtime.stop();
  const token = uuid();
  const handoffs: QueuedTeamHandoff[] = [];
  const ownerAgentId = listMemberships(teamId).find((item) => item.status === 'active' && item.role === 'owner')?.agentId;
  const recipientAgentIds = [...new Set([actorAgentId, ownerAgentId].filter((id): id is string => Boolean(id) && id !== targetAgentId))];
  const pendingResult = handleTeamMessageSend({
    action: 'send',
    team_id: teamId,
    actor_agent_id: targetAgentId,
    mode: 'direct',
    subject: 'Thinking',
    body: 'Thinking',
    recipient_agent_ids: recipientAgentIds,
    initial_execution_status: 'running',
    metadata: { runtimeId: runtime.id, runtimeStatus: 'running', parts: [] },
  }, { allowExternalRecipients: true });
  const replyMessageId = (pendingResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  let partsTracker: ReturnType<typeof createAgentMessagePartsTracker>;
  partsTracker = createAgentMessagePartsTracker({
    workspaceId: TEAM_RUNTIME_WORKSPACE_ID,
    channelId: runtime.id,
    messageId: replyMessageId ?? runtime.id,
    onOutput: () => {
      if (!replyMessageId) return;
      const parts = partsTracker.buildParts({ sessionId: runtime.id, success: true });
      const updated = updateTeamMessage(teamId, replyMessageId, {
        metadata: { runtimeId: runtime.id, runtimeStatus: 'running', parts },
      });
      if (updated) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updated });
    },
  });
  if (pendingResult.success) {
    broadcastTeamRuntimeEvent('team.message.created', { teamId, actorAgentId, message: pendingResult.data });
  }
  try {
      const reply = await executeTeamReply(teamId, targetAgentId, content, history, (activeRuntime) => {
        activeTeamRuns.set(runKey, { runtime: activeRuntime, token });
      }, partsTracker.handleEvent, handoffs);
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      if (handoffs.length > 0) {
        completeMessageDeliveries(teamId, replyMessageId, 'done');
        if (replyMessageId) handleTeamMessageDelete({ actor_agent_id: targetAgentId, message_id: replyMessageId });
        completeRuntimeDelivery(teamId, runtime, targetAgentId, 'done');
      } else {
        const parts = partsTracker.buildParts({
          sessionId: runtime.id,
          model: reply.model,
          usage: reply.usage,
          agentContext: reply.agentContext,
          success: true,
        });
        if (!parts.some((part) => part.type === 'text')) {
          parts.push({ id: `text-${runtime.id}`, type: 'text', text: reply.content });
        }
        const updatedReply = replyMessageId ? updateTeamMessage(teamId, replyMessageId, {
          subject: reply.content.length > 32 ? `${reply.content.slice(0, 31)}…` : reply.content,
          body: reply.content,
          metadata: { runtimeId: runtime.id, runtimeStatus: 'completed', parts },
        }) : null;
        const nextRuntime = updateRuntime(teamId, {
          ...runtime,
          status: 'completed',
          updatedAt: new Date().toISOString(),
        });
        completeRuntimeDelivery(teamId, runtime, targetAgentId, 'done');
        completeMessageDeliveries(teamId, replyMessageId, 'done');
        broadcastTeamRuntimeEvent('team.runtime.updated', {
          teamId,
          actorAgentId,
          runtimeId: nextRuntime.id,
          leaderAgentId: nextRuntime.leaderAgentId,
          status: nextRuntime.status,
        });
        if (updatedReply) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updatedReply });
      }
  } catch (error) {
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      const parts = partsTracker.buildParts({ sessionId: runtime.id, success: false, error: message });
      const updatedReply = replyMessageId ? updateTeamMessage(teamId, replyMessageId, {
        subject: '处理失败',
        body: `处理失败：${message}`,
        metadata: { runtimeId: runtime.id, runtimeStatus: 'error', parts },
      }) : null;
      const nextRuntime = updateRuntime(teamId, {
        ...runtime,
        status: 'error',
        updatedAt: new Date().toISOString(),
      });
      completeRuntimeDelivery(teamId, runtime, targetAgentId, 'failed', message);
      completeMessageDeliveries(teamId, replyMessageId, 'failed', message);
      broadcastTeamRuntimeEvent('team.runtime.updated', {
        teamId,
        actorAgentId,
        runtimeId: nextRuntime.id,
        leaderAgentId: nextRuntime.leaderAgentId,
        status: nextRuntime.status,
        error: message,
      });
      if (updatedReply) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updatedReply });
  } finally {
    if (activeTeamRuns.get(runKey)?.token === token) activeTeamRuns.delete(runKey);
  }
  for (const handoff of handoffs) {
    await dispatchQueuedHandoff(teamId, actorAgentId, runtime, handoff);
  }
}

function updateRuntime(teamId: string, runtime: StoredTeamRuntime): StoredTeamRuntime {
  const runtimes = listRuntimes(teamId);
  saveRuntimes(teamId, runtimes.some((item) => item.id === runtime.id)
    ? runtimes.map((item) => item.id === runtime.id ? runtime : item)
    : [...runtimes, runtime]);
  return runtime;
}

function completeRuntimeDelivery(
  teamId: string,
  runtime: StoredTeamRuntime,
  recipientAgentId: string,
  executionStatus: 'done' | 'failed',
  failureReason?: string,
): void {
  const delivery = listDeliveries(teamId).find((item) =>
    item.messageId === runtime.lastMessageId && item.recipientAgentId === recipientAgentId,
  );
  if (!delivery) return;
  void handleTeamMessageUpdate({
    action: 'update_status',
    actor_agent_id: recipientAgentId,
    delivery_id: delivery.id,
    execution_status: executionStatus,
    failure_reason: failureReason,
  });
}

function completeMessageDeliveries(
  teamId: string,
  messageId: string | undefined,
  executionStatus: 'done' | 'failed',
  failureReason?: string,
): void {
  if (!messageId) return;
  for (const delivery of listDeliveries(teamId).filter((item) => item.messageId === messageId)) {
    void handleTeamMessageUpdate({
      action: 'update_status',
      actor_agent_id: delivery.recipientAgentId,
      delivery_id: delivery.id,
      execution_status: executionStatus,
      failure_reason: failureReason,
    });
  }
}

function collectConversationMessages(teamId: string, actorAgentId: string, leaderAgentId: string, runtime: StoredTeamRuntime): TeamRuntimeMessage[] {
  const messages = listMessages(teamId);
  const deliveries = listDeliveries(teamId);
  const startedAt = runtime.startedAt
    ?? messages.find((message) => message.id === runtime.lastMessageId)?.createdAt
    ?? '';
  const deliveryByMessageId = new Map<string, Delivery[]>();
  for (const delivery of deliveries) {
    const bucket = deliveryByMessageId.get(delivery.messageId) ?? [];
    bucket.push(delivery);
    deliveryByMessageId.set(delivery.messageId, bucket);
  }

  return messages
    .filter((message) => {
      return message.messageType === 'direct' && message.createdAt >= startedAt;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((message) => {
      const recipients = deliveryByMessageId.get(message.id) ?? [];
      const recipientAgentId = recipients[0]?.recipientAgentId ?? (message.senderAgentId === actorAgentId ? leaderAgentId : actorAgentId);
      const deliveryId = recipients.find((item) => item.recipientAgentId === recipientAgentId)?.id;
      const runtimeStatus = message.metadata?.runtimeStatus;
      const status = runtimeStatus === 'running' ? 'running' : runtimeStatus === 'error' ? 'error' : 'completed';
      return {
        id: message.id,
        runtimeId: runtime.id,
        teamId,
        messageId: message.id,
        deliveryId,
        senderAgentId: message.senderAgentId,
        recipientAgentId,
        content: message.body,
        parts: Array.isArray(message.metadata?.parts) ? message.metadata.parts as MessagePart[] : undefined,
        createdAt: message.createdAt,
        status,
      } satisfies TeamRuntimeMessage;
    });
}

function maybeCompleteRuntime(teamId: string, runtime: StoredTeamRuntime, messages: TeamRuntimeMessage[]): StoredTeamRuntime {
  if (runtime.status !== 'running') return runtime;
  const latestLeaderReply = [...messages]
    .reverse()
    .find((item) => item.senderAgentId === runtime.leaderAgentId
      && item.status === 'completed'
      && listMessages(teamId).find((message) => message.id === item.id)?.metadata?.runtimeId === runtime.id);
  if (!latestLeaderReply) return runtime;
  const completed = {
    ...runtime,
    status: 'completed' as const,
    updatedAt: latestLeaderReply.createdAt,
  };
  return updateRuntime(teamId, completed);
}

export function getTeamRuntime(input: unknown): TeamServiceResult {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  if (!teamId || !actorAgentId) return fail('team_id and actor_agent_id are required', 'INVALID_ARGUMENT');

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  let runtime = findLatestRuntime(teamId, actorAgentId);
  if (!runtime) {
    const leaderAgentId = resolveLeader(teamId, actorAgentId);
    if (!leaderAgentId) return fail('owner not found', 'AGENT_NOT_FOUND');
    runtime = ensureRuntime(teamId, actorAgentId, leaderAgentId);
  }
  const messages = collectConversationMessages(teamId, actorAgentId, runtime.leaderAgentId, runtime);
  runtime = maybeCompleteRuntime(teamId, runtime, messages);
  const leader = resolveLeaderProfile(runtime.leaderAgentId);
  // participants 用原始请求者过滤：非成员不在成员列表中，自然返回全部成员（含 owner）
  const participants = listParticipants(teamId, actorAgentId);

  return ok('team runtime loaded', {
    runtime: {
      id: runtime.id,
      team_id: runtime.teamId,
      actor_agent_id: runtime.actorAgentId,
      leader_agent_id: runtime.leaderAgentId,
      status: runtime.status,
      updated_at: runtime.updatedAt,
    },
    leader,
    participants,
    messages,
  });
}

export function postTeamRuntimeMessage(input: unknown): TeamServiceResult;
export function postTeamRuntimeMessage(input: unknown, waitForReply: true): Promise<TeamServiceResult>;
export function postTeamRuntimeMessage(input: unknown, waitForReply = false): TeamServiceResult | Promise<TeamServiceResult> {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  const content = asString(map.content);
  if (!teamId || !actorAgentId || !content) return fail('team_id, actor_agent_id, content are required', 'INVALID_ARGUMENT');
  const contextLength = normalizeContextLength(map.context_length ?? map.contextLength);

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  const targetAgentId = resolveTargetAgentId(teamId, actorAgentId, asString(map.target_agent_id ?? map.targetAgentId));
  if (!targetAgentId) return fail('target agent not found', 'AGENT_NOT_FOUND');

  const sendResult = handleTeamMessageSend({
    action: 'send',
    team_id: teamId,
    actor_agent_id: actorAgentId,
    mode: 'direct',
    subject: content.length > 32 ? `${content.slice(0, 31)}…` : content,
    body: content,
    recipient_agent_ids: [targetAgentId],
    initial_execution_status: 'running',
  }, { allowExternalSender: true });
  if (!sendResult.success) return sendResult;

  const messageId = (sendResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  const startedAt = listMessages(teamId).find((message) => message.id === messageId)?.createdAt ?? new Date().toISOString();
  const runtime = updateRuntime(teamId, {
    ...ensureRuntime(teamId, actorAgentId, targetAgentId),
    status: 'running',
    updatedAt: new Date().toISOString(),
    startedAt,
    lastMessageId: messageId,
  });
  const leader = resolveLeaderProfile(targetAgentId);
  // participants 用原始请求者过滤：非成员不在成员列表中，自然返回全部成员（含 owner）
  const participants = listParticipants(teamId, actorAgentId);
  const fullConversation = collectConversationMessages(teamId, actorAgentId, targetAgentId, runtime);
  const history = contextLength === 0
    ? []
    : fullConversation
      .filter((item) => item.messageId !== messageId)
      .slice(-contextLength);
  broadcastTeamRuntimeEvent('team.runtime.updated', {
    teamId,
    actorAgentId,
    runtimeId: runtime.id,
    leaderAgentId: runtime.leaderAgentId,
    status: runtime.status,
  });
  broadcastTeamRuntimeEvent('team.message.created', {
    teamId,
    actorAgentId,
    message: (sendResult.data as { message?: unknown } | undefined)?.message,
  });
  const completion = dispatchTeamReply(teamId, actorAgentId, targetAgentId, content, runtime, history);
  const result = ok('team runtime message sent', {
    runtime: {
      id: runtime.id,
      team_id: runtime.teamId,
      actor_agent_id: runtime.actorAgentId,
      leader_agent_id: runtime.leaderAgentId,
      status: runtime.status,
      updated_at: runtime.updatedAt,
    },
    leader,
    participants,
    message: (sendResult.data as { message?: unknown } | undefined)?.message,
  });
  if (waitForReply) return completion.then(() => result);
  void completion;
  return result;
}

export async function handleTeamMessageSendAndRun(input: unknown): Promise<TeamServiceResult> {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const recipients = Array.isArray(map.recipient_agent_ids ?? map.recipientAgentIds)
    ? (map.recipient_agent_ids ?? map.recipientAgentIds) as unknown[]
    : [];
  const targetAgentId = recipients.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (asString(map.mode) !== 'direct' || !targetAgentId) return handleTeamMessageSend(input);

  return postTeamRuntimeMessage({
    team_id: map.team_id ?? map.teamId,
    actor_agent_id: map.actor_agent_id ?? map.actorAgentId,
    content: map.body,
    target_agent_id: targetAgentId,
    context_length: map.context_length ?? map.contextLength,
  }, true);
}
