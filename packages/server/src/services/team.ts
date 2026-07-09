import { v4 as uuid } from 'uuid';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AgentConfig } from '@agent-spaces/shared';
import { listPresets } from './agent.js';
import { findAgent as findChatAgent } from './chat.js';
import { listWorkflows } from './workflow.js';
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';

type JsonMap = Record<string, unknown>;
type TeamStatus = 'active' | 'archived' | 'dissolved';
type TeamVisibility = 'private' | 'open';
type TeamRole = 'owner' | 'admin' | 'member' | 'observer';
type TeamMembershipStatus = 'active' | 'left' | 'removed' | 'suspended';
type TeamMembershipAgentStore = 'agent' | 'chat' | 'custom';
type TeamMessageType = 'direct' | 'broadcast';
type TeamBodyFormat = 'plain_text' | 'markdown' | 'structured_text';
type TeamPriority = 'low' | 'normal' | 'high' | 'urgent';
type TeamInboxStatus = 'unread' | 'read' | 'archived';
type TeamExecutionStatus = 'pending' | 'running' | 'in_progress' | 'done' | 'failed' | 'ignored';
type TeamCommentVisibility = 'team' | 'participants' | 'private';
type TeamCommentContentFormat = 'plain_text' | 'markdown';

interface Team {
  id: string;
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
  teamId: string;
  agentId: string;
  agentStore?: TeamMembershipAgentStore;
  agent?: Record<string, unknown>;
  role: TeamRole;
  status: TeamMembershipStatus;
  joinedAt: string;
  updatedAt: string;
}

