import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import { getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';

type JsonMap = Record<string, unknown>;
type TeamStatus = 'active' | 'archived' | 'dissolved';
type TeamVisibility = 'private' | 'open';
type TeamRole = 'owner' | 'admin' | 'member' | 'observer';
type TeamMembershipStatus = 'active' | 'left' | 'removed' | 'suspended';
type TeamMessageType = 'direct' | 'broadcast';
type TeamBodyFormat = 'plain_text' | 'markdown' | 'structured_text';
type TeamPriority = 'low' | 'normal' | 'high' | 'urgent';
type TeamInboxStatus = 'unread' | 'read' | 'archived';
type TeamExecutionStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'ignored';
type TeamCommentVisibility = 'team' | 'participants' | 'private';
type TeamCommentContentFormat = 'plain_text' | 'markdown';

interface Team {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  purpose?: string;
  status: TeamStatus;
  visibility: TeamVisibility;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dissolvedAt?: string;
  memberCount: number;
  metadata?: Record<string, unknown>;
}

interface TeamMembership {
  id: string;
  workspaceId: string;
  teamId: string;
  agentId: string;
  role: TeamRole;
  status: TeamMembershipStatus;
  joinedAt: string;
  updatedAt: string;
}

interface TeamMessage {
  id: string;
  workspaceId: string;
  teamId: string;
  senderAgentId: string;
  messageType: TeamMessageType;
  subject: string;
  body: string;
  bodyFormat: TeamBodyFormat;
  priority: TeamPriority;
  requiresAck: boolean;
  requiresAction: boolean;
  dueAt: string | null;
  threadId: string | null;
  replyToMessageId: string | null;
  createdAt: string;
  sentAt: string;
  recipientCount: number;
  metadata?: Record<string, unknown>;
}

interface TeamInboxItem {
  id: string;
  workspaceId: string;
  teamId: string;
  messageId: string;
  recipientAgentId: string;
  senderAgentId: string;
  subject: string;
  preview: string;
  messageType: TeamMessageType;
  inboxStatus: TeamInboxStatus;
  executionStatus: TeamExecutionStatus;
  priority: TeamPriority;
  requiresAck: boolean;
  requiresAction: boolean;
  dueAt: string | null;
  sentAt: string;
  readAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  unreadCommentCount: number;
  version: number;
  updatedAt: string;
}

interface TeamMessageComment {
  id: string;
  workspaceId: string;
  teamId: string;
  messageId: string;
  authorAgentId: string;
  content: string;
  contentFormat: TeamCommentContentFormat;
  visibility: TeamCommentVisibility;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy?: string;
  deleteReason?: string;
}

export interface TeamServiceResult<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data?: T;
  warnings?: string[];
}

function ok<T>(message: string, data?: T, code = 'OK', warnings?: string[]): TeamServiceResult<T> {
  return { success: true, code, message, data, ...(warnings?.length ? { warnings } : {}) };
}

function fail(message: string, code: string): TeamServiceResult<never> {
  return { success: false, code, message };
}

function teamDir(workspaceId: string): string {
  return join(getDataDir(), 'workspaces', workspaceId, 'teams');
}

function teamIndexPath(workspaceId: string): string {
  return join(teamDir(workspaceId), 'index.json');
}

function teamFilePath(workspaceId: string, teamId: string): string {
  return join(teamDir(workspaceId), `${teamId}.json`);
}

function teamMembershipsPath(workspaceId: string, teamId: string): string {
  return join(teamDir(workspaceId), `${teamId}.memberships.json`);
}

function teamMessagesPath(workspaceId: string, teamId: string): string {
  return join(teamDir(workspaceId), `${teamId}.messages.json`);
}

function teamDeliveriesPath(workspaceId: string, teamId: string): string {
  return join(teamDir(workspaceId), `${teamId}.deliveries.json`);
}

function teamCommentsPath(workspaceId: string, teamId: string): string {
  return join(teamDir(workspaceId), `${teamId}.comments.json`);
}

function listTeamIds(workspaceId: string): string[] {
  return readJsonFile<string[]>(teamIndexPath(workspaceId)) ?? [];
}

function saveTeamIds(workspaceId: string, ids: string[]): void {
  writeJsonFile(teamIndexPath(workspaceId), Array.from(new Set(ids)));
}

function listTeamsRaw(workspaceId: string): Team[] {
  return listTeamIds(workspaceId)
    .map((teamId) => readJsonFile<Team>(teamFilePath(workspaceId, teamId)))
    .filter((team): team is Team => Boolean(team));
}

