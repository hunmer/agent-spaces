import { v4 as uuid } from 'uuid';
import type { Team, TeamMembership, TeamMessage, Workspace, BuiltInAgentToolName, MessageAgentContext, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime, AgentRuntimeKind, AgentRuntimeConfig, AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
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
import { asSessionId } from './team-internal.js';
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
  sessionId: string;
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
  sessionId: string;
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
  output?: string;
};

type Delivery = {
  id: string;
  messageId: string;
  recipientAgentId: string;
  senderAgentId: string;
  messageType: string;
  inboxStatus: 'unread' | 'read' | 'archived';
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

function teamDataDir(teamId: string, sessionId?: string): string {
  return join(teamDir(), teamId, ...(sessionId ? [sessionId] : []));
}

function writeTeamRunLog(teamId: string, sessionId: string, startedAt: string, runId: string, lines: string[]): void {
  const logsDir = join(teamDataDir(teamId, sessionId), 'logs');
  ensureDir(logsDir);
  appendFileSync(join(logsDir, 'team.log'), `===== RUN ${runId} ${startedAt} =====\n${lines.join('\n')}\n\n`, 'utf-8');
}

function appendTeamRunToolEvent(lines: string[], event: AgentRuntimeEvent): void {
  if (event.type === 'tool_use') {
    lines.push('', '[TOOL CALL]', `id: ${event.id}`, `name: ${event.name}`, `input: ${inspect(event.input, { depth: null })}`);
  } else if (event.type === 'tool_result') {
    lines.push('', '[TOOL RESULT]', `id: ${event.toolUseId ?? ''}`, inspect(event.result, { depth: null }));
  }
}

function teamFilePath(teamId: string): string {
  return join(teamDataDir(teamId), 'info.json');
}

function teamMembershipsPath(teamId: string): string {
  return join(teamDataDir(teamId), 'memberships.json');
}

function teamMessagesPath(teamId: string, sessionId: string): string {
  return join(teamDataDir(teamId, sessionId), 'messages.json');
}

function teamDeliveriesPath(teamId: string, sessionId: string): string {
  return join(teamDataDir(teamId, sessionId), 'deliveries.json');
}

function teamRuntimesPath(teamId: string, sessionId: string): string {
  return join(teamDataDir(teamId, sessionId), 'runtimes.json');
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

function listMessages(teamId: string, sessionId: string): TeamMessage[] {
  return readJsonFile<TeamMessage[]>(teamMessagesPath(teamId, sessionId)) ?? [];
}

function updateTeamMessage(teamId: string, sessionId: string, messageId: string, patch: Partial<TeamMessage>): TeamMessage | null {
  const messages = listMessages(teamId, sessionId);
  const current = messages.find((message) => message.id === messageId);
  if (!current) return null;
  const updated = { ...current, ...patch };
  writeJsonFile(teamMessagesPath(teamId, sessionId), messages.map((message) => message.id === messageId ? updated : message));
  return updated;
}

function listDeliveries(teamId: string, sessionId: string): Delivery[] {
  return readJsonFile<Delivery[]>(teamDeliveriesPath(teamId, sessionId)) ?? [];
}

function listRuntimes(teamId: string, sessionId: string): StoredTeamRuntime[] {
  return readJsonFile<StoredTeamRuntime[]>(teamRuntimesPath(teamId, sessionId)) ?? [];
}

function saveRuntimes(teamId: string, sessionId: string, items: StoredTeamRuntime[]): void {
  writeJsonFile(teamRuntimesPath(teamId, sessionId), items);
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

function ensureRuntime(teamId: string, sessionId: string, actorAgentId: string, leaderAgentId: string): StoredTeamRuntime {
  const runtimes = listRuntimes(teamId, sessionId);
  const existing = [...runtimes].reverse().find((item) =>
    item.actorAgentId === actorAgentId
    && item.leaderAgentId === leaderAgentId);
  if (existing) return existing;
  const created: StoredTeamRuntime = {
    sessionId,
    teamId,
    actorAgentId,
    leaderAgentId,
    status: 'idle',
    updatedAt: new Date().toISOString(),
  };
  saveRuntimes(teamId, sessionId, [...runtimes, created]);
  return created;
}

function findLatestRuntime(teamId: string, sessionId: string, actorAgentId: string): StoredTeamRuntime | null {
  return listRuntimes(teamId, sessionId)
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
  const isOwner = listMemberships(teamId).some((item) => item.status === 'active' && item.agentId === actorAgentId && item.role === 'owner');
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
    ...(isOwner ? ['When the overall team task is finished, call `team_task_complete` with the final result in `output` before your final reply so the team runtime does not remain running.'] : []),
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
  sessionId: string,
  actorAgentId: string,
  handoffs: QueuedTeamHandoff[],
): { tools?: string[]; functionTools?: ReturnType<typeof createTeamFunctionTools> } {
  const allowedTools = asStringArray(tools);
  const isOwner = listMemberships(teamId).some((item) => item.status === 'active' && item.agentId === actorAgentId && item.role === 'owner');
  const allowedToolNames = allowedTools
    ? [...new Set([...allowedTools, ...(isOwner ? ['team_task_complete'] : [])])] as BuiltInAgentToolName[]
    : undefined;
  const workspace = buildAdHocWorkspace(workingDir);
  const functionTools = [
    ...createTeamFunctionTools('', allowedToolNames, {
      teamId,
      sessionId,
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
  sessionId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
  onInput?: (input: string) => void,
): Promise<TeamAgentReply> {
  const preset = listPresets('').find((item) => item.id === targetAgentId);
  if (!preset) throw new Error(`agent not found: ${targetAgentId}`);
  const session = agentService.getOrCreateSessionForConfig(TEAM_RUNTIME_WORKSPACE_ID, preset);
  agentService.updateStatus(TEAM_RUNTIME_WORKSPACE_ID, session.id, 'active');
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
  const runtimeTools = resolveTeamRuntimeTools(preset.tools, workingDir, teamId, sessionId, targetAgentId, handoffs);
  try {
    const fullPrompt = prependPersistentAgentContext(userPrompt, {
        workspaceId: '',
        workingDir,
        includeWorkspacePrompt: false,
        excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
      });
    onInput?.(fullPrompt);
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
    agentService.complete(TEAM_RUNTIME_WORKSPACE_ID, session.id, result.success ? undefined : result.error || result.summary, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: result.output,
      durationMs: Date.now() - startedAt,
      usage: result.usage,
      costUsd: result.costUsd,
      forceRecord: true,
    });
    return {
      content: formatAgentReply(result),
      model: preset.modelId,
      usage: result.usage,
      agentContext: {
        sessionId: session.id,
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
    agentService.updateStatus(TEAM_RUNTIME_WORKSPACE_ID, session.id, 'crashed', { error: message });
    throw error;
  }
}

async function executeChatTeamReply(
  teamId: string,
  sessionId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
  onInput?: (input: string) => void,
): Promise<TeamAgentReply> {
  const agent = chatService.findAgent(targetAgentId);
  if (!agent) throw new Error(`chat agent not found: ${targetAgentId}`);
  const session = agentService.create(TEAM_RUNTIME_WORKSPACE_ID, agent.role ?? 'assistant', agent.id);
  const startedAt = Date.now();
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
  const runtimeTools = resolveTeamRuntimeTools(agent.tools, workingDir, teamId, sessionId, targetAgentId, handoffs);
  onInput?.(userPrompt);
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
  agentService.complete(TEAM_RUNTIME_WORKSPACE_ID, session.id, result.success ? undefined : result.error || result.summary, {
    runtime: agent.runtimeKind,
    model,
    summary: result.summary,
    output: result.output,
    durationMs: Date.now() - startedAt,
    usage: result.usage,
    costUsd: result.costUsd,
    forceRecord: true,
  });
  return {
    content: formatAgentReply(result),
    model,
    usage: result.usage,
    agentContext: {
      sessionId: session.id,
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
  sessionId: string,
  targetAgentId: string,
  agent: Record<string, unknown>,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
  onInput?: (input: string) => void,
): Promise<TeamAgentReply> {
  const provider = resolveCustomAgentProvider(agent);
  const session = agentService.create(TEAM_RUNTIME_WORKSPACE_ID, asString(agent.role) ?? 'assistant', targetAgentId);
  const startedAt = Date.now();
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
  const runtimeTools = resolveTeamRuntimeTools(agent.tools, workingDir, teamId, sessionId, targetAgentId, handoffs);
  const fullPrompt = prependPersistentAgentContext(userPrompt, {
      workspaceId: '',
      workingDir,
      includeWorkspacePrompt: false,
      excludeNativeClaudeMd: runtimeKind === 'claude-code',
    });
  onInput?.(fullPrompt);
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
  agentService.complete(TEAM_RUNTIME_WORKSPACE_ID, session.id, result.success ? undefined : result.error || result.summary, {
    runtime: runtimeKind,
    model,
    summary: result.summary,
    output: result.output,
    durationMs: Date.now() - startedAt,
    usage: result.usage,
    costUsd: result.costUsd,
    forceRecord: true,
  });
  return {
    content: formatAgentReply(result),
    model,
    usage: result.usage,
    agentContext: {
      sessionId: session.id,
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
  sessionId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
  onEvent?: (event: AgentRuntimeEvent) => void,
  handoffs: QueuedTeamHandoff[] = [],
  onInput?: (input: string) => void,
): Promise<TeamAgentReply> {
  const membership = listMemberships(teamId).find((item) => item.status === 'active' && item.agentId === targetAgentId) as
    | (TeamMembership & { agentStore?: 'agent' | 'chat' | 'custom'; agent?: Record<string, unknown> })
    | undefined;
  const source = membership?.agentStore
    ? { agentStore: membership.agentStore, agent: membership.agent }
    : resolveTeamAgentSource(targetAgentId);

  if (source?.agentStore === 'agent') {
    return executePresetTeamReply(teamId, sessionId, targetAgentId, content, history, onRuntime, onEvent, handoffs, onInput);
  }
  if (source?.agentStore === 'custom' && source.agent && typeof source.agent === 'object') {
    return executeCustomTeamReply(teamId, sessionId, targetAgentId, source.agent, content, history, onRuntime, onEvent, handoffs, onInput);
  }
  return executeChatTeamReply(teamId, sessionId, targetAgentId, content, history, onRuntime, onEvent, handoffs, onInput);
}

async function dispatchQueuedHandoff(
  teamId: string,
  sessionId: string,
  actorAgentId: string,
  runtime: StoredTeamRuntime,
  handoff: QueuedTeamHandoff,
): Promise<void> {
  const message = listMessages(teamId, sessionId).find((item) => item.id === handoff.messageId);
  const nextRuntime = updateRuntime(teamId, sessionId, {
    ...runtime,
    leaderAgentId: handoff.targetAgentId,
    status: 'running',
    updatedAt: new Date().toISOString(),
    startedAt: runtime.startedAt ?? message?.createdAt,
    lastMessageId: handoff.messageId,
  });
  const conversation = collectConversationMessages(teamId, sessionId, actorAgentId, handoff.targetAgentId, nextRuntime);
  const history = conversation
    .filter((item) => item.messageId !== handoff.messageId)
    .slice(-normalizeContextLength(undefined));
  broadcastTeamRuntimeEvent('team.message.created', { teamId, actorAgentId, message });
  await dispatchTeamReply(teamId, sessionId, actorAgentId, handoff.targetAgentId, handoff.content, nextRuntime, history);
}

function broadcastTeamRuntimeEvent(event: string, payload: Record<string, unknown>): void {
  broadcastToWorkspace(TEAM_RUNTIME_WORKSPACE_ID, event, payload);
}

async function dispatchTeamReply(teamId: string, sessionId: string, actorAgentId: string, targetAgentId: string, content: string, runtime: StoredTeamRuntime, history: TeamRuntimeMessage[]): Promise<void> {
  markRuntimeDeliveryRead(teamId, sessionId, runtime, targetAgentId);
  const runKey = `${teamId}:${sessionId}:${actorAgentId}:${targetAgentId}`;
  activeTeamRuns.get(runKey)?.runtime.stop();
  const token = uuid();
  const logStartedAt = new Date().toISOString();
  const logLines = [`team: ${teamId}`, `agent: ${targetAgentId}`, `startedAt: ${logStartedAt}`];
  const handoffs: QueuedTeamHandoff[] = [];
  const ownerAgentId = listMemberships(teamId).find((item) => item.status === 'active' && item.role === 'owner')?.agentId;
  const recipientAgentIds = [...new Set([actorAgentId, ownerAgentId].filter((id): id is string => Boolean(id) && id !== targetAgentId))];
  const pendingResult = handleTeamMessageSend({
    action: 'send',
    team_id: teamId,
    session_id: sessionId,
    actor_agent_id: targetAgentId,
    mode: 'direct',
    subject: 'Thinking',
    body: 'Thinking',
    recipient_agent_ids: recipientAgentIds,
    initial_execution_status: 'running',
    metadata: { sessionId: runtime.sessionId, runtimeStatus: 'running', parts: [] },
  }, { allowExternalRecipients: true });
  const replyMessageId = (pendingResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  let partsTracker: ReturnType<typeof createAgentMessagePartsTracker>;
  partsTracker = createAgentMessagePartsTracker({
    workspaceId: TEAM_RUNTIME_WORKSPACE_ID,
    channelId: runtime.sessionId,
    messageId: replyMessageId ?? runtime.sessionId,
    onOutput: () => {
      if (!replyMessageId) return;
      const parts = partsTracker.buildParts({ sessionId: runtime.sessionId, success: true });
      const updated = updateTeamMessage(teamId, sessionId, replyMessageId, {
        metadata: { sessionId: runtime.sessionId, runtimeStatus: 'running', parts },
      });
      if (updated) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updated });
    },
  });
  if (pendingResult.success) {
    broadcastTeamRuntimeEvent('team.message.created', { teamId, actorAgentId, message: pendingResult.data });
  }
  try {
      const reply = await executeTeamReply(teamId, sessionId, targetAgentId, content, history, (activeRuntime) => {
        activeTeamRuns.set(runKey, { runtime: activeRuntime, token });
      }, (event) => {
        appendTeamRunToolEvent(logLines, event);
        partsTracker.handleEvent(event);
      }, handoffs, (input) => logLines.push('', '[INPUT]', input));
      logLines.push('', '[OUTPUT]', reply.agentContext.output || reply.content);
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      const parts = partsTracker.buildParts({
        sessionId: runtime.sessionId,
        model: reply.model,
        usage: reply.usage,
        agentContext: reply.agentContext,
        success: true,
      });
      if (handoffs.length > 0) {
        for (const handoff of handoffs) {
          const message = listMessages(teamId, sessionId).find((item) => item.id === handoff.messageId);
          const handoffParts: MessagePart[] = [
            ...parts.filter((part) => part.type !== 'text'),
            { id: `text-${handoff.messageId}`, type: 'text', text: handoff.content },
          ];
          const updated = updateTeamMessage(teamId, sessionId, handoff.messageId, {
            metadata: { ...message?.metadata, sessionId: runtime.sessionId, runtimeStatus: 'completed', parts: handoffParts },
          });
          if (updated) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updated });
        }
        completeMessageDeliveries(teamId, sessionId, replyMessageId, 'done');
        if (replyMessageId) handleTeamMessageDelete({ actor_agent_id: targetAgentId, team_id: teamId, session_id: sessionId, message_id: replyMessageId });
        completeRuntimeDelivery(teamId, sessionId, runtime, targetAgentId, 'done');
      } else {
        if (!parts.some((part) => part.type === 'text')) {
          parts.push({ id: `text-${runtime.sessionId}`, type: 'text', text: reply.content });
        }
        const updatedReply = replyMessageId ? updateTeamMessage(teamId, sessionId, replyMessageId, {
          subject: reply.content.length > 32 ? `${reply.content.slice(0, 31)}…` : reply.content,
          body: reply.content,
          metadata: { sessionId: runtime.sessionId, runtimeStatus: 'completed', parts },
        }) : null;
        const nextRuntime = updateRuntime(teamId, sessionId, {
          ...runtime,
          status: 'completed',
          output: listRuntimes(teamId, sessionId).find((item) => item.sessionId === runtime.sessionId)?.output,
          updatedAt: new Date().toISOString(),
        });
        completeRuntimeDelivery(teamId, sessionId, runtime, targetAgentId, 'done');
        completeMessageDeliveries(teamId, sessionId, replyMessageId, 'done');
        broadcastTeamRuntimeEvent('team.runtime.updated', {
          teamId,
          actorAgentId,
          sessionId: nextRuntime.sessionId,
          leaderAgentId: nextRuntime.leaderAgentId,
          status: nextRuntime.status,
        });
        if (updatedReply) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updatedReply });
      }
  } catch (error) {
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      logLines.push('', '[ERROR]', message);
      const parts = partsTracker.buildParts({ sessionId: runtime.sessionId, success: false, error: message });
      const updatedReply = replyMessageId ? updateTeamMessage(teamId, sessionId, replyMessageId, {
        subject: '处理失败',
        body: `处理失败：${message}`,
        metadata: { sessionId: runtime.sessionId, runtimeStatus: 'error', parts },
      }) : null;
      const nextRuntime = updateRuntime(teamId, sessionId, {
        ...runtime,
        status: 'error',
        updatedAt: new Date().toISOString(),
      });
      completeRuntimeDelivery(teamId, sessionId, runtime, targetAgentId, 'failed', message);
      completeMessageDeliveries(teamId, sessionId, replyMessageId, 'failed', message);
      broadcastTeamRuntimeEvent('team.runtime.updated', {
        teamId,
        actorAgentId,
        sessionId: nextRuntime.sessionId,
        leaderAgentId: nextRuntime.leaderAgentId,
        status: nextRuntime.status,
        error: message,
      });
      if (updatedReply) broadcastTeamRuntimeEvent('team.message.updated', { teamId, actorAgentId, message: updatedReply });
  } finally {
    writeTeamRunLog(teamId, sessionId, logStartedAt, runtime.sessionId, logLines);
    if (activeTeamRuns.get(runKey)?.token === token) activeTeamRuns.delete(runKey);
  }
  for (const handoff of handoffs) {
    await dispatchQueuedHandoff(teamId, sessionId, actorAgentId, runtime, handoff);
  }
}

function updateRuntime(teamId: string, sessionId: string, runtime: StoredTeamRuntime): StoredTeamRuntime {
  const runtimes = listRuntimes(teamId, sessionId);
  saveRuntimes(teamId, sessionId, runtimes.some((item) => item.sessionId === runtime.sessionId)
    ? runtimes.map((item) => item.sessionId === runtime.sessionId ? runtime : item)
    : [...runtimes, runtime]);
  return runtime;
}

function completeRuntimeDelivery(
  teamId: string,
  sessionId: string,
  runtime: StoredTeamRuntime,
  recipientAgentId: string,
  executionStatus: 'done' | 'failed',
  failureReason?: string,
): void {
  const delivery = listDeliveries(teamId, sessionId).find((item) =>
    item.messageId === runtime.lastMessageId && item.recipientAgentId === recipientAgentId,
  );
  if (!delivery) return;
  void handleTeamMessageUpdate({
    action: 'update_status',
    team_id: teamId,
    session_id: sessionId,
    actor_agent_id: recipientAgentId,
    delivery_id: delivery.id,
    execution_status: executionStatus,
    failure_reason: failureReason,
  });
}

function markRuntimeDeliveryRead(teamId: string, sessionId: string, runtime: StoredTeamRuntime, recipientAgentId: string): void {
  const delivery = listDeliveries(teamId, sessionId).find((item) =>
    item.messageId === runtime.lastMessageId && item.recipientAgentId === recipientAgentId && item.inboxStatus === 'unread',
  );
  if (!delivery) return;
  void handleTeamMessageUpdate({
    action: 'update_status',
    team_id: teamId,
    session_id: sessionId,
    actor_agent_id: recipientAgentId,
    delivery_id: delivery.id,
    inbox_status: 'read',
  });
}

export function handleTeamTaskComplete(input: unknown): TeamServiceResult {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  const sessionId = asSessionId(map.session_id ?? map.sessionId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  const output = asString(map.output);
  if (asString(map.action) !== 'complete' || !teamId || !sessionId || !actorAgentId || !output) {
    return fail('action=complete, actor_agent_id, team_id, session_id, output are required', 'INVALID_ARGUMENT');
  }
  const owner = listMemberships(teamId).find((item) => item.status === 'active' && item.agentId === actorAgentId && item.role === 'owner');
  if (!owner) return fail('only the active team owner can complete the team task', 'PERMISSION_DENIED');
  const runtimes = listRuntimes(teamId, sessionId)
    .filter((item) => item.leaderAgentId === actorAgentId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const runtime = runtimes.find((item) => item.status === 'running') ?? runtimes[0];
  if (!runtime) return fail('team runtime not found', 'RUNTIME_NOT_FOUND');
  if (runtime.status === 'completed') {
    const completed = updateRuntime(teamId, sessionId, { ...runtime, output, updatedAt: new Date().toISOString() });
    return ok('team task already completed', { session_id: completed.sessionId, status: completed.status, output });
  }
  if (runtime.status !== 'running') return fail('team runtime is not running', 'INVALID_STATUS_TRANSITION');
  const completed = updateRuntime(teamId, sessionId, { ...runtime, status: 'completed', output, updatedAt: new Date().toISOString() });
  broadcastTeamRuntimeEvent('team.runtime.updated', {
    teamId,
    actorAgentId: completed.actorAgentId,
    sessionId: completed.sessionId,
    leaderAgentId: completed.leaderAgentId,
    status: completed.status,
  });
  return ok('team task completed', { session_id: completed.sessionId, status: completed.status, output });
}

function completeMessageDeliveries(
  teamId: string,
  sessionId: string,
  messageId: string | undefined,
  executionStatus: 'done' | 'failed',
  failureReason?: string,
): void {
  if (!messageId) return;
  for (const delivery of listDeliveries(teamId, sessionId).filter((item) => item.messageId === messageId)) {
    void handleTeamMessageUpdate({
      action: 'update_status',
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: delivery.recipientAgentId,
      delivery_id: delivery.id,
      execution_status: executionStatus,
      failure_reason: failureReason,
    });
  }
}

function collectConversationMessages(teamId: string, sessionId: string, actorAgentId: string, leaderAgentId: string, runtime: StoredTeamRuntime): TeamRuntimeMessage[] {
  const messages = listMessages(teamId, sessionId);
  const deliveries = listDeliveries(teamId, sessionId);
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
        sessionId: runtime.sessionId,
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

function maybeCompleteRuntime(teamId: string, sessionId: string, runtime: StoredTeamRuntime, messages: TeamRuntimeMessage[]): StoredTeamRuntime {
  if (runtime.status !== 'running') return runtime;
  const latestLeaderReply = [...messages]
    .reverse()
    .find((item) => item.senderAgentId === runtime.leaderAgentId
      && item.status === 'completed'
      && listMessages(teamId, sessionId).find((message) => message.id === item.id)?.metadata?.sessionId === runtime.sessionId);
  if (!latestLeaderReply) return runtime;
  const completed = {
    ...runtime,
    status: 'completed' as const,
    updatedAt: latestLeaderReply.createdAt,
  };
  return updateRuntime(teamId, sessionId, completed);
}

export function listTeamSessions(input: unknown): TeamServiceResult {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
  if (!loadTeam(teamId)) return fail('team not found', 'TEAM_NOT_FOUND');
  const dir = teamDataDir(teamId);
  const sessions = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && Boolean(asSessionId(entry.name)))
      .map((entry) => listRuntimes(teamId, entry.name)[0])
      .filter((runtime): runtime is StoredTeamRuntime => Boolean(runtime))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((runtime) => ({
        session_id: runtime.sessionId,
        status: runtime.status,
        updated_at: runtime.updatedAt,
      }))
    : [];
  return ok('team sessions listed', { sessions });
}

export function getTeamRuntime(input: unknown): TeamServiceResult {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  if (!teamId || !actorAgentId) return fail('team_id and actor_agent_id are required', 'INVALID_ARGUMENT');
  const rawSessionId = map.session_id ?? map.sessionId;
  const sessionId = asSessionId(rawSessionId) ?? uuid();
  if (rawSessionId !== undefined && !asSessionId(rawSessionId)) return fail('session_id must be a UUID', 'INVALID_ARGUMENT');

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  let runtime = findLatestRuntime(teamId, sessionId, actorAgentId);
  if (!runtime) {
    const leaderAgentId = resolveLeader(teamId, actorAgentId);
    if (!leaderAgentId) return fail('owner not found', 'AGENT_NOT_FOUND');
    runtime = ensureRuntime(teamId, sessionId, actorAgentId, leaderAgentId);
  }
  const messages = collectConversationMessages(teamId, sessionId, actorAgentId, runtime.leaderAgentId, runtime);
  runtime = maybeCompleteRuntime(teamId, sessionId, runtime, messages);
  const leader = resolveLeaderProfile(runtime.leaderAgentId);
  // participants 用原始请求者过滤：非成员不在成员列表中，自然返回全部成员（含 owner）
  const participants = listParticipants(teamId, actorAgentId);

  return ok('team runtime loaded', {
    runtime: {
      session_id: sessionId,
      team_id: runtime.teamId,
      actor_agent_id: runtime.actorAgentId,
      leader_agent_id: runtime.leaderAgentId,
      status: runtime.status,
      output: runtime.output,
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
  const sessionId = asSessionId(map.session_id ?? map.sessionId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  const content = asString(map.content);
  if (!teamId || !sessionId || !actorAgentId || !content) return fail('team_id, session_id, actor_agent_id, content are required', 'INVALID_ARGUMENT');
  const contextLength = normalizeContextLength(map.context_length ?? map.contextLength);

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  const targetAgentId = resolveTargetAgentId(teamId, actorAgentId, asString(map.target_agent_id ?? map.targetAgentId));
  if (!targetAgentId) return fail('target agent not found', 'AGENT_NOT_FOUND');

  const sendResult = handleTeamMessageSend({
    action: 'send',
    team_id: teamId,
    session_id: sessionId,
    actor_agent_id: actorAgentId,
    mode: 'direct',
    subject: content.length > 32 ? `${content.slice(0, 31)}…` : content,
    body: content,
    recipient_agent_ids: [targetAgentId],
    initial_execution_status: 'running',
  }, { allowExternalSender: true });
  if (!sendResult.success) return sendResult;

  const messageId = (sendResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  const startedAt = listMessages(teamId, sessionId).find((message) => message.id === messageId)?.createdAt ?? new Date().toISOString();
  const runtime = updateRuntime(teamId, sessionId, {
    ...ensureRuntime(teamId, sessionId, actorAgentId, targetAgentId),
    status: 'running',
    output: undefined,
    updatedAt: new Date().toISOString(),
    startedAt,
    lastMessageId: messageId,
  });
  const leader = resolveLeaderProfile(targetAgentId);
  // participants 用原始请求者过滤：非成员不在成员列表中，自然返回全部成员（含 owner）
  const participants = listParticipants(teamId, actorAgentId);
  const fullConversation = collectConversationMessages(teamId, sessionId, actorAgentId, targetAgentId, runtime);
  const history = contextLength === 0
    ? []
    : fullConversation
      .filter((item) => item.messageId !== messageId)
      .slice(-contextLength);
  broadcastTeamRuntimeEvent('team.runtime.updated', {
    teamId,
    actorAgentId,
    sessionId: runtime.sessionId,
    leaderAgentId: runtime.leaderAgentId,
    status: runtime.status,
  });
  broadcastTeamRuntimeEvent('team.message.created', {
    teamId,
    actorAgentId,
    message: (sendResult.data as { message?: unknown } | undefined)?.message,
  });
  const completion = dispatchTeamReply(teamId, sessionId, actorAgentId, targetAgentId, content, runtime, history);
  const result = ok('team runtime message sent', {
    runtime: {
      session_id: sessionId,
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
    session_id: map.session_id ?? map.sessionId,
    actor_agent_id: map.actor_agent_id ?? map.actorAgentId,
    content: map.body,
    target_agent_id: targetAgentId,
    context_length: map.context_length ?? map.contextLength,
  }, true);
}