interface TeamMessage {
  id: string;
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

function teamDir(): string {
  return join(getDataDir(), 'team');
}

function teamIndexPath(): string {
  return join(teamDir(), 'teams.json');
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

function teamCommentsPath(teamId: string): string {
  return join(teamDataDir(teamId), 'comments.json');
}

/** 归档目录：team/archived/{teamId} */
function archivedTeamDataDir(teamId: string): string {
  return join(teamDir(), 'archived', teamId);
}

function archivedTeamFilePath(teamId: string): string {
  return join(archivedTeamDataDir(teamId), 'info.json');
}

function loadArchivedTeam(teamId: string): Team | null {
  return readJsonFile<Team>(archivedTeamFilePath(teamId));
}

/** 列出归档目录下所有 team id（按子目录名） */
function listArchivedTeamIds(): string[] {
  const dir = join(teamDir(), 'archived');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function listArchivedTeamsRaw(): Team[] {
  return listArchivedTeamIds()
    .map((teamId) => loadArchivedTeam(teamId))
    .filter((team): team is Team => Boolean(team));
}

function uniqueTeamIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function listTeamIds(): string[] {
  return readJsonFile<string[]>(teamIndexPath()) ?? [];
}

function saveTeamIds(ids: string[]): void {
  writeJsonFile(teamIndexPath(), uniqueTeamIds(ids));
}

function listTeamsRaw(): Team[] {
  return listTeamIds()
    .map((teamId) => loadTeam(teamId))
    .filter((team): team is Team => Boolean(team));
}

function saveTeam(team: Team): void {
  const ids = listTeamIds();
  if (!ids.includes(team.id)) saveTeamIds([...ids, team.id]);
  writeJsonFile(teamFilePath(team.id), team);
}

function loadTeam(teamId: string): Team | null {
  return readJsonFile<Team>(teamFilePath(teamId));
}

function listMemberships(teamId: string): TeamMembership[] {
  return (readJsonFile<TeamMembership[]>(teamMembershipsPath(teamId)) ?? []).map(normalizeStoredMembership);
}

function saveMemberships(teamId: string, items: TeamMembership[]): void {
  writeJsonFile(teamMembershipsPath(teamId), items);
}

function listMessages(teamId: string): TeamMessage[] {
  return readJsonFile<TeamMessage[]>(teamMessagesPath(teamId)) ?? [];
}

function saveMessages(teamId: string, items: TeamMessage[]): void {
  writeJsonFile(teamMessagesPath(teamId), items);
}

function listDeliveries(teamId: string): TeamInboxItem[] {
  return readJsonFile<TeamInboxItem[]>(teamDeliveriesPath(teamId)) ?? [];
}

function listRuntimes(teamId: string): Array<{ leaderAgentId?: string; status?: string }> {
  return readJsonFile<Array<{ leaderAgentId?: string; status?: string }>>(teamRuntimesPath(teamId)) ?? [];
}

function saveDeliveries(teamId: string, items: TeamInboxItem[]): void {
  writeJsonFile(teamDeliveriesPath(teamId), items);
}

function listCommentsRaw(teamId: string): TeamMessageComment[] {
  return readJsonFile<TeamMessageComment[]>(teamCommentsPath(teamId)) ?? [];
}

function saveComments(teamId: string, items: TeamMessageComment[]): void {
  writeJsonFile(teamCommentsPath(teamId), items);
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

function asAgentRecord(input: unknown): Record<string, unknown> | undefined {
  return isObject(input) ? { ...input } : undefined;
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

function getMembership(teamId: string, agentId: string): TeamMembership | undefined {
  return listMemberships(teamId).find((item) => item.agentId === agentId);
}

function getActiveMembership(teamId: string, agentId: string): TeamMembership | undefined {
  const membership = getMembership(teamId, agentId);
  return isActiveMembership(membership) ? membership : undefined;
}

function activeMemberships(teamId: string): TeamMembership[] {
  return listMemberships(teamId).filter((item) => item.status === 'active');
}

function updateTeamMemberCount(team: Team): Team {
  const next = { ...team, memberCount: activeMemberships(team.id).length, updatedAt: new Date().toISOString() };
  saveTeam(next);
  return next;
}

function parseVisibility(input: unknown): TeamVisibility {
  return input === 'open' ? 'open' : 'private';
}

function parseRole(input: unknown): TeamRole {
  return input === 'owner' || input === 'admin' || input === 'observer' ? input : 'member';
}

function parseAgentStore(input: unknown): TeamMembershipAgentStore | undefined {
  return input === 'agent' || input === 'chat' || input === 'custom' ? input : undefined;
}

function findPresetById(agentId: string): AgentConfig | undefined {
  return listPresets('').find((item) => item.id === agentId);
}

function findWorkflowAgentConfig(agentId: string): Record<string, unknown> | undefined {
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

function detectAgentStore(agentId: string): TeamMembershipAgentStore | undefined {
  return resolveTeamAgentSource(agentId)?.agentStore;
}

function normalizeStoredMembership(item: TeamMembership): TeamMembership {
  if (item.agentStore) return item;
  const resolved = item.agent ? { agentStore: 'custom' as const, agent: item.agent } : resolveTeamAgentSource(item.agentId);
  return {
    ...item,
    agentStore: resolved?.agentStore ?? 'agent',
    agent: item.agent ?? resolved?.agent,
  };
}

function resolveMembershipAgent(
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
  return input === 'pending' || input === 'running' || input === 'in_progress' || input === 'done' || input === 'failed' || input === 'ignored'
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
  const membership = actorAgentId ? getActiveMembership(team.id, actorAgentId) : undefined;
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
  const unreadCount = listDeliveries(item.teamId)
    .filter((delivery) => delivery.recipientAgentId === item.agentId && delivery.inboxStatus === 'unread')
    .length;
  const runningCount = listRuntimes(item.teamId)
    .filter((runtime) => runtime.leaderAgentId === item.agentId && runtime.status === 'running')
    .length;
  return {
    ...item,
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
  return team.visibility === 'open' || Boolean(getActiveMembership(team.id, actorAgentId));
}

function resolveRecipients(
  teamId: string,
  mode: 'direct' | 'broadcast',
  input: JsonMap,
  senderId: string,
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

function findDeliveryContext(deliveryId: string): { team: Team; delivery: TeamInboxItem; deliveries: TeamInboxItem[] } | null {
  for (const team of listTeamsRaw()) {
    const deliveries = listDeliveries(team.id);
    const delivery = deliveries.find((item) => item.id === deliveryId);
    if (delivery) return { team, delivery, deliveries };
  }
  return null;
}

function findMessageContext(messageId: string): { team: Team; message: TeamMessage; messages: TeamMessage[] } | null {
  for (const team of listTeamsRaw()) {
    const messages = listMessages(team.id);
    const message = messages.find((item) => item.id === messageId);
    if (message) return { team, message, messages };
  }
  return null;
}

function findCommentContext(commentId: string): { team: Team; comment: TeamMessageComment; comments: TeamMessageComment[] } | null {
  for (const team of listTeamsRaw()) {
    const comments = listCommentsRaw(team.id);
    const comment = comments.find((item) => item.id === commentId);
    if (comment) return { team, comment, comments };
  }
  return null;
}

function canAccessMessage(messageId: string, actorAgentId: string): boolean {
  const ctx = findMessageContext(messageId);
  if (!ctx) return false;
  if (ctx.message.senderAgentId === actorAgentId) return true;
  return Boolean(getActiveMembership(ctx.team.id, actorAgentId));
}

function applyDeliveryStatusRules(current: TeamInboxItem, nextInboxStatus?: TeamInboxStatus, nextExecutionStatus?: TeamExecutionStatus): TeamServiceResult {
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

export function handleTeamManage(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId) ?? '';
  // 归档清理操作不需要 actor
  if (!action || (action !== 'delete_archive' && action !== 'clear_archives' && !actorAgentId)) {
    return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');
  }

  if (action === 'create') {
    const name = asString(input.name);
    if (!name) return fail('name is required', 'INVALID_ARGUMENT');
    if (asBoolean(input.dry_run)) return ok('team create validation passed', { team: { name } });

    const now = new Date().toISOString();
    const ownerAgent = resolveMembershipAgent({ agent_id: actorAgentId });
    if ('error' in ownerAgent) return ownerAgent.error;
    const team: Team = {
      id: uuid(),
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
      teamId: team.id,
      agentId: ownerAgent.agentId,
      agentStore: ownerAgent.agentStore,
      agent: ownerAgent.agent,
      role: 'owner',
      status: 'active',
      joinedAt: now,
      updatedAt: now,
    }];
    for (const item of asArray<JsonMap>(input.initial_members ?? input.initialMembers)) {
      const resolved = resolveMembershipAgent(item);
      if ('error' in resolved) return resolved.error;
      if (resolved.agentId === actorAgentId || memberships.some((membership) => membership.agentId === resolved.agentId)) continue;
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
    saveMessages(team.id, []);
    saveDeliveries(team.id, []);
    saveComments(team.id, []);
    return ok('team created', {
      team: teamView(team, actorAgentId),
      memberships_created: memberships.map(membershipView),
    });
  }

  if (action === 'list') {
    const archivedOnly = asBoolean(input.archived);
    const allTeams = (archivedOnly ? listArchivedTeamsRaw() : listTeamsRaw())
      .filter((team) => {
        // 归档团队不再做成员可见性校验（已解散，仅作历史展示）
        if (archivedOnly) return true;
        const scope = asString(input.scope) ?? 'mine';
        if (scope === 'visible') return canViewTeam(team, actorAgentId);
        return Boolean(getActiveMembership(team.id, actorAgentId));
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
    const includeMembersPreview = asBoolean(input.include_members_preview ?? input.includeMembersPreview);
    const { size, offset } = parsePage(input);
    const page = allTeams.slice(offset, offset + size).map((team) => {
      const view = teamView(team, actorAgentId);
      if (includeMembersPreview) {
        (view as ReturnType<typeof teamView> & { members_preview?: ReturnType<typeof membershipView>[] }).members_preview =
          listMemberships(team.id)
            .filter((item) => item.status === 'active')
            .slice(0, 5)
            .map(membershipView);
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
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    if (!canViewTeam(team, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const deliveries = listDeliveries(teamId);
    const memberships = listMemberships(teamId);
    const messages = listMessages(teamId);
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

  if (action === 'update') {
    const teamId = asString(input.team_id ?? input.teamId);
    if (!teamId) return fail('team_id is required', 'INVALID_ARGUMENT');
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const membership = getActiveMembership(teamId, actorAgentId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return fail('only owner or admin can update team', 'PERMISSION_DENIED');
    }
    if (team.status === 'dissolved') return fail('team already dissolved', 'TEAM_DISSOLVED');

    const hasName = Object.prototype.hasOwnProperty.call(input, 'name');
    const hasDescription = Object.prototype.hasOwnProperty.call(input, 'description');
    const hasPurpose = Object.prototype.hasOwnProperty.call(input, 'purpose');
    const hasVisibility = Object.prototype.hasOwnProperty.call(input, 'visibility');
    const hasMetadata = Object.prototype.hasOwnProperty.call(input, 'metadata');
    const nextName = asString(input.name);
    if (hasName && !nextName) return fail('name cannot be empty', 'INVALID_ARGUMENT');
    if (!hasName && !hasDescription && !hasPurpose && !hasVisibility && !hasMetadata) {
      return fail('at least one update field is required', 'INVALID_ARGUMENT');
    }
    if (asBoolean(input.dry_run)) return ok('team update validation passed', { team_id: teamId });

    const now = new Date().toISOString();
    const next: Team = {
      ...team,
      name: hasName ? nextName! : team.name,
      description: hasDescription ? asString(input.description) ?? '' : team.description,
      purpose: hasPurpose ? (asString(input.purpose) || undefined) : team.purpose,
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
    const membership = getActiveMembership(teamId, actorAgentId);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) return fail('only owner or admin can dissolve team', 'PERMISSION_DENIED');
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

  return fail('invalid action', 'INVALID_ACTION');
}

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
    const inviter = getActiveMembership(teamId, actorAgentId);
    if (!inviter || (inviter.role !== 'owner' && inviter.role !== 'admin')) {
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
    const actor = getActiveMembership(teamId, actorAgentId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
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
    const actor = getActiveMembership(teamId, actorAgentId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
      return fail('only owner or admin can update member agent', 'PERMISSION_DENIED');
    }
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
    const actor = getActiveMembership(teamId, actorAgentId);
    if (!actor || (actor.role !== 'owner' && actor.role !== 'admin')) {
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

    const now = new Date().toISOString();
    const updated: TeamMembership = { ...target, status: 'removed', updatedAt: now };
    saveMemberships(teamId, memberships.map((item) => item.agentId === targetAgentId ? updated : item));
    updateTeamMemberCount(team);
    return ok('team member removed', {
      membership: {
        membership_id: updated.id,
        team_id: teamId,
        agent_id: targetAgentId,
        status: 'removed',
        updated_at: now,
      },
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}

export function handleTeamMessageSend(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  const action = asString(input.action);
  if (!actorAgentId || !teamId || !action) return fail('action, actor_agent_id, team_id are required', 'INVALID_ARGUMENT');
  if (action !== 'send') return fail('invalid action', 'INVALID_ACTION');

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');
  if (!getActiveMembership(teamId, actorAgentId)) return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');

  const mode = (asString(input.mode) === 'broadcast' ? 'broadcast' : 'direct') as 'direct' | 'broadcast';
  const subject = asString(input.subject);
  const body = asString(input.body);
  if (!subject || !body) return fail('subject and body are required', 'INVALID_ARGUMENT');
  const dueAt = asString(input.due_at ?? input.dueAt) ?? null;
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return fail('due_at must be a valid datetime', 'INVALID_ARGUMENT');
  const recipientsResult = resolveRecipients(teamId, mode, input, actorAgentId);
  if (!recipientsResult.success || !recipientsResult.data) return recipientsResult;
  if (asBoolean(input.dry_run)) return ok('message send validation passed', recipientsResult.data);

  const now = new Date().toISOString();
  const initialExecutionStatus = parseExecutionStatus(input.initial_execution_status ?? input.initialExecutionStatus) ?? 'pending';
  const message: TeamMessage = {
    id: uuid(),
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
  const deliveries = listDeliveries(teamId);
  const nextDeliveries = [
    ...deliveries,
    ...recipientsResult.data.includedAgentIds.map((recipientAgentId) => ({
      id: uuid(),
      teamId,
      messageId: message.id,
      recipientAgentId,
      senderAgentId: actorAgentId,
      subject,
      preview: previewText(body),
      messageType: mode,
      inboxStatus: 'unread' as TeamInboxStatus,
      executionStatus: initialExecutionStatus,
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
  saveMessages(teamId, [...listMessages(teamId), message]);
  saveDeliveries(teamId, nextDeliveries);
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

export function handleTeamInboxQuery(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'list') {
    const items = listTeamsRaw()
      .flatMap((team) => listDeliveries(team.id))
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
      const ctx = findDeliveryContext(deliveryId);
      if (!ctx) return fail('delivery not found', 'DELIVERY_NOT_FOUND');
      if (ctx.delivery.recipientAgentId !== actorAgentId) return fail('permission denied', 'PERMISSION_DENIED');
      inboxItem = ctx.delivery;
      message = listMessages(ctx.team.id).find((item) => item.id === ctx.delivery.messageId);
    } else if (messageId) {
      const ctx = findMessageContext(messageId);
      if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
      inboxItem = listDeliveries(ctx.team.id).find((item) => item.messageId === messageId && item.recipientAgentId === actorAgentId);
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

export function handleTeamMessageUpdate(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const deliveryId = asString(input.delivery_id ?? input.deliveryId);
  if (action !== 'update_status' || !actorAgentId || !deliveryId) {
    return fail('action=update_status, actor_agent_id, delivery_id are required', 'INVALID_ARGUMENT');
  }
  const ctx = findDeliveryContext(deliveryId);
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
    completedAt: nextExecutionStatus === 'done' ? now : nextExecutionStatus === 'in_progress' || nextExecutionStatus === 'running' ? null : ctx.delivery.completedAt,
    failedAt: nextExecutionStatus === 'failed' ? now : nextExecutionStatus === 'in_progress' || nextExecutionStatus === 'running' ? null : ctx.delivery.failedAt,
    version: ctx.delivery.version + 1,
    updatedAt: now,
  };
  saveDeliveries(ctx.team.id, ctx.deliveries.map((item) => item.id === deliveryId ? updated : item));
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

export function handleTeamMessageDelete(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  const messageId = asString(input.message_id ?? input.messageId);
  if (!actorAgentId || (!messageId && !teamId)) {
    return fail('actor_agent_id and message_id or team_id are required', 'INVALID_ARGUMENT');
  }

  if (teamId) {
    const team = loadTeam(teamId);
    if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
    const actorMembership = getActiveMembership(teamId, actorAgentId);
    if (!actorMembership) return fail('permission denied', 'PERMISSION_DENIED');

    saveMessages(teamId, []);
    saveDeliveries(teamId, []);
    saveComments(teamId, []);
    return ok('messages cleared', {
      team_id: teamId,
    });
  }

  if (!messageId) return fail('message_id is required', 'INVALID_ARGUMENT');
  const ctx = findMessageContext(messageId);
  if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');

  const actorMembership = getActiveMembership(ctx.team.id, actorAgentId);
  const canDelete = ctx.message.senderAgentId === actorAgentId
    || actorMembership?.role === 'owner'
    || actorMembership?.role === 'admin';
  if (!canDelete) return fail('permission denied', 'PERMISSION_DENIED');

  const nextMessages = ctx.messages.filter((item) => item.id !== messageId);
  const nextDeliveries = listDeliveries(ctx.team.id).filter((item) => item.messageId !== messageId);
  const nextComments = listCommentsRaw(ctx.team.id).filter((item) => item.messageId !== messageId);
  saveMessages(ctx.team.id, nextMessages);
  saveDeliveries(ctx.team.id, nextDeliveries);
  saveComments(ctx.team.id, nextComments);

  return ok('message deleted', {
    message_id: messageId,
    team_id: ctx.team.id,
  });
}

export function handleTeamMessageComment(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'add') {
    const messageId = asString(input.message_id ?? input.messageId);
    const content = asString(input.content);
    if (!messageId || !content) return fail('message_id and content are required', 'INVALID_ARGUMENT');
    const ctx = findMessageContext(messageId);
    if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
    if (!canAccessMessage(messageId, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const now = new Date().toISOString();
    const comment: TeamMessageComment = {
      id: uuid(),
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
    saveComments(ctx.team.id, [...listCommentsRaw(ctx.team.id), comment]);
    const deliveries = listDeliveries(ctx.team.id).map((item) =>
      item.messageId === messageId && item.recipientAgentId !== actorAgentId
        ? { ...item, unreadCommentCount: item.unreadCommentCount + 1, updatedAt: now }
        : item,
    );
    saveDeliveries(ctx.team.id, deliveries);
    return ok('comment added', { comment: commentView(comment) });
  }

  if (action === 'list') {
    const messageId = asString(input.message_id ?? input.messageId);
    if (!messageId) return fail('message_id is required', 'INVALID_ARGUMENT');
    const ctx = findMessageContext(messageId);
    if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
    if (!canAccessMessage(messageId, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    const includeDeleted = asBoolean(input.include_deleted ?? input.includeDeleted);
    const comments = listCommentsRaw(ctx.team.id)
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
    const ctx = findCommentContext(commentId);
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
    saveComments(ctx.team.id, ctx.comments.map((item) => item.id === commentId ? updated : item));
    return ok('comment deleted', {
      comment_id: commentId,
      deleted_at: now,
      status: 'deleted',
    });
  }

  return fail('invalid action', 'INVALID_ACTION');
}