function saveTeam(team: Team): void {
  const ids = listTeamIds(team.workspaceId);
  if (!ids.includes(team.id)) saveTeamIds(team.workspaceId, [...ids, team.id]);
  writeJsonFile(teamFilePath(team.workspaceId, team.id), team);
}

function loadTeam(workspaceId: string, teamId: string): Team | null {
  return readJsonFile<Team>(teamFilePath(workspaceId, teamId));
}

function listMemberships(workspaceId: string, teamId: string): TeamMembership[] {
  return readJsonFile<TeamMembership[]>(teamMembershipsPath(workspaceId, teamId)) ?? [];
}

function saveMemberships(workspaceId: string, teamId: string, items: TeamMembership[]): void {
  writeJsonFile(teamMembershipsPath(workspaceId, teamId), items);
}

function listMessages(workspaceId: string, teamId: string): TeamMessage[] {
  return readJsonFile<TeamMessage[]>(teamMessagesPath(workspaceId, teamId)) ?? [];
}

function saveMessages(workspaceId: string, teamId: string, items: TeamMessage[]): void {
  writeJsonFile(teamMessagesPath(workspaceId, teamId), items);
}

function listDeliveries(workspaceId: string, teamId: string): TeamInboxItem[] {
  return readJsonFile<TeamInboxItem[]>(teamDeliveriesPath(workspaceId, teamId)) ?? [];
}

function saveDeliveries(workspaceId: string, teamId: string, items: TeamInboxItem[]): void {
  writeJsonFile(teamDeliveriesPath(workspaceId, teamId), items);
}

function listCommentsRaw(workspaceId: string, teamId: string): TeamMessageComment[] {
  return readJsonFile<TeamMessageComment[]>(teamCommentsPath(workspaceId, teamId)) ?? [];
}

function saveComments(workspaceId: string, teamId: string, items: TeamMessageComment[]): void {
  writeJsonFile(teamCommentsPath(workspaceId, teamId), items);
}

