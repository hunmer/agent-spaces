import { v4 as uuid } from 'uuid';
import type { Team, TeamMembership, TeamMessage } from '@agent-spaces/shared';
import { join } from 'node:path';
import { getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { handleTeamMessageSend, type TeamServiceResult } from './team.js';
import { listPresets } from './agent.js';
import { findAgent as findChatAgent } from './chat.js';

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
};

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

function resolveLeaderProfile(leaderAgentId: string): TeamRuntimeLeader {
  const preset = listPresets('').find((item) => item.id === leaderAgentId);
  if (preset) {
    return {
      id: preset.id,
      name: preset.name || preset.id,
      description: preset.description,
      avatarUrl: preset.avatarUrl,
      icon: preset.icon,
      role: preset.role,
    };
  }
  const chatAgent = findChatAgent(leaderAgentId);
  if (chatAgent) {
    return {
      id: chatAgent.id,
      name: chatAgent.name || chatAgent.id,
      description: chatAgent.description,
      avatarUrl: chatAgent.avatarUrl,
      icon: chatAgent.icon,
      role: chatAgent.role,
    };
  }
  return {
    id: leaderAgentId,
    name: leaderAgentId,
  };
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
  const leaderAgentId = resolveLeader(teamId, actorAgentId);
  if (!leaderAgentId) return fail('leader not found', 'AGENT_NOT_FOUND');

  let runtime = ensureRuntime(teamId, actorAgentId, leaderAgentId);
  const messages = collectConversationMessages(teamId, actorAgentId, leaderAgentId, runtime);
  runtime = maybeCompleteRuntime(teamId, runtime, messages);
  const leader = resolveLeaderProfile(leaderAgentId);

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

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  const memberships = listMemberships(teamId);
  const actorMembership = memberships.find((item) => item.agentId === actorAgentId);
  if (!isActiveMember(actorMembership)) return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');
  const leaderAgentId = resolveLeader(teamId, actorAgentId);
  if (!leaderAgentId) return fail('leader not found', 'AGENT_NOT_FOUND');

  const sendResult = handleTeamMessageSend({
    action: 'send',
    team_id: teamId,
    actor_agent_id: actorAgentId,
    mode: 'direct',
    subject: content.length > 32 ? `${content.slice(0, 31)}…` : content,
    body: content,
    recipient_agent_ids: [leaderAgentId],
    initial_execution_status: 'running',
  });
  if (!sendResult.success) return sendResult;

  const messageId = (sendResult.data as { message?: { message_id?: string } } | undefined)?.message?.message_id;
  const runtime = updateRuntime(teamId, {
    ...ensureRuntime(teamId, actorAgentId, leaderAgentId),
    status: 'running',
    updatedAt: new Date().toISOString(),
    lastMessageId: messageId,
  });
  const leader = resolveLeaderProfile(leaderAgentId);

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
    message: (sendResult.data as { message?: unknown } | undefined)?.message,
  });
}
