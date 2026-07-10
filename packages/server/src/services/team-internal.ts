import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig } from '@agent-spaces/shared';
import { listPresets } from './agent.js';
import { findAgent as findChatAgent } from './chat.js';
import { listWorkflows } from './workflow.js';
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import type {
  JsonMap,
  Team,
  TeamBodyFormat,
  TeamCommentContentFormat,
  TeamCommentVisibility,
  TeamExecutionStatus,
  TeamInboxItem,
  TeamInboxStatus,
  TeamMembership,
  TeamMembershipAgentStore,
  TeamMessage,
  TeamMessageComment,
  TeamPriority,
  TeamRole,
  TeamServiceResult,
  TeamVisibility,
} from './team-types.js';

export function ok<T>(message: string, data?: T, code = 'OK', warnings?: string[]): TeamServiceResult<T> {
  return { success: true, code, message, data, ...(warnings?.length ? { warnings } : {}) };
}

export function fail(message: string, code: string): TeamServiceResult<never> {
  return { success: false, code, message };
}

export function teamDir(): string {
  return join(getDataDir(), 'team');
}

export function teamIndexPath(): string {
  return join(teamDir(), 'teams.json');
}

export function teamDataDir(teamId: string): string {
  return join(teamDir(), teamId);
}

export function teamFilePath(teamId: string): string {
  return join(teamDataDir(teamId), 'info.json');
}

export function teamMembershipsPath(teamId: string): string {
  return join(teamDataDir(teamId), 'memberships.json');
}

export function teamMessagesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'messages.json');
}

export function teamDeliveriesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'deliveries.json');
}

export function teamRuntimesPath(teamId: string): string {
  return join(teamDataDir(teamId), 'runtimes.json');
}

export function teamCommentsPath(teamId: string): string {
  return join(teamDataDir(teamId), 'comments.json');
}

/** 归档目录：team/archived/{teamId} */
export function archivedTeamDataDir(teamId: string): string {
  return join(teamDir(), 'archived', teamId);
}

export function archivedTeamFilePath(teamId: string): string {
  return join(archivedTeamDataDir(teamId), 'info.json');
}

export function loadArchivedTeam(teamId: string): Team | null {
  return readJsonFile<Team>(archivedTeamFilePath(teamId));
}

