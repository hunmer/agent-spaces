import { v4 as uuid } from 'uuid';
import type { TeamMembership, TeamRole, TeamServiceResult } from './team-types.js';
import {
  asBoolean,
  asString,
  fail,
  getActiveMembership,
  isManagerRole,
  isObject,
  listMemberships,
  loadTeam,
  membershipView,
  ok,
  parseRole,
  resolveEffectiveMembership,
  resolveMembershipAgent,
  saveMemberships,
  updateTeamMemberCount,
} from './team-internal.js';

export function handleTeamMembershipManage(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  if (!action || !actorAgentId || !teamId) return fail('action, actor_agent_id, team_id are required', 'INVALID_ARGUMENT');
  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');

  if (action === 'join') {
    if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');
    if (team.visibility !== 'open' && !getActiveMembership(teamId, actorAgentId)) {
      return fail('team is not open for joining', 'PERMISSION_DENIED');
    }
    const memberships = listMemberships(teamId);
    const existing = memberships.find((item) => item.agentId === actorAgentId);
    if (existing?.status === 'active') {
      return ok('already joined', {
        membership: membershipView(existing),
        team_summary: { team_id: team.id, name: team.name, status: team.status },
      }, 'ALREADY_JOINED');
    }
    if (asBoolean(input.dry_run)) return ok('team join validation passed', { team_id: teamId });
    const now = new Date().toISOString();
    const resolvedActor = resolveMembershipAgent({ agent_id: actorAgentId });
    if ('error' in resolvedActor) return resolvedActor.error;
    const membership: TeamMembership = existing
      ? { ...existing, agentStore: existing.agentStore ?? resolvedActor.agentStore, agent: existing.agent ?? resolvedActor.agent, status: 'active', updatedAt: now }
      : {
          id: uuid(),
          teamId,
          agentId: resolvedActor.agentId,
          agentStore: resolvedActor.agentStore,
          agent: resolvedActor.agent,
          role: 'member',
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        };
    const next = existing
      ? memberships.map((item) => item.agentId === actorAgentId ? membership : item)
      : [...memberships, membership];
    saveMemberships(teamId, next);
    const updatedTeam = updateTeamMemberCount(team);
    return ok('team joined', {
      membership: membershipView(membership),
      team_summary: { team_id: updatedTeam.id, name: updatedTeam.name, status: updatedTeam.status },
    });
  }

  if (action === 'invite') {
    const inviter = resolveEffectiveMembership(teamId, actorAgentId);
    if (!isManagerRole(inviter)) {
      return fail('only owner or admin can invite members', 'PERMISSION_DENIED');
    }
    if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');

    const target = resolveMembershipAgent({
      agent_id: input.agent_id ?? input.agentId ?? input.target_agent_id ?? input.targetAgentId,
      agent_store: input.agent_store ?? input.agentStore,
      agent: input.agent,
    });
    if ('error' in target) return target.error;

    const memberships = listMemberships(teamId);
    const existing = memberships.find((item) => item.agentId === target.agentId);
    if (existing?.status === 'active') {
      return ok('already invited', {
        membership: membershipView(existing),
        team_summary: { team_id: team.id, name: team.name, status: team.status },
      }, 'ALREADY_JOINED');
    }
    if (asBoolean(input.dry_run)) return ok('team invite validation passed', { team_id: teamId, agent_id: target.agentId });

    const now = new Date().toISOString();
    const invited: TeamMembership = existing
      ? {
          ...existing,
          agentStore: target.agentStore,
          agent: target.agent,
          role: parseRole(input.role),
          status: 'active',
          updatedAt: now,
        }
      : {
          id: uuid(),
          teamId,
          agentId: target.agentId,
          agentStore: target.agentStore,
          agent: target.agent,
          role: parseRole(input.role),
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        };
    const next = existing
      ? memberships.map((item) => item.agentId === target.agentId ? invited : item)
      : [...memberships, invited];
    saveMemberships(teamId, next);
    const updatedTeam = updateTeamMemberCount(team);
    return ok('team member invited', {
      membership: membershipView(invited),
      team_summary: { team_id: updatedTeam.id, name: updatedTeam.name, status: updatedTeam.status },
    });
  }

  if (action === 'leave') {
    const memberships = listMemberships(teamId);
    const existing = memberships.find((item) => item.agentId === actorAgentId);
    if (!existing || existing.status !== 'active') {
      return ok('already left', {
        membership: {
          membership_id: existing?.id ?? null,
          team_id: teamId,
          agent_id: actorAgentId,
          status: 'left',
          updated_at: new Date().toISOString(),
        },
      }, 'ALREADY_LEFT');
    }
    const activeOwners = memberships.filter((item) => item.status === 'active' && item.role === 'owner');
    if (existing.role === 'owner' && activeOwners.length === 1) {
      return fail('last owner cannot leave directly', 'PERMISSION_DENIED');
    }
    if (asBoolean(input.dry_run)) return ok('team leave validation passed', { team_id: teamId });
    const now = new Date().toISOString();
    const updated: TeamMembership = { ...existing, status: 'left', updatedAt: now };
    saveMemberships(teamId, memberships.map((item) => item.agentId === actorAgentId ? updated : item));
    updateTeamMemberCount(team);
    return ok('team left', {
      membership: {
        membership_id: updated.id,
        team_id: teamId,
        agent_id: actorAgentId,
        status: 'left',
        updated_at: now,
      },
    });
  }

  if (action === 'set_role') {
    const actor = resolveEffectiveMembership(teamId, actorAgentId);
    if (!isManagerRole(actor)) {
      return fail('only owner or admin can change member roles', 'PERMISSION_DENIED');
    }
    const targetAgentId = asString(input.agent_id ?? input.agentId ?? input.target_agent_id ?? input.targetAgentId);
    if (!targetAgentId) return fail('agent_id is required', 'INVALID_ARGUMENT');
    const newRole = parseRole(input.role);

    const memberships = listMemberships(teamId);
    const target = memberships.find((item) => item.agentId === targetAgentId);
    if (!target || target.status !== 'active') {
      return fail('target agent is not an active team member', 'AGENT_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const next = memberships.map((item) => {
      if (item.agentId === targetAgentId) return { ...item, role: newRole, updatedAt: now };
      // 转移 owner：新角色为 owner 时，把其它 active owner 降级为 admin（唯一 owner 语义）
      if (newRole === 'owner' && item.status === 'active' && item.role === 'owner') {
        return { ...item, role: 'admin' as TeamRole, updatedAt: now };
      }
      return item;
    });
    saveMemberships(teamId, next);
    const updated = next.find((item) => item.agentId === targetAgentId);
    return ok('member role updated', {
      membership: updated ? membershipView(updated) : null,
    });
  }

  if (action === 'update_agent') {
    const targetAgentId = asString(input.agent_id ?? input.agentId ?? input.target_agent_id ?? input.targetAgentId);
    if (!targetAgentId) return fail('agent_id is required', 'INVALID_ARGUMENT');
    if (!isObject(input.agent)) return fail('agent is required', 'INVALID_ARGUMENT');

    const memberships = listMemberships(teamId);
    const target = memberships.find((item) => item.agentId === targetAgentId);
    if (!target || target.status !== 'active') {
      return fail('target agent is not an active team member', 'AGENT_NOT_FOUND');
    }

    const now = new Date().toISOString();
    const updated: TeamMembership = {
      ...target,
      agentStore: 'custom',
      agent: {
        ...(target.agent ?? {}),
        ...input.agent,
        id: targetAgentId,
      },
      updatedAt: now,
    };
    saveMemberships(teamId, memberships.map((item) => item.agentId === targetAgentId ? updated : item));
    return ok('member agent updated', {
      membership: membershipView(updated),
    });
  }

  if (action === 'remove') {
    const actor = resolveEffectiveMembership(teamId, actorAgentId);
    if (!isManagerRole(actor)) {
      return fail('only owner or admin can remove members', 'PERMISSION_DENIED');
    }
    const targetAgentId = asString(input.agent_id ?? input.agentId ?? input.target_agent_id ?? input.targetAgentId);
    if (!targetAgentId) return fail('agent_id is required', 'INVALID_ARGUMENT');

    const memberships = listMemberships(teamId);
    const target = memberships.find((item) => item.agentId === targetAgentId);
    if (!target || target.status !== 'active') {
      return ok('already removed', {
        membership: {
          membership_id: target?.id ?? null,
          team_id: teamId,
          agent_id: targetAgentId,
          status: 'removed',
          updated_at: new Date().toISOString(),
        },
      }, 'ALREADY_LEFT');
    }
    const activeOwners = memberships.filter((item) => item.status === 'active' && item.role === 'owner');
    if (target.role === 'owner' && activeOwners.length === 1) {
      return fail('last owner cannot be removed', 'PERMISSION_DENIED');
    }

    const now = new Date().toISOString();
    // 直接从成员列表中移除，不再保留 removed 记录
    saveMemberships(teamId, memberships.filter((item) => item.agentId !== targetAgentId));
    updateTeamMemberCount(team);
    return ok('team member removed', {
      membership: {
        membership_id: target.id,
        team_id: teamId,
        agent_id: targetAgentId,
        status: 'removed',
        updated_at: now,
      },
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}
