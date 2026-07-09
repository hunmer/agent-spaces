import { v4 as uuid } from 'uuid';
import type { Team, TeamMembership, TeamMessage } from '@agent-spaces/shared';
import { join } from 'node:path';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime, AgentRuntimeKind, AgentRuntimeConfig } from '../adapters/agent-runtime-types.js';
import { getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { listProviders } from '../storage/llm-store.js';
import { handleTeamMessageSend, resolveTeamAgentSource, type TeamServiceResult } from './team.js';
import * as agentService from './agent.js';
import * as chatService from './chat.js';
import { listPresets } from './agent.js';
import { findAgent as findChatAgent } from './chat.js';
import { getThinkingRuntimeConfig } from './llm-model-config.js';
import { prependPersistentAgentContext } from './persistent-agent-context.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

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
  createdAt: string;
  status: 'running' | 'completed' | 'error';
};

type StoredTeamRuntime = TeamRuntime & {
  lastMessageId?: string;
};

type Delivery = {
  id: string;
  messageId: string;
  recipientAgentId: string;
  senderAgentId: string;
  messageType: string;
  createdAt?: string;
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
  if (customAgent && typeof customAgent === 'object') {
    return buildRuntimeProfile(membership.agentId, customAgent);
  }
  return resolveLeaderProfile(membership.agentId);
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

function buildTeamAgentPrompt(message: string, history: TeamRuntimeMessage[]): string {
  const historyBlock = history.length === 0
    ? 'No prior messages.'
    : history.map((item) => `${item.senderAgentId}: ${item.content}`).join('\n');
  return [
    'You are replying inside a team chat.',
    'Reply to the latest user message directly and concisely.',
    'Do not mention system internals.',
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
    .map((line) => line.trim())
    .filter((line) => line && !/^\[usage\]/i.test(line))
    .at(-1)
    || result.summary
    || '已处理';
}

async function executePresetTeamReply(
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
): Promise<string> {
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
  const userPrompt = buildTeamAgentPrompt(content, history);
  try {
    const result = await runtime.execute(
      prependPersistentAgentContext(userPrompt, {
        workspaceId: '',
        workingDir,
        includeWorkspacePrompt: false,
        excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
      }),
      workingDir,
      {
        maxTurns: 20,
        userPrompt,
        mcpServers: agentService.getMcpServers(preset.mcps),
        skills: agentService.getAvailableSkillNames(agentService.getAgentConfigDir('', preset), preset.skills),
        configDir: agentService.getAgentConfigDir('', preset),
        sandboxDirs: preset.sandboxDirs,
        systemPrompt: preset.systemPrompt,
        outputStyle: preset.outputStyle,
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
    return formatAgentReply(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    agentService.updateStatus('', session.id, 'crashed', { error: message });
    throw error;
  }
}

async function executeChatTeamReply(
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
): Promise<string> {
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
  const userPrompt = buildTeamAgentPrompt(content, history);
  const workingDir = chatService.getAgentWorkingDir(targetAgentId) || process.cwd();
  const result = await runtime.execute(userPrompt, workingDir, {
    maxTurns: 20,
    userPrompt,
    mcpServers: agentService.getMcpServers(agent.mcps as Parameters<typeof agentService.getMcpServers>[0]),
    skills: Array.isArray(agent.skills) ? agent.skills.filter((item): item is string => typeof item === 'string') : [],
    configDir: chatService.getAgentConfigDir(targetAgentId) || undefined,
    systemPrompt: agent.systemPrompt,
    outputStyle: agent.outputStyle,
  });
  return formatAgentReply(result);
}

async function executeCustomTeamReply(
  targetAgentId: string,
  agent: Record<string, unknown>,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
): Promise<string> {
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
  const userPrompt = buildTeamAgentPrompt(content, history);
  const runtimeKind = asString(agent.runtimeKind);
  const skills = Array.isArray(agent.skills) ? agent.skills.filter((item): item is string => typeof item === 'string') : [];
  const result = await runtime.execute(
    prependPersistentAgentContext(userPrompt, {
      workspaceId: '',
      workingDir,
      includeWorkspacePrompt: false,
      excludeNativeClaudeMd: runtimeKind === 'claude-code',
    }),
    workingDir,
    {
      maxTurns: 20,
      userPrompt,
      mcpServers: agentService.getMcpServers((agent.mcps && typeof agent.mcps === 'object' && !Array.isArray(agent.mcps))
        ? agent.mcps as Parameters<typeof agentService.getMcpServers>[0]
        : undefined),
      skills,
      systemPrompt: asString(agent.systemPrompt),
      outputStyle: asString(agent.outputStyle),
    },
  );
  return formatAgentReply(result);
}

async function executeTeamReply(
  teamId: string,
  targetAgentId: string,
  content: string,
  history: TeamRuntimeMessage[],
  onRuntime?: (runtime: AgentRuntime) => void,
): Promise<string> {
  const membership = listMemberships(teamId).find((item) => item.status === 'active' && item.agentId === targetAgentId) as
    | (TeamMembership & { agentStore?: 'agent' | 'chat' | 'custom'; agent?: Record<string, unknown> })
    | undefined;
  const source = membership?.agentStore
    ? { agentStore: membership.agentStore, agent: membership.agent }
    : resolveTeamAgentSource(targetAgentId);

  if (source?.agentStore === 'agent') {
    return executePresetTeamReply(targetAgentId, content, history, onRuntime);
  }
  if (source?.agentStore === 'custom' && source.agent && typeof source.agent === 'object') {
    return executeCustomTeamReply(targetAgentId, source.agent, content, history, onRuntime);
  }
  return executeChatTeamReply(targetAgentId, content, history, onRuntime);
}

function broadcastTeamRuntimeEvent(event: string, payload: Record<string, unknown>): void {
  broadcastToWorkspace(TEAM_RUNTIME_WORKSPACE_ID, event, payload);
}

function dispatchTeamReply(teamId: string, actorAgentId: string, targetAgentId: string, content: string, runtime: StoredTeamRuntime, history: TeamRuntimeMessage[]): void {
  const runKey = `${teamId}:${actorAgentId}:${targetAgentId}`;
  activeTeamRuns.get(runKey)?.runtime.stop();
  const token = uuid();
  void (async () => {
    try {
      const reply = await executeTeamReply(teamId, targetAgentId, content, history, (activeRuntime) => {
        activeTeamRuns.set(runKey, { runtime: activeRuntime, token });
      });
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      const result = handleTeamMessageSend({
        action: 'send',
        team_id: teamId,
        actor_agent_id: targetAgentId,
        mode: 'direct',
        subject: reply.length > 32 ? `${reply.slice(0, 31)}…` : reply,
        body: reply,
        recipient_agent_ids: [actorAgentId],
        initial_execution_status: 'done',
      });
      const nextRuntime = updateRuntime(teamId, {
        ...runtime,
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
      broadcastTeamRuntimeEvent('team.runtime.updated', {
        teamId,
        actorAgentId,
        runtimeId: nextRuntime.id,
        leaderAgentId: nextRuntime.leaderAgentId,
        status: nextRuntime.status,
      });
      if (result.success) {
        broadcastTeamRuntimeEvent('team.message.created', {
          teamId,
          actorAgentId,
          message: (result.data as { message?: unknown } | undefined)?.message,
        });
      }
    } catch (error) {
      if (activeTeamRuns.get(runKey)?.token !== token) return;
      const message = error instanceof Error ? error.message : String(error);
      const result = handleTeamMessageSend({
        action: 'send',
        team_id: teamId,
        actor_agent_id: targetAgentId,
        mode: 'direct',
        subject: '处理失败',
        body: `处理失败：${message}`,
        recipient_agent_ids: [actorAgentId],
        initial_execution_status: 'failed',
      });
      const nextRuntime = updateRuntime(teamId, {
        ...runtime,
        status: 'error',
        updatedAt: new Date().toISOString(),
      });
      broadcastTeamRuntimeEvent('team.runtime.updated', {
        teamId,
        actorAgentId,
        runtimeId: nextRuntime.id,
        leaderAgentId: nextRuntime.leaderAgentId,
        status: nextRuntime.status,
        error: message,
      });
      if (result.success) {
        broadcastTeamRuntimeEvent('team.message.created', {
          teamId,
          actorAgentId,
          message: (result.data as { message?: unknown } | undefined)?.message,
        });
      }
    } finally {
      if (activeTeamRuns.get(runKey)?.token === token) activeTeamRuns.delete(runKey);
    }
  })();
}

function updateRuntime(teamId: string, runtime: StoredTeamRuntime): StoredTeamRuntime {
  const runtimes = listRuntimes(teamId);
  saveRuntimes(teamId, runtimes.some((item) => item.id === runtime.id)
    ? runtimes.map((item) => item.id === runtime.id ? runtime : item)
    : [...runtimes, runtime]);
  return runtime;
}

function collectConversationMessages(teamId: string, actorAgentId: string, leaderAgentId: string, runtime: StoredTeamRuntime): TeamRuntimeMessage[] {
  const messages = listMessages(teamId);
  const deliveries = listDeliveries(teamId);
  const deliveryByMessageId = new Map<string, Delivery[]>();
  for (const delivery of deliveries) {
    const bucket = deliveryByMessageId.get(delivery.messageId) ?? [];
    bucket.push(delivery);
    deliveryByMessageId.set(delivery.messageId, bucket);
  }

  return messages
    .filter((message) => {
      if (message.messageType !== 'direct') return false;
      const recipients = deliveryByMessageId.get(message.id) ?? [];
      const isActorToLeader = message.senderAgentId === actorAgentId && recipients.some((item) => item.recipientAgentId === leaderAgentId);
      const isLeaderToActor = message.senderAgentId === leaderAgentId && recipients.some((item) => item.recipientAgentId === actorAgentId);
      return isActorToLeader || isLeaderToActor;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((message) => {
      const recipients = deliveryByMessageId.get(message.id) ?? [];
      const recipientAgentId = message.senderAgentId === actorAgentId ? leaderAgentId : actorAgentId;
      const deliveryId = recipients.find((item) => item.recipientAgentId === recipientAgentId)?.id;
      const status =
        runtime.status === 'running' && runtime.lastMessageId === message.id
          ? 'running'
          : 'completed';
      return {
        id: message.id,
        runtimeId: runtime.id,
        teamId,
        messageId: message.id,
        deliveryId,
        senderAgentId: message.senderAgentId,
        recipientAgentId,
        content: message.body,
        createdAt: message.createdAt,
        status,
      } satisfies TeamRuntimeMessage;
    });
}

function maybeCompleteRuntime(teamId: string, runtime: StoredTeamRuntime, messages: TeamRuntimeMessage[]): StoredTeamRuntime {
  if (runtime.status !== 'running') return runtime;
  const latestLeaderReply = [...messages]
    .reverse()
    .find((item) => item.senderAgentId === runtime.leaderAgentId && item.createdAt >= runtime.updatedAt);
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
  const memberships = listMemberships(teamId);
  const actorMembership = memberships.find((item) => item.agentId === actorAgentId);
  if (!isActiveMember(actorMembership)) return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');
  let runtime = findLatestRuntime(teamId, actorAgentId);
  if (!runtime) {
    const leaderAgentId = resolveLeader(teamId, actorAgentId);
    if (!leaderAgentId) return fail('owner not found', 'AGENT_NOT_FOUND');
    runtime = ensureRuntime(teamId, actorAgentId, leaderAgentId);
  }
  const messages = collectConversationMessages(teamId, actorAgentId, runtime.leaderAgentId, runtime);
  runtime = maybeCompleteRuntime(teamId, runtime, messages);
  const leader = resolveLeaderProfile(runtime.leaderAgentId);
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

export function postTeamRuntimeMessage(input: unknown): TeamServiceResult {
  if (!input || typeof input !== 'object') return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const map = input as Record<string, unknown>;
  const teamId = asString(map.team_id ?? map.teamId);
  const actorAgentId = asString(map.actor_agent_id ?? map.actorAgentId);
  const content = asString(map.content);
  if (!teamId || !actorAgentId || !content) return fail('team_id, actor_agent_id, content are required', 'INVALID_ARGUMENT');
  const contextLength = normalizeContextLength(map.context_length ?? map.contextLength);

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  const memberships = listMemberships(teamId);
  const actorMembership = memberships.find((item) => item.agentId === actorAgentId);
  if (!isActiveMember(actorMembership)) return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');
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
  });
  if (!sendResult.success) return sendResult;

  const messageId = (sendResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  const runtime = updateRuntime(teamId, {
    ...ensureRuntime(teamId, actorAgentId, targetAgentId),
    status: 'running',
    updatedAt: new Date().toISOString(),
    lastMessageId: messageId,
  });
  const leader = resolveLeaderProfile(targetAgentId);
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
  dispatchTeamReply(teamId, actorAgentId, targetAgentId, content, runtime, history);

  return ok('team runtime message sent', {
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
}

export function handleTeamMessageSendAndRun(input: unknown): TeamServiceResult {
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
  });
}