/** 列出归档目录下所有 team id（按子目录名） */
export function listArchivedTeamIds(): string[] {
  const dir = join(teamDir(), 'archived');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function listArchivedTeamsRaw(): Team[] {
  return listArchivedTeamIds()
    .map((teamId) => loadArchivedTeam(teamId))
    .filter((team): team is Team => Boolean(team));
}

export function uniqueTeamIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function listTeamIds(): string[] {
  return readJsonFile<string[]>(teamIndexPath()) ?? [];
}

export function saveTeamIds(ids: string[]): void {
  writeJsonFile(teamIndexPath(), uniqueTeamIds(ids));
}

export function listTeamsRaw(): Team[] {
  return listTeamIds()
    .map((teamId) => loadTeam(teamId))
    .filter((team): team is Team => Boolean(team));
}

export function saveTeam(team: Team): void {
  const ids = listTeamIds();
  if (!ids.includes(team.id)) saveTeamIds([...ids, team.id]);
  writeJsonFile(teamFilePath(team.id), team);
}

export function loadTeam(teamId: string): Team | null {
  return readJsonFile<Team>(teamFilePath(teamId));
}

export function listMemberships(teamId: string): TeamMembership[] {
  return (readJsonFile<TeamMembership[]>(teamMembershipsPath(teamId)) ?? []).map(normalizeStoredMembership);
}

export function saveMemberships(teamId: string, items: TeamMembership[]): void {
  writeJsonFile(teamMembershipsPath(teamId), items);
}

export function listMessages(teamId: string): TeamMessage[] {
  return readJsonFile<TeamMessage[]>(teamMessagesPath(teamId)) ?? [];
}

export function saveMessages(teamId: string, items: TeamMessage[]): void {
  writeJsonFile(teamMessagesPath(teamId), items);
}

export function listDeliveries(teamId: string): TeamInboxItem[] {
  return readJsonFile<TeamInboxItem[]>(teamDeliveriesPath(teamId)) ?? [];
}

export function listRuntimes(teamId: string): Array<{ leaderAgentId?: string; status?: string }> {
  return readJsonFile<Array<{ leaderAgentId?: string; status?: string }>>(teamRuntimesPath(teamId)) ?? [];
}

export function saveDeliveries(teamId: string, items: TeamInboxItem[]): void {
  writeJsonFile(teamDeliveriesPath(teamId), items);
}

export function listCommentsRaw(teamId: string): TeamMessageComment[] {
  return readJsonFile<TeamMessageComment[]>(teamCommentsPath(teamId)) ?? [];
}

export function saveComments(teamId: string, items: TeamMessageComment[]): void {
  writeJsonFile(teamCommentsPath(teamId), items);
}

export function isObject(input: unknown): input is JsonMap {
  return Boolean(input) && typeof input === 'object' && !Array.isArray(input);
}

export function asString(input: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

export function asBoolean(input: unknown, fallback = false): boolean {
  return typeof input === 'boolean' ? input : fallback;
}

export function asArray<T = unknown>(input: unknown): T[] {
  return Array.isArray(input) ? input as T[] : [];
}

export function asAgentRecord(input: unknown): Record<string, unknown> | undefined {
  return isObject(input) ? { ...input } : undefined;
}

export function parsePage(input: JsonMap): { size: number; offset: number } {
  const rawSize = typeof input.page_size === 'number' ? input.page_size : typeof input.pageSize === 'number' ? input.pageSize : 20;
  const size = Math.max(1, Math.min(100, Math.floor(rawSize)));
  const token = asString(input.page_token ?? input.pageToken);
  const offset = token ? Math.max(0, parseInt(token, 10) || 0) : 0;
  return { size, offset };
}

export function nextPageToken(total: number, offset: number, size: number): string | null {
  return offset + size < total ? String(offset + size) : null;
}

export function previewText(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function isActiveMembership(item: TeamMembership | undefined | null): item is TeamMembership {
  return item != null && item.status === 'active';
}

export function getMembership(teamId: string, agentId: string): TeamMembership | undefined {
  return listMemberships(teamId).find((item) => item.agentId === agentId);
}

export function getActiveMembership(teamId: string, agentId: string): TeamMembership | undefined {
  const membership = getMembership(teamId, agentId);
  return isActiveMembership(membership) ? membership : undefined;
}

/**
 * 解析有效成员身份：actor 是 active 成员则用自身，否则回退到 team owner（管理视角）。
 * 返回的 membership 用于权限校验，保证非成员管理操作也能放行。
 */
export function resolveEffectiveMembership(teamId: string, agentId: string): TeamMembership | undefined {
  return getActiveMembership(teamId, agentId)
    ?? activeMemberships(teamId).find((item) => item.role === 'owner')
    ?? activeMemberships(teamId)[0];
}

export function isManagerRole(membership: TeamMembership | undefined): boolean {
  return Boolean(membership && (membership.role === 'owner' || membership.role === 'admin'));
}

export function activeMemberships(teamId: string): TeamMembership[] {
  return listMemberships(teamId).filter((item) => item.status === 'active');
}

export function updateTeamMemberCount(team: Team): Team {
  const next = { ...team, memberCount: activeMemberships(team.id).length, updatedAt: new Date().toISOString() };
  saveTeam(next);
  return next;
}

export function parseVisibility(input: unknown): TeamVisibility {
  return input === 'open' ? 'open' : 'private';
}

export function parseRole(input: unknown): TeamRole {
  return input === 'owner' || input === 'admin' || input === 'observer' ? input : 'member';
}

export function parseAgentStore(input: unknown): TeamMembershipAgentStore | undefined {
  return input === 'agent' || input === 'chat' || input === 'custom' ? input : undefined;
}

export function findPresetById(agentId: string): AgentConfig | undefined {
  return listPresets('').find((item) => item.id === agentId);
}

export function findWorkflowAgentConfig(agentId: string): Record<string, unknown> | undefined {
  for (const workflow of listWorkflows()) {
    for (const node of workflow.nodes ?? []) {
      if (node.type !== 'agent_run') continue;
      const data = isObject(node.data) ? node.data : null;
      if (!data) continue;
      const agent = asAgentRecord(data.agent);
      const candidateId = asString(agent?.id) ?? asString(data.agentConfigId);
      if (candidateId === agentId) return { ...(agent ?? {}), id: agentId };
    }
  }
  return undefined;
}

export function resolveTeamAgentSource(
  agentId: string,
): { agentStore: TeamMembershipAgentStore; agent?: Record<string, unknown> } | null {
  if (findPresetById(agentId)) return { agentStore: 'agent' };
  if (findChatAgent(agentId)) return { agentStore: 'chat' };
  const workflowAgent = findWorkflowAgentConfig(agentId);
  if (workflowAgent) return { agentStore: 'custom', agent: workflowAgent };
  return null;
}

export function detectAgentStore(agentId: string): TeamMembershipAgentStore | undefined {
  return resolveTeamAgentSource(agentId)?.agentStore;
}

export function normalizeStoredMembership(item: TeamMembership): TeamMembership {
  if (item.agentStore) return item;
  const resolved = item.agent ? { agentStore: 'custom' as const, agent: item.agent } : resolveTeamAgentSource(item.agentId);
  return {
    ...item,
    agentStore: resolved?.agentStore ?? 'agent',
    agent: item.agent ?? resolved?.agent,
  };
}

export function resolveMembershipAgent(
  input: JsonMap,
): { agentId: string; agentStore: TeamMembershipAgentStore; agent?: Record<string, unknown> } | { error: TeamServiceResult } {
  const customAgent = asAgentRecord(input.agent);
  const agentId = asString(input.agent_id ?? input.agentId ?? customAgent?.id);
  if (!agentId) return { error: fail('agent_id is required', 'INVALID_ARGUMENT') };

  const requestedStore = parseAgentStore(input.agent_store ?? input.agentStore);
  if (customAgent) {
    return {
      agentId,
      agentStore: requestedStore ?? 'custom',
      agent: { ...customAgent, id: agentId },
    };
  }
  if (requestedStore === 'custom') {
    return { error: fail('agent object is required when agent_store=custom', 'INVALID_ARGUMENT') };
  }

  const resolvedSource = resolveTeamAgentSource(agentId);
  const resolvedStore = requestedStore ?? resolvedSource?.agentStore;
  if (resolvedStore === 'agent') {
    if (!findPresetById(agentId)) return { error: fail(`agent not found: ${agentId}`, 'AGENT_NOT_FOUND') };
    return { agentId, agentStore: 'agent' };
  }
  if (resolvedStore === 'chat') {
    if (!findChatAgent(agentId)) return { error: fail(`chat agent not found: ${agentId}`, 'AGENT_NOT_FOUND') };
    return { agentId, agentStore: 'chat' };
  }
  if (resolvedStore === 'custom' && resolvedSource?.agent) {
    return { agentId, agentStore: 'custom', agent: resolvedSource.agent };
  }
  return { error: fail(`agent not found: ${agentId}`, 'AGENT_NOT_FOUND') };
}

export function parseBodyFormat(input: unknown): TeamBodyFormat {
  return input === 'markdown' || input === 'structured_text' ? input : 'plain_text';
}

export function parsePriority(input: unknown): TeamPriority {
  return input === 'low' || input === 'high' || input === 'urgent' ? input : 'normal';
}

export function parseInboxStatus(input: unknown): TeamInboxStatus | undefined {
  return input === 'unread' || input === 'read' || input === 'archived' ? input : undefined;
}

export function parseExecutionStatus(input: unknown): TeamExecutionStatus | undefined {
  return input === 'pending' || input === 'running' || input === 'in_progress' || input === 'done' || input === 'failed' || input === 'ignored'
    ? input
    : undefined;
}

export function parseCommentVisibility(input: unknown): TeamCommentVisibility {
  return input === 'participants' || input === 'private' ? input : 'team';
}

export function parseCommentFormat(input: unknown): TeamCommentContentFormat {
  return input === 'markdown' ? 'markdown' : 'plain_text';
}

export function redactAgentSecrets<T>(input: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const clone = { ...(input as Record<string, unknown>) };
  delete clone.apiKey;
  delete clone.api_key;
  return clone as T;
}

export function teamView(team: Team, actorAgentId?: string) {
  const membership = actorAgentId ? resolveEffectiveMembership(team.id, actorAgentId) : undefined;
  return {
    ...team,
    team_id: team.id,
    created_by: team.createdBy,
    created_at: team.createdAt,
    member_count: team.memberCount,
    avatar_url: team.avatarUrl,
    // 非成员（管理视角）回退 owner 的 role，使前端管理操作可用
    my_role: membership?.role ?? null,
  };
}

export function membershipView(item: TeamMembership) {
  const unreadCount = listDeliveries(item.teamId)
    .filter((delivery) => delivery.recipientAgentId === item.agentId && delivery.inboxStatus === 'unread')
    .length;
  const runningCount = listRuntimes(item.teamId)
    .filter((runtime) => runtime.leaderAgentId === item.agentId && runtime.status === 'running')
    .length;
  return {
    ...item,
    agent: item.agent ? redactAgentSecrets(item.agent) : item.agent,
    membership_id: item.id,
    team_id: item.teamId,
    agent_id: item.agentId,
    agent_store: item.agentStore ?? 'agent',
    unread_count: unreadCount,
    runtime_status: runningCount > 0 ? 'running' : 'idle',
    running_count: runningCount,
    joined_at: item.joinedAt,
    updated_at: item.updatedAt,
  };
}

export function messageView(item: TeamMessage) {
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

export function inboxView(item: TeamInboxItem) {
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

export function commentView(item: TeamMessageComment) {
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

export function canViewTeam(team: Team, actorAgentId: string): boolean {
  return team.visibility === 'open' || Boolean(getActiveMembership(team.id, actorAgentId));
}

export function resolveRecipients(
  teamId: string,
  mode: 'direct' | 'broadcast',
  input: JsonMap,
  senderId: string,
  allowExternalRecipients = false,
): TeamServiceResult<{ includedAgentIds: string[]; excludedAgentIds: string[]; warnings: string[] }> {
  const active = activeMemberships(teamId);
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
      if (activeByAgentId.has(agentId) || allowExternalRecipients) included.add(agentId);
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

export function findDeliveryContext(deliveryId: string): { team: Team; delivery: TeamInboxItem; deliveries: TeamInboxItem[] } | null {
  for (const team of listTeamsRaw()) {
    const deliveries = listDeliveries(team.id);
    const delivery = deliveries.find((item) => item.id === deliveryId);
    if (delivery) return { team, delivery, deliveries };
  }
  return null;
}

export function findMessageContext(messageId: string): { team: Team; message: TeamMessage; messages: TeamMessage[] } | null {
  for (const team of listTeamsRaw()) {
    const messages = listMessages(team.id);
    const message = messages.find((item) => item.id === messageId);
    if (message) return { team, message, messages };
  }
  return null;
}

export function findCommentContext(commentId: string): { team: Team; comment: TeamMessageComment; comments: TeamMessageComment[] } | null {
  for (const team of listTeamsRaw()) {
    const comments = listCommentsRaw(team.id);
    const comment = comments.find((item) => item.id === commentId);
    if (comment) return { team, comment, comments };
  }
  return null;
}

export function canAccessMessage(messageId: string, actorAgentId: string): boolean {
  const ctx = findMessageContext(messageId);
  if (!ctx) return false;
  if (ctx.message.senderAgentId === actorAgentId) return true;
  // 非成员（管理视角）回退 owner 身份
  return Boolean(resolveEffectiveMembership(ctx.team.id, actorAgentId));
}

export function applyDeliveryStatusRules(current: TeamInboxItem, nextInboxStatus?: TeamInboxStatus, nextExecutionStatus?: TeamExecutionStatus): TeamServiceResult {
  const allowedInbox = new Map<TeamInboxStatus, TeamInboxStatus[]>([
    ['unread', ['read']],
    ['read', ['unread', 'archived']],
    ['archived', ['read']],
  ]);
  const allowedExecution = new Map<TeamExecutionStatus, TeamExecutionStatus[]>([
    ['pending', ['running', 'in_progress', 'done', 'failed', 'ignored']],
    ['running', ['in_progress', 'done', 'failed', 'ignored']],
    ['in_progress', ['running', 'done', 'failed', 'ignored']],
    ['done', ['running', 'in_progress']],
    ['failed', ['running', 'in_progress']],
    ['ignored', ['running', 'in_progress']],
  ]);
  if (nextInboxStatus && nextInboxStatus !== current.inboxStatus && !allowedInbox.get(current.inboxStatus)?.includes(nextInboxStatus)) {
    return fail('invalid inbox status transition', 'INVALID_STATUS_TRANSITION');
  }
  if (nextExecutionStatus && nextExecutionStatus !== current.executionStatus && !allowedExecution.get(current.executionStatus)?.includes(nextExecutionStatus)) {
    return fail('invalid execution status transition', 'INVALID_STATUS_TRANSITION');
  }
  return ok('status transition allowed');
}
