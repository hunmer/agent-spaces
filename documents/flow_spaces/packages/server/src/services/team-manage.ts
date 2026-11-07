import { v4 as uuid } from 'uuid';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureDir, writeJsonFile } from '../storage/json-store.js';
import type { JsonMap, Team, TeamMembership, TeamServiceResult } from './team-types.js';
import {
  archivedTeamDataDir,
  asArray,
  asBoolean,
  asSessionId,
  asString,
  fail,
  isObject,
  isManagerRole,
  listArchivedTeamIds,
  listArchivedTeamsRaw,
  listDeliveries,
  listMemberships,
  listMessages,
  listTeamIds,
  listTeamsRaw,
  loadArchivedTeam,
  loadTeam,
  membershipView,
  nextPageToken,
  ok,
  parsePage,
  parseRole,
  parseVisibility,
  resolveEffectiveMembership,
  resolveMembershipAgent,
  saveMemberships,
  saveTeam,
  saveTeamIds,
  teamDataDir,
  teamDir,
  teamFilePath,
  teamView,
} from './team-internal.js';

export function handleTeamManage(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId) ?? '';
  // 归档清理操作、列表查询不需要 actor
  const noActorRequired = action === 'delete_archive' || action === 'clear_archives' || action === 'list';
  if (!action || (!noActorRequired && !actorAgentId)) {
    return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');
  }

  if (action === 'create') {
    const name = asString(input.name);
    if (!name) return fail('name is required', 'INVALID_ARGUMENT');
    if (asBoolean(input.dry_run)) return ok('team create validation passed', { team: { name } });

    const now = new Date().toISOString();
    const initialMembers = asArray<JsonMap>(input.initial_members ?? input.initialMembers);
    const requestedOwner = initialMembers.find((item) => parseRole(item?.role) === 'owner');
    const ownerAgent = resolveMembershipAgent(requestedOwner ?? { agent_id: actorAgentId });
    if ('error' in ownerAgent) return ownerAgent.error;
    const team: Team = {
      id: uuid(),
      name,
      description: asString(input.description) ?? '',
      purpose: asString(input.purpose),
      icon: asString(input.icon) || undefined,
      avatarUrl: asString(input.avatar_url ?? input.avatarUrl) || undefined,
      status: 'active',
      visibility: parseVisibility(input.visibility),
      createdBy: ownerAgent.agentId,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
      metadata: isObject(input.metadata) ? input.metadata : undefined,
    };
    const memberships: TeamMembership[] = [{
      id: uuid(),
      teamId: team.id,
      agentId: ownerAgent.agentId,
      agentStore: ownerAgent.agentStore,
      agent: ownerAgent.agent,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      updatedAt: now,
    }];
    for (const item of initialMembers) {
      const resolved = resolveMembershipAgent(item);
      if ('error' in resolved) return resolved.error;
      if (memberships.some((membership) => membership.agentId === resolved.agentId)) continue;
      memberships.push({
        id: uuid(),
        teamId: team.id,
        agentId: resolved.agentId,
        agentStore: resolved.agentStore,
        agent: resolved.agent,
        role: parseRole(item?.role),
        status: 'active',
        joinedAt: now,
        updatedAt: now,
      });
    }
    team.memberCount = memberships.length;
    saveTeam(team);
    saveMemberships(team.id, memberships);
    return ok('team created', {
      team: teamView(team, actorAgentId),
      memberships_created: memberships.map((item) => membershipView(item)),
    });
  }

  if (action === 'list') {
    const archivedOnly = asBoolean(input.archived);
    const allTeams = (archivedOnly ? listArchivedTeamsRaw() : listTeamsRaw())
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const includeMembersPreview = asBoolean(input.include_members_preview ?? input.includeMembersPreview);
    const { size, offset } = parsePage(input);
    const page = allTeams.slice(offset, offset + size).map((team) => {
      const view = teamView(team, actorAgentId);
      if (includeMembersPreview) {
        (view as ReturnType<typeof teamView> & { members_preview?: ReturnType<typeof membershipView>[] }).members_preview =
          listMemberships(team.id)
            .filter((item) => item.status === 'active')
            .slice(0, 5)
            .map((item) => membershipView(item));
      }
      return view;
    });
    return ok('teams listed', {
      teams: page,
      next_page_token: nextPageToken(allTeams.length, offset, size),
    });
  }

  if (action === 'get') {
    const teamId = asString(input.team_id ?? input.teamId);
    const sessionId = asSessionId(input.session_id ?? input.sessionId);
    if ((input.session_id ?? input.sessionId) !== undefined && !sessionId) return fail('session_id must be a UUID', 'INVALID_ARGUMENT');
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const deliveries = listDeliveries(teamId);
    const memberships = listMemberships(teamId);
    const messages = listMessages(teamId);
    return ok('team loaded', {
      team: teamView(team, actorAgentId),
      members_preview: asBoolean(input.include_members_preview ?? input.includeMembersPreview)
        ? memberships.filter((item) => item.status === 'active').slice(0, 20).map((item) => membershipView(item, sessionId))
        : undefined,
      stats: {
        unread_count: deliveries.filter((item) => item.recipientAgentId === actorAgentId && item.inboxStatus === 'unread').length,
        active_member_count: memberships.filter((item) => item.status === 'active').length,
        last_activity_at: messages.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0]?.sentAt ?? null,
      },
    });
  }

  if (action === 'update') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const membership = resolveEffectiveMembership(teamId, actorAgentId);
    if (!isManagerRole(membership)) {
      return fail('only owner or admin can update team', 'PERMISSION_DENIED');
    }
    if (team.status === 'dissolved') return fail('team already dissolved', 'TEAM_DISSOLVED');

    const hasName = Object.prototype.hasOwnProperty.call(input, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
    const hasPurpose = Object.prototype.hasOwnProperty.call(input, 'purpose');
    const hasVisibility = Object.prototype.hasOwnProperty.call(input, 'visibility');
    const hasMetadata = Object.prototype.hasOwnProperty.call(input, 'metadata');
    const hasIcon = Object.prototype.hasOwnProperty.call(input, 'icon');
    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(input, 'avatar_url') || Object.prototype.hasOwnProperty.call(input, 'avatarUrl');
    const nextName = asString(input.name);
    if (hasName && !nextName) return fail('name cannot be empty', 'INVALID_ARGUMENT');
    if (!hasName && !hasDescription && !hasPurpose && !hasVisibility && !hasMetadata && !hasIcon && !hasAvatarUrl) {
      return fail('at least one update field is required', 'INVALID_ARGUMENT');
    }
    if (asBoolean(input.dry_run)) return ok('team update validation passed', { team_id: teamId });

    const now = new Date().toISOString();
    const next: Team = {
      ...team,
      name: hasName ? nextName! : team.name,
      description: hasDescription ? asString(input.description) ?? '' : team.description,
      purpose: hasPurpose ? (asString(input.purpose) || undefined) : team.purpose,
      icon: hasIcon ? (asString(input.icon) || undefined) : team.icon,
      avatarUrl: hasAvatarUrl ? (asString(input.avatar_url ?? input.avatarUrl) || undefined) : team.avatarUrl,
      visibility: hasVisibility ? parseVisibility(input.visibility) : team.visibility,
      metadata: hasMetadata ? (isObject(input.metadata) ? input.metadata : undefined) : team.metadata,
      updatedAt: now,
    };
    saveTeam(next);
    return ok('team updated', {
      team: teamView(next, actorAgentId),
    });
  }

  if (action === 'dissolve') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const membership = resolveEffectiveMembership(teamId, actorAgentId);
    if (!isManagerRole(membership)) return fail('only owner or admin can dissolve team', 'PERMISSION_DENIED');
    if (!asBoolean(input.confirm)) return fail('confirm must be true', 'INVALID_ARGUMENT');
    if (team.status === 'dissolved') return fail('team already dissolved', 'TEAM_DISSOLVED');
    if (asBoolean(input.dry_run)) return ok('team dissolve validation passed', { team_id: teamId });
    const now = new Date().toISOString();
    const next: Team = { ...team, status: 'dissolved', dissolvedAt: now, updatedAt: now };
    // 先写入新状态，再移动整个团队目录到 archived/{teamId}，最后从活跃索引移除
    saveTeam(next);
    const srcDir = teamDataDir(teamId);
    const destDir = archivedTeamDataDir(teamId);
    if (existsSync(srcDir)) {
      ensureDir(dirname(destDir));
      // 若归档目录已存在（异常残留），先清理避免 rename 失败
      if (existsSync(destDir)) {
        renameSync(destDir, `${destDir}.${Date.now()}.bak`);
      }
      renameSync(srcDir, destDir);
    }
    // 从 teams.json 索引移除（归档团队不再出现在活跃列表）
    saveTeamIds(listTeamIds().filter((id) => id !== teamId));
    return ok('team dissolved', {
      team_id: teamId,
      status: 'dissolved',
      dissolved_at: now,
    });
  }

  if (action === 'delete_archive') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    // 优先按目录名匹配，再按 info.json 内的 id 匹配（兼容目录名与 id 不一致的情况）
    let targetDir: string | null = existsSync(archivedTeamDataDir(teamId)) ? archivedTeamDataDir(teamId) : null;
    if (!targetDir) {
      const matched = listArchivedTeamIds().find((id) => {
        const t = loadArchivedTeam(id);
        return t?.id === teamId;
      });
      if (matched) targetDir = archivedTeamDataDir(matched);
    }
    if (targetDir) rmSync(targetDir, { recursive: true, force: true });
    // 幂等：目录不存在也视为成功，避免陈旧列表报错
    return ok('archived team deleted', { team_id: teamId });
  }

  if (action === 'clear_archives') {
    const dir = join(teamDir(), 'archived');
    if (!existsSync(dir)) return ok('no archives to clear', { cleared: 0 });
    const before = listArchivedTeamIds();
    rmSync(dir, { recursive: true, force: true });
    return ok('archives cleared', { cleared: before.length });
  }

  if (action === 'restore_archive') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    // 归档目录：优先按目录名匹配，再按 info.json 内 id 匹配
    let archivedDir: string | null = existsSync(archivedTeamDataDir(teamId)) ? archivedTeamDataDir(teamId) : null;
    let archiveKey = teamId;
    if (!archivedDir) {
      const matched = listArchivedTeamIds().find((id) => {
        const t = loadArchivedTeam(id);
        return t?.id === teamId;
      });
      if (matched) {
        archivedDir = archivedTeamDataDir(matched);
        archiveKey = matched;
      }
    }
    if (!archivedDir) return fail('archived team not found', 'TEAM_NOT_FOUND');
    const archivedTeam = loadArchivedTeam(archiveKey);
    if (!archivedTeam) return fail('archived team not found', 'TEAM_NOT_FOUND');
    const now = new Date().toISOString();
    const restored: Team = { ...archivedTeam, status: 'active', updatedAt: now };
    delete (restored as Partial<Team>).dissolvedAt;
    const destDir = teamDataDir(restored.id);
    // 若活跃目录已存在（异常残留），先备份避免 rename 失败
    if (existsSync(destDir)) {
      renameSync(destDir, `${destDir}.${Date.now()}.bak`);
    }
    ensureDir(dirname(destDir));
    renameSync(archivedDir, destDir);
    // 写入恢复后的状态并加入活跃索引
    writeJsonFile(teamFilePath(restored.id), restored);
    const ids = listTeamIds();
    if (!ids.includes(restored.id)) saveTeamIds([...ids, restored.id]);
    return ok('archived team restored', {
      team: teamView(restored, asString(input.actor_agent_id ?? input.actorAgentId)),
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}
