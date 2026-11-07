import type { AgentConfig } from '@agent-spaces/shared';

export function getAgentDisplayName(agent: Pick<AgentConfig, 'name' | 'role'>): string {
  return agent.name?.trim() || agent.role;
}

export function findAgentById<T extends Pick<AgentConfig, 'id'>>(
  agents: T[],
  agentId: string,
): T | undefined {
  return agents.find((agent) => agent.id === agentId);
}

export function getMemberDisplayName(
  agents: Array<Pick<AgentConfig, 'id' | 'name' | 'role'>>,
  member: string,
): string {
  if (member === 'user') return 'user';
  const agent = findAgentById(agents, member);
  return agent ? getAgentDisplayName(agent) : member;
}

export function normalizeChannelMembersToAgentIds(
  agents: Array<Pick<AgentConfig, 'id'>>,
  members: string[],
): string[] {
  const agentIds = new Set(agents.map((agent) => agent.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (!agentIds.has(member)) continue;
    if (seen.has(member)) continue;
    seen.add(member);
    normalized.push(member);
  }

  return normalized;
}