function isObject(input: unknown): input is JsonMap {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

function asString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

function asBoolean(input: unknown, fallback = false): boolean {
  return typeof input === 'boolean' ? input : fallback;
}

function asArray<T = unknown>(input: unknown): T[] {
  return Array.isArray(input) ? input as T[] : [];
}

function parsePage(input: JsonMap): { size: number; offset: number } {
  const rawSize = typeof input.page_size === 'number' ? input.page_size : typeof input.pageSize === 'number' ? input.pageSize : 20;
  const size = Math.max(1, Math.min(100, Math.floor(rawSize)));
  const token = asString(input.page_token ?? input.pageToken);
  const offset = token ? Math.max(0, parseInt(token, 10) || 0) : 0;
  return { size, offset };
}

function nextPageToken(total: number, offset: number, size: number): string | null {
  return offset + size < total ? String(offset + size) : null;
}

function previewText(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function isActiveMembership(item: TeamMembership | undefined | null): item is TeamMembership {
  return item != null && item.status === 'active';
}

function getMembership(workspaceId: string, teamId: string, agentId: string): TeamMembership | undefined {
  return listMemberships(workspaceId, teamId).find((item) => item.agentId === agentId);
}

function getActiveMembership(workspaceId: string, teamId: string, agentId: string): TeamMembership | undefined {
  const membership = getMembership(workspaceId, teamId, agentId);
  return isActiveMembership(membership) ? membership : undefined;
}

function activeMemberships(workspaceId: string, teamId: string): TeamMembership[] {
  return listMemberships(workspaceId, teamId).filter((item) => item.status === 'active');
}

function updateTeamMemberCount(team: Team): Team {
  const next = { ...team, memberCount: activeMemberships(team.workspaceId, team.id).length, updatedAt: new Date().toISOString() };
  saveTeam(next);
  return next;
}

function parseVisibility(input: unknown): TeamVisibility {
  return input === 'open' ? 'open' : 'private';
}

function parseRole(input: unknown): TeamRole {
  return input === 'owner' || input === 'admin' || input === 'observer' ? input : 'member';
}

function parseBodyFormat(input: unknown): TeamBodyFormat {
  return input === 'markdown' || input === 'structured_text' ? input : 'plain_text';
}

function parsePriority(input: unknown): TeamPriority {
  return input === 'low' || input === 'high' || input === 'urgent' ? input : 'normal';
}

function parseInboxStatus(input: unknown): TeamInboxStatus | undefined {
  return input === 'unread' || input === 'read' || input === 'archived' ? input : undefined;
}

function parseExecutionStatus(input: unknown): TeamExecutionStatus | undefined {
  return input === 'pending' || input === 'in_progress' || input === 'done' || input === 'failed' || input === 'ignored'
    ? input
    : undefined;
}

function parseCommentVisibility(input: unknown): TeamCommentVisibility {
  return input === 'participants' || input === 'private' ? input : 'team';
}

function parseCommentFormat(input: unknown): TeamCommentContentFormat {
  return input === 'markdown' ? 'markdown' : 'plain_text';
}

function teamView(team: Team, actorAgentId?: string) {
  const membership = actorAgentId ? getActiveMembership(team.workspaceId, team.id, actorAgentId) : undefined;
  return {
    ...team,
    team_id: team.id,
    created_by: team.createdBy,
    created_at: team.createdAt,
    member_count: team.memberCount,
    my_role: membership?.role ?? null,
  };
}

function membershipView(item: TeamMembership) {
  return {
    ...item,
    membership_id: item.id,
    team_id: item.teamId,
    agent_id: item.agentId,
    joined_at: item.joinedAt,
    updated_at: item.updatedAt,
  };
}

function messageView(item: TeamMessage) {
  return {
    ...item,
    message_id: item.id,
    team_id: item.teamId,
    sender_agent_id: item.senderAgentId,
    message_type: item.messageType,
    body_format: item.bodyFormat,
    requires_ack: item.requiresAck,
    requires_action: item.requiresAction,
    due_at: item.dueAt,
    thread_id: item.threadId,
    reply_to_message_id: item.replyToMessageId,
    created_at: item.createdAt,
    sent_at: item.sentAt,
    recipient_count: item.recipientCount,
  };
}

function inboxView(item: TeamInboxItem) {
  return {
    ...item,
    delivery_id: item.id,
    message_id: item.messageId,
    team_id: item.teamId,
    recipient_agent_id: item.recipientAgentId,
    sender_agent_id: item.senderAgentId,
    message_type: item.messageType,
    inbox_status: item.inboxStatus,
    execution_status: item.executionStatus,
    requires_ack: item.requiresAck,
    requires_action: item.requiresAction,
    due_at: item.dueAt,
    sent_at: item.sentAt,
    read_at: item.readAt,
    completed_at: item.completedAt,
    failed_at: item.failedAt,
    failure_reason: item.failureReason,
    unread_comment_count: item.unreadCommentCount,
  };
}

function commentView(item: TeamMessageComment) {
  return {
    ...item,
    comment_id: item.id,
    team_id: item.teamId,
    message_id: item.messageId,
    author_agent_id: item.authorAgentId,
    content_format: item.contentFormat,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    deleted_at: item.deletedAt,
  };
}

function canViewTeam(team: Team, actorAgentId: string): boolean {
  return team.visibility === 'open' || Boolean(getActiveMembership(team.workspaceId, team.id, actorAgentId));
}

function getTeamOrFail(workspaceId: string, teamId: string): TeamServiceResult<Team> {
  const team = loadTeam(workspaceId, teamId);
  return team ? ok('team loaded', team) : fail('team not found', 'TEAM_NOT_FOUND');
}

function resolveRecipients(
  workspaceId: string,
  teamId: string,
  mode: 'direct' | 'broadcast',
  input: JsonMap,
  senderId: string,
): TeamServiceResult<{ includedAgentIds: string[]; excludedAgentIds: string[]; warnings: string[] }> {
  const active = activeMemberships(workspaceId, teamId);
  const activeByAgentId = new Map(active.map((item) => [item.agentId, item]));
  const includeSender = asBoolean(input.include_sender);
  const requestedIds = asArray<string>(input.recipient_agent_ids ?? input.recipientAgentIds)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));
  const requestedRoles = new Set(
    asArray<string>(input.recipient_roles ?? input.recipientRoles)
      .map((item) => asString(item))
      .filter((item): item is TeamRole => item === 'owner' || item === 'admin' || item === 'member' || item === 'observer'),
  );

  if (mode === 'direct' && requestedIds.length === 0) {
    return fail('recipient_agent_ids is required for direct messages', 'INVALID_ARGUMENT');
  }

  const included = new Set<string>();
  if (mode === 'direct') {
    for (const agentId of requestedIds) {
      if (activeByAgentId.has(agentId)) included.add(agentId);
    }
  } else {
    if (requestedIds.length === 0 && requestedRoles.size === 0) {
      for (const item of active) included.add(item.agentId);
    } else {
      for (const agentId of requestedIds) {
        if (activeByAgentId.has(agentId)) included.add(agentId);
      }
      for (const item of active) {
        if (requestedRoles.has(item.role)) included.add(item.agentId);
      }
    }
  }

  if (!includeSender) included.delete(senderId);
  const excludedAgentIds = requestedIds.filter((agentId) => !included.has(agentId));
  if (included.size === 0) {
    return fail('no active recipients resolved', 'INVALID_ARGUMENT');
  }

  return ok('recipients resolved', {
    includedAgentIds: [...included],
    excludedAgentIds,
    warnings: excludedAgentIds.length ? ['some recipients were not active team members'] : [],
  });
}

