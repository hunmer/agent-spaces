import { v4 as uuid } from 'uuid';
import type {
  TeamInboxItem,
  TeamInboxStatus,
  TeamMessage,
  TeamMessageComment,
  TeamServiceResult,
} from './team-types.js';
import {
  applyDeliveryStatusRules,
  asBoolean,
  asString,
  canAccessMessage,
  commentView,
  fail,
  findCommentContext,
  findDeliveryContext,
  findMessageContext,
  getActiveMembership,
  inboxView,
  isManagerRole,
  isObject,
  listCommentsRaw,
  listDeliveries,
  listMessages,
  loadTeam,
  messageView,
  nextPageToken,
  ok,
  parseBodyFormat,
  parsePage,
  parseCommentFormat,
  parseCommentVisibility,
  parseExecutionStatus,
  parseInboxStatus,
  parsePriority,
  previewText,
  resolveEffectiveMembership,
  resolveRecipients,
  saveComments,
  saveDeliveries,
  saveMessages,
} from './team-internal.js';

export function handleTeamMessageSend(
  input: unknown,
  options: { allowExternalSender?: boolean; allowExternalRecipients?: boolean } = {},
): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const teamId = asString(input.team_id ?? input.teamId);
  const action = asString(input.action);
  if (!actorAgentId || !teamId || !action) return fail('action, actor_agent_id, team_id are required', 'INVALID_ARGUMENT');
  if (action !== 'send') return fail('invalid action', 'INVALID_ACTION');

  const team = loadTeam(teamId);
  if (!team) return fail('team not found', 'TEAM_NOT_FOUND');
  if (team.status !== 'active') return fail('team is not active', 'TEAM_DISSOLVED');
  if (!getActiveMembership(teamId, actorAgentId) && !options.allowExternalSender) {
    return fail('sender is not an active team member', 'NOT_TEAM_MEMBER');
  }

  const mode = (asString(input.mode) === 'broadcast' ? 'broadcast' : 'direct') as 'direct' | 'broadcast';
  const subject = asString(input.subject);
  const body = asString(input.body);
  if (!subject || !body) return fail('subject and body are required', 'INVALID_ARGUMENT');
  const dueAt = asString(input.due_at ?? input.dueAt) ?? null;
  if (dueAt && Number.isNaN(Date.parse(dueAt))) return fail('due_at must be a valid datetime', 'INVALID_ARGUMENT');
  const recipientsResult = resolveRecipients(teamId, mode, input, actorAgentId, options.allowExternalRecipients);
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
  // 非成员（管理视角）回退 owner 身份，不报权限错误
  if (ctx.delivery.recipientAgentId !== actorAgentId
    && !resolveEffectiveMembership(ctx.team.id, actorAgentId)) {
    return fail('permission denied', 'PERMISSION_DENIED');
  }

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
    const actorMembership = resolveEffectiveMembership(teamId, actorAgentId);
    if (!actorMembership) return fail('team has no active members', 'AGENT_NOT_FOUND');

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

  const actorMembership = resolveEffectiveMembership(ctx.team.id, actorAgentId);
  const canDelete = ctx.message.senderAgentId === actorAgentId
    || isManagerRole(actorMembership);
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