function findDeliveryContext(workspaceId: string, deliveryId: string): { team: Team; delivery: TeamInboxItem; deliveries: TeamInboxItem[] } | null {
  for (const team of listTeamsRaw(workspaceId)) {
    const deliveries = listDeliveries(workspaceId, team.id);
    const delivery = deliveries.find((item) => item.id === deliveryId);
    if (delivery) return { team, delivery, deliveries };
  }
  return null;
}

function findMessageContext(workspaceId: string, messageId: string): { team: Team; message: TeamMessage; messages: TeamMessage[] } | null {
  for (const team of listTeamsRaw(workspaceId)) {
    const messages = listMessages(workspaceId, team.id);
    const message = messages.find((item) => item.id === messageId);
    if (message) return { team, message, messages };
  }
  return null;
}

function findCommentContext(workspaceId: string, commentId: string): { team: Team; comment: TeamMessageComment; comments: TeamMessageComment[] } | null {
  for (const team of listTeamsRaw(workspaceId)) {
    const comments = listCommentsRaw(workspaceId, team.id);
    const comment = comments.find((item) => item.id === commentId);
    if (comment) return { team, comment, comments };
  }
  return null;
}

function canAccessMessage(workspaceId: string, messageId: string, actorAgentId: string): boolean {
  const ctx = findMessageContext(workspaceId, messageId);
  if (!ctx) return false;
  if (ctx.message.senderAgentId === actorAgentId) return true;
  return Boolean(getActiveMembership(workspaceId, ctx.team.id, actorAgentId));
}

function applyDeliveryStatusRules(current: TeamInboxItem, nextInboxStatus?: TeamInboxStatus, nextExecutionStatus?: TeamExecutionStatus): TeamServiceResult {
  const allowedInbox = new Map<TeamInboxStatus, TeamInboxStatus[]>([
    ['unread', ['read']],
    ['read', ['unread', 'archived']],
    ['archived', ['read']],
  ]);
  const allowedExecution = new Map<TeamExecutionStatus, TeamExecutionStatus[]>([
    ['pending', ['in_progress', 'done', 'failed', 'ignored']],
    ['in_progress', ['done', 'failed', 'ignored']],
    ['done', ['in_progress']],
    ['failed', ['in_progress']],
    ['ignored', ['in_progress']],
  ]);
  if (nextInboxStatus && nextInboxStatus !== current.inboxStatus && !allowedInbox.get(current.inboxStatus)?.includes(nextInboxStatus)) {
    return fail('invalid inbox status transition', 'INVALID_STATUS_TRANSITION');
  }
  if (nextExecutionStatus && nextExecutionStatus !== current.executionStatus && !allowedExecution.get(current.executionStatus)?.includes(nextExecutionStatus)) {
    return fail('invalid execution status transition', 'INVALID_STATUS_TRANSITION');
  }
  return ok('status transition allowed');
}

export function handleTeamManage(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'create') {
    const name = asString(input.name);
    if (!name) return fail('name is required', 'INVALID_ARGUMENT');
    if (asBoolean(input.dry_run)) return ok('team create validation passed', { team: { name } });

    const now = new Date().toISOString();
    const team: Team = {
      id: uuid(),
      workspaceId,
      name,
      description: asString(input.description) ?? '',
      purpose: asString(input.purpose),
      status: 'active',
      visibility: parseVisibility(input.visibility),
      createdBy: actorAgentId,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
      metadata: isObject(input.metadata) ? input.metadata : undefined,
    };
    const memberships: TeamMembership[] = [{
      id: uuid(),
      workspaceId,
      teamId: team.id,
      agentId: actorAgentId,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      updatedAt: now,
    }];
    for (const item of asArray<JsonMap>(input.initial_members ?? input.initialMembers)) {
      const agentId = asString(item?.agent_id ?? item?.agentId);
      if (!agentId || agentId === actorAgentId || memberships.some((membership) => membership.agentId === agentId)) continue;
      memberships.push({
        id: uuid(),
        workspaceId,
        teamId: team.id,
        agentId,
        role: parseRole(item?.role),
        status: 'active',
        joinedAt: now,
        updatedAt: now,
      });
    }
    team.memberCount = memberships.length;
    saveTeam(team);
    saveMemberships(workspaceId, team.id, memberships);
    saveMessages(workspaceId, team.id, []);
    saveDeliveries(workspaceId, team.id, []);
    saveComments(workspaceId, team.id, []);
    return ok('team created', {
      team: teamView(team, actorAgentId),
      memberships_created: memberships.map(membershipView),
    });
  }

  if (action === 'list') {
    const allTeams = listTeamsRaw(workspaceId)
      .filter((team) => {
        const scope = asString(input.scope) ?? 'mine';
        if (scope === 'visible') return canViewTeam(team, actorAgentId);
        return Boolean(getActiveMembership(workspaceId, team.id, actorAgentId));
      })
      .filter((team) => {
        const statusFilter = new Set(
          asArray<string>(input.status_filter ?? input.statusFilter)
            .map((item) => asString(item))
            .filter((item): item is string => Boolean(item)),
        );
        return statusFilter.size === 0 || statusFilter.has(team.status);
      })
      .filter((team) => {
        const keyword = asString(input.keyword)?.toLowerCase();
        if (!keyword) return true;
        return team.name.toLowerCase().includes(keyword) || team.description.toLowerCase().includes(keyword);
      })
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const { size, offset } = parsePage(input);
    const page = allTeams.slice(offset, offset + size).map((team) => teamView(team, actorAgentId));
    return ok('teams listed', {
      teams: page,
      next_page_token: nextPageToken(allTeams.length, offset, size),
    });
  }

  if (action === 'get') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(workspaceId, teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    if (!canViewTeam(team, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const deliveries = listDeliveries(workspaceId, teamId);
    const memberships = listMemberships(workspaceId, teamId);
    const messages = listMessages(workspaceId, teamId);
    return ok('team loaded', {
      team: teamView(team, actorAgentId),
      members_preview: asBoolean(input.include_members_preview ?? input.includeMembersPreview)
        ? memberships.filter((item) => item.status === 'active').slice(0, 20).map(membershipView)
        : undefined,
      stats: {
        unread_count: deliveries.filter((item) => item.recipientAgentId === actorAgentId && item.inboxStatus === 'unread').length,
        active_member_count: memberships.filter((item) => item.status === 'active').length,
        last_activity_at: messages.sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0]?.sentAt ?? null,
      },
    });
  }

  if (action === 'dissolve') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(workspaceId, teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const membership = getActiveMembership(workspaceId, teamId, actorAgentId);
    if (!membership || membership.role !== 'owner') return fail('only owner can dissolve team', 'PERMISSION_DENIED');
    if (!asBoolean(input.confirm)) return fail('confirm must be true', 'INVALID_ARGUMENT');
    if (team.status === 'dissolved') return fail('team already dissolved', 'TEAM_DISSOLVED');
    if (asBoolean(input.dry_run)) return ok('team dissolve validation passed', { team_id: teamId });
    const now = new Date().toISOString();
    const next: Team = { ...team, status: 'dissolved', dissolvedAt: now, updatedAt: now };
    saveTeam(next);
    return ok('team dissolved', {
      team_id: teamId,
      status: 'dissolved',
      dissolved_at: now,
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}

export function handleTeamMembershipManage(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  if (!action || !actorAgentId || !teamId) return fail('action, actor_agent_id, team_id are required', 'INVALID_ARGUMENT');
  const team = loadTeam(workspaceId, teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');

  if (action === 'join') {
    if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');
    if (team.visibility !== 'open' && !getActiveMembership(workspaceId, teamId, actorAgentId)) {
      return fail('team is not open for joining', 'PERMISSION_DENIED');
    }
    const memberships = listMemberships(workspaceId, teamId);
    const existing = memberships.find((item) => item.agentId === actorAgentId);
    if (existing?.status === 'active') {
      return ok('already joined', {
        membership: membershipView(existing),
        team_summary: { team_id: team.id, name: team.name, status: team.status },
      }, 'ALREADY_JOINED');
    }
    if (asBoolean(input.dry_run)) return ok('team join validation passed', { team_id: teamId });
    const now = new Date().toISOString();
    const membership: TeamMembership = existing
      ? { ...existing, status: 'active', updatedAt: now }
      : {
          id: uuid(),
          workspaceId,
          teamId,
          agentId: actorAgentId,
          role: 'member',
          status: 'active',
          joinedAt: now,
          updatedAt: now,
        };
    const next = existing
      ? memberships.map((item) => item.agentId === actorAgentId ? membership : item)
      : [...memberships, membership];
    saveMemberships(workspaceId, teamId, next);
    const updatedTeam = updateTeamMemberCount(team);
    return ok('team joined', {
      membership: membershipView(membership),
      team_summary: { team_id: updatedTeam.id, name: updatedTeam.name, status: updatedTeam.status },
    });
  }

  if (action === 'leave') {
    const memberships = listMemberships(workspaceId, teamId);
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
    saveMemberships(workspaceId, teamId, memberships.map((item) => item.agentId === actorAgentId ? updated : item));
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

  return fail('invalid action', 'INVALID_ACTION');
}

export function handleTeamMessageSend(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  const action = asString(input.action);
  if (!actorAgentId || !teamId || !action) return fail('action, actor_agent_id, team_id are required', 'INVALID_ARGUMENT');
  if (action !== 'send') return fail('invalid action', 'INVALID_ACTION');

  const team = loadTeam(workspaceId, teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');
  if (!getActiveMembership(workspaceId, teamId, actorAgentId)) return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');

  const mode = (asString(input.mode) === 'broadcast' ? 'broadcast' : 'direct') as 'direct' | 'broadcast';
  const subject = asString(input.subject);
  const body = asString(input.body);
  if (!subject || !body) return fail('subject and body are required', 'INVALID_ARGUMENT');
  const dueAt = asString(input.due_at ?? input.dueAt) ?? null;
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return fail('due_at must be a valid datetime', 'INVALID_ARGUMENT');
  const recipientsResult = resolveRecipients(workspaceId, teamId, mode, input, actorAgentId);
  if (!recipientsResult.success || !recipientsResult.data) return recipientsResult;
  if (asBoolean(input.dry_run)) return ok('message send validation passed', recipientsResult.data);

  const now = new Date().toISOString();
  const message: TeamMessage = {
    id: uuid(),
    workspaceId,
    teamId,
    senderAgentId: actorAgentId,
    messageType: mode,
    subject,
    body,
    bodyFormat: parseBodyFormat(input.body_format ?? input.bodyFormat),
    priority: parsePriority(input.priority),
    requiresAck: asBoolean(input.requires_ack ?? input.requiresAck),
    requiresAction: asBoolean(input.requires_action ?? input.requiresAction),
    dueAt,
    threadId: asString(input.thread_id ?? input.threadId) ?? null,
    replyToMessageId: asString(input.reply_to_message_id ?? input.replyToMessageId) ?? null,
    createdAt: now,
    sentAt: now,
    recipientCount: recipientsResult.data.includedAgentIds.length,
    metadata: isObject(input.metadata) ? input.metadata : undefined,
  };
  const deliveries = listDeliveries(workspaceId, teamId);
  const nextDeliveries = [
    ...deliveries,
    ...recipientsResult.data.includedAgentIds.map((recipientAgentId) => ({
      id: uuid(),
      workspaceId,
      teamId,
      messageId: message.id,
      recipientAgentId,
      senderAgentId: actorAgentId,
      subject,
      preview: previewText(body),
      messageType: mode,
      inboxStatus: 'unread' as TeamInboxStatus,
      executionStatus: 'pending' as TeamExecutionStatus,
      priority: message.priority,
      requiresAck: message.requiresAck,
      requiresAction: message.requiresAction,
      dueAt: message.dueAt,
      sentAt: now,
      readAt: null,
      completedAt: null,
      failedAt: null,
      failureReason: null,
      unreadCommentCount: 0,
      version: 1,
      updatedAt: now,
    })),
  ];
  saveMessages(workspaceId, teamId, [...listMessages(workspaceId, teamId), message]);
  saveDeliveries(workspaceId, teamId, nextDeliveries);
  return ok('message sent', {
    message: messageView(message),
    recipients: {
      included_agent_ids: recipientsResult.data.includedAgentIds,
      excluded_agent_ids: recipientsResult.data.excludedAgentIds,
    },
    delivery_summary: {
      created_count: recipientsResult.data.includedAgentIds.length,
      skipped_count: recipientsResult.data.excludedAgentIds.length,
    },
  }, 'OK', recipientsResult.data.warnings);
}

export function handleTeamInboxQuery(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'list') {
    const items = listTeamsRaw(workspaceId)
      .flatMap((team) => listDeliveries(workspaceId, team.id))
      .filter((item) => item.recipientAgentId === actorAgentId)
      .filter((item) => {
        const teamId = asString(input.team_id ?? input.teamId);
        return !teamId || item.teamId === teamId;
      })
      .filter((item) => {
        const senderAgentId = asString(input.sender_agent_id ?? input.senderAgentId);
        return !senderAgentId || item.senderAgentId === senderAgentId;
      })
      .filter((item) => {
        const messageType = asString(input.message_type ?? input.messageType);
        return !messageType || item.messageType === messageType;
      })
      .filter((item) => {
        const priority = asString(input.priority);
        return !priority || item.priority === priority;
      })
      .filter((item) => {
        const requiresAction = input.requires_action ?? input.requiresAction;
        return typeof requiresAction !== 'boolean' || item.requiresAction === requiresAction;
      })
      .filter((item) => {
        const unreadOnly = asBoolean(input.unread_only ?? input.unreadOnly);
        return !unreadOnly || item.inboxStatus === 'unread';
      })
      .filter((item) => {
        const inboxStatus = parseInboxStatus(input.inbox_status ?? input.inboxStatus);
        return !inboxStatus || item.inboxStatus === inboxStatus;
      })
      .filter((item) => {
        const executionStatus = parseExecutionStatus(input.execution_status ?? input.executionStatus);
        return !executionStatus || item.executionStatus === executionStatus;
      })
      .filter((item) => {
        const dueBefore = asString(input.due_before ?? input.dueBefore);
        return !dueBefore || !item.dueAt || item.dueAt <= dueBefore;
      })
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''));
    const { size, offset } = parsePage(input);
    return ok('inbox listed', {
      inbox_items: items.slice(offset, offset + size).map(inboxView),
      next_page_token: nextPageToken(items.length, offset, size),
      summary: {
        total_returned: Math.min(size, Math.max(0, items.length - offset)),
        unread_count_estimate: items.filter((item) => item.inboxStatus === 'unread').length,
      },
    });
  }

  if (action === 'get') {
    const deliveryId = asString(input.delivery_id ?? input.deliveryId);
    const messageId = asString(input.message_id ?? input.messageId);
    if (!deliveryId && !messageId) return fail('delivery_id or message_id is required', 'INVALID_ARGUMENT');
    let inboxItem: TeamInboxItem | undefined;
    let message: TeamMessage | undefined;
    if (deliveryId) {
      const ctx = findDeliveryContext(workspaceId, deliveryId);
      if (!ctx) return fail('delivery not found', 'DELIVERY_NOT_FOUND');
      if (ctx.delivery.recipientAgentId !== actorAgentId) return fail('permission denied', 'PERMISSION_DENIED');
      inboxItem = ctx.delivery;
      message = listMessages(workspaceId, ctx.team.id).find((item) => item.id === ctx.delivery.messageId);
    } else if (messageId) {
      const ctx = findMessageContext(workspaceId, messageId);
      if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
      inboxItem = listDeliveries(workspaceId, ctx.team.id).find((item) => item.messageId === messageId && item.recipientAgentId === actorAgentId);
      message = ctx.message;
      if (!inboxItem) return fail('delivery not found', 'DELIVERY_NOT_FOUND');
    }
    if (!inboxItem || !message) return fail('message not found', 'MESSAGE_NOT_FOUND');
    return ok('inbox item loaded', {
      inbox_item: inboxView(inboxItem),
      message: messageView(message),
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}

export function handleTeamMessageUpdate(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const deliveryId = asString(input.delivery_id ?? input.deliveryId);
  if (action !== 'update_status' || !actorAgentId || !deliveryId) {
    return fail('action=update_status, actor_agent_id, delivery_id are required', 'INVALID_ARGUMENT');
  }
  const ctx = findDeliveryContext(workspaceId, deliveryId);
  if (!ctx) return fail('delivery not found', 'DELIVERY_NOT_FOUND');
  if (ctx.delivery.recipientAgentId !== actorAgentId) return fail('permission denied', 'PERMISSION_DENIED');

  const nextInboxStatus = parseInboxStatus(input.inbox_status ?? input.inboxStatus);
  const nextExecutionStatus = parseExecutionStatus(input.execution_status ?? input.executionStatus);
  if (!nextInboxStatus && !nextExecutionStatus && input.failure_reason === undefined && input.failureReason === undefined) {
    return fail('at least one update field is required', 'INVALID_ARGUMENT');
  }
  if (typeof input.expected_version === 'number' && input.expected_version !== ctx.delivery.version
    || typeof input.expectedVersion === 'number' && input.expectedVersion !== ctx.delivery.version) {
    return fail('expected version mismatch', 'CONFLICT');
  }
  const statusCheck = applyDeliveryStatusRules(ctx.delivery, nextInboxStatus, nextExecutionStatus);
  if (!statusCheck.success) return statusCheck;

  const now = new Date().toISOString();
  const updated: TeamInboxItem = {
    ...ctx.delivery,
    inboxStatus: nextInboxStatus ?? ctx.delivery.inboxStatus,
    executionStatus: nextExecutionStatus ?? ctx.delivery.executionStatus,
    failureReason: nextExecutionStatus === 'failed'
      ? asString(input.failure_reason ?? input.failureReason) ?? ctx.delivery.failureReason
      : nextExecutionStatus
        ? null
        : ctx.delivery.failureReason,
    readAt: nextInboxStatus === 'read' ? now : nextInboxStatus === 'unread' ? null : ctx.delivery.readAt,
    completedAt: nextExecutionStatus === 'done' ? now : nextExecutionStatus === 'in_progress' ? null : ctx.delivery.completedAt,
    failedAt: nextExecutionStatus === 'failed' ? now : nextExecutionStatus === 'in_progress' ? null : ctx.delivery.failedAt,
    version: ctx.delivery.version + 1,
    updatedAt: now,
  };
  saveDeliveries(workspaceId, ctx.team.id, ctx.deliveries.map((item) => item.id === deliveryId ? updated : item));
  const changedFields = [
    nextInboxStatus && nextInboxStatus !== ctx.delivery.inboxStatus ? 'inbox_status' : null,
    nextExecutionStatus && nextExecutionStatus !== ctx.delivery.executionStatus ? 'execution_status' : null,
    updated.failureReason !== ctx.delivery.failureReason ? 'failure_reason' : null,
  ].filter((item): item is string => Boolean(item));
  return ok('message status updated', {
    inbox_item: inboxView(updated),
    update_result: {
      changed_fields: changedFields,
      version: updated.version,
      updated_at: now,
    },
  });
}

export function handleTeamMessageComment(workspaceId: string, input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'add') {
    const messageId = asString(input.message_id ?? input.messageId);
    const content = asString(input.content);
    if (!messageId || !content) return fail('message_id and content are required', 'INVALID_ARGUMENT');
    const ctx = findMessageContext(workspaceId, messageId);
    if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
    if (!canAccessMessage(workspaceId, messageId, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const now = new Date().toISOString();
    const comment: TeamMessageComment = {
      id: uuid(),
      workspaceId,
      teamId: ctx.team.id,
      messageId,
      authorAgentId: actorAgentId,
      content,
      contentFormat: parseCommentFormat(input.content_format ?? input.contentFormat),
      visibility: parseCommentVisibility(input.visibility),
      createdAt: now,
      updatedAt: null,
      deletedAt: null,
    };
    saveComments(workspaceId, ctx.team.id, [...listCommentsRaw(workspaceId, ctx.team.id), comment]);
    const deliveries = listDeliveries(workspaceId, ctx.team.id).map((item) =>
      item.messageId === messageId && item.recipientAgentId !== actorAgentId
        ? { ...item, unreadCommentCount: item.unreadCommentCount + 1, updatedAt: now }
        : item,
    );
    saveDeliveries(workspaceId, ctx.team.id, deliveries);
    return ok('comment added', { comment: commentView(comment) });
  }

  if (action === 'list') {
    const messageId = asString(input.message_id ?? input.messageId);
    if (!messageId) return fail('message_id is required', 'INVALID_ARGUMENT');
    const ctx = findMessageContext(workspaceId, messageId);
    if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
    if (!canAccessMessage(workspaceId, messageId, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const includeDeleted = asBoolean(input.include_deleted ?? input.includeDeleted);
    const comments = listCommentsRaw(workspaceId, ctx.team.id)
      .filter((item) => item.messageId === messageId)
      .filter((item) => includeDeleted || !item.deletedAt)
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    const { size, offset } = parsePage(input);
    return ok('comments listed', {
      comments: comments.slice(offset, offset + size).map(commentView),
      next_page_token: nextPageToken(comments.length, offset, size),
    });
  }

  if (action === 'delete') {
    const commentId = asString(input.comment_id ?? input.commentId);
    if (!commentId) return fail('comment_id is required', 'INVALID_ARGUMENT');
    const ctx = findCommentContext(workspaceId, commentId);
    if (!ctx) return fail('comment not found', 'COMMENT_NOT_FOUND');
    if (ctx.comment.authorAgentId !== actorAgentId) return fail('only the author can delete comment', 'PERMISSION_DENIED');
    if (ctx.comment.deletedAt) return ok('comment already deleted', {
      comment_id: commentId,
      deleted_at: ctx.comment.deletedAt,
      status: 'deleted',
    });
    const now = new Date().toISOString();
    const updated: TeamMessageComment = {
      ...ctx.comment,
      deletedAt: now,
      deletedBy: actorAgentId,
      deleteReason: asString(input.reason),
      updatedAt: now,
    };
    saveComments(workspaceId, ctx.team.id, ctx.comments.map((item) => item.id === commentId ? updated : item));
    return ok('comment deleted', {
      comment_id: commentId,
      deleted_at: now,
      status: 'deleted',
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}
