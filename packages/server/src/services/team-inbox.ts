import type { TeamInboxItem, TeamMessage, TeamServiceResult } from './team-types.js';
import {
  asBoolean,
  asString,
  fail,
  findDeliveryContext,
  findMessageContext,
  inboxView,
  isManagerRole,
  isObject,
  listDeliveries,
  listMessages,
  listTeamsRaw,
  messageView,
  nextPageToken,
  ok,
  parseExecutionStatus,
  parseInboxStatus,
  parsePage,
  resolveEffectiveMembership,
  saveDeliveries,
} from './team-internal.js';

export function handleTeamInboxQuery(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const action = asString(input.action);
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  if (!action || !actorAgentId) return fail('action and actor_agent_id are required', 'INVALID_ARGUMENT');

  if (action === 'list') {
    const recipientAgentId = asString(input.recipient_agent_id ?? input.recipientAgentId) ?? actorAgentId;
    const teamFilter = asString(input.team_id ?? input.teamId);
    // 跨成员查询收件箱：非成员（管理视角）回退 owner 身份，不报权限错误
    if (recipientAgentId !== actorAgentId && teamFilter) {
      if (!resolveEffectiveMembership(teamFilter, actorAgentId)) return fail('permission denied', 'PERMISSION_DENIED');
    }
    const items = listTeamsRaw()
      .flatMap((team) => listDeliveries(team.id))
      .filter((item) => item.recipientAgentId === recipientAgentId)
      .filter((item) => {
        return !teamFilter || item.teamId === teamFilter;
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
    // 按 teamId 预加载 messages，给每条投递附带正文（供前端 markdown 渲染）
    const messagesByTeam = new Map<string, Map<string, TeamMessage>>();
    const ensureTeamMessages = (teamId: string) => {
      let map = messagesByTeam.get(teamId);
      if (!map) {
        map = new Map(listMessages(teamId).map((item) => [item.id, item]));
        messagesByTeam.set(teamId, map);
      }
      return map;
    };
    return ok('inbox listed', {
      inbox_items: items.slice(offset, offset + size).map((item) => {
        const view = inboxView(item);
        const msg = ensureTeamMessages(item.teamId).get(item.messageId);
        return {
          ...view,
          subject: msg?.subject ?? '',
          body: msg?.body ?? item.preview ?? '',
          body_format: msg?.bodyFormat ?? 'plain_text',
        };
      }),
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
      // 非成员（管理视角）回退 owner 身份，不报权限错误
      if (ctx.delivery.recipientAgentId !== actorAgentId
        && !resolveEffectiveMembership(ctx.team.id, actorAgentId)) {
        return fail('permission denied', 'PERMISSION_DENIED');
      }
      inboxItem = ctx.delivery;
      message = listMessages(ctx.team.id).find((item) => item.id === ctx.delivery.messageId);
    } else if (messageId) {
      const ctx = findMessageContext(messageId);
      if (!ctx) return fail('message not found', 'MESSAGE_NOT_FOUND');
      // 非成员（管理视角）回退 owner 身份，查收件人为 owner 或 actor 的投递
      const fallbackMembership = resolveEffectiveMembership(ctx.team.id, actorAgentId);
      const effectiveRecipient = fallbackMembership?.agentId ?? actorAgentId;
      inboxItem = listDeliveries(ctx.team.id).find((item) => item.messageId === messageId && item.recipientAgentId === effectiveRecipient);
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

/**
 * 删除单条 inbox 投递（仅移除该收件人的一条 delivery，不影响 message 本体和其他收件人）。
 * 权限：收件人本人，或该 team 的 owner/admin。
 */
export function handleTeamInboxDelete(input: unknown): TeamServiceResult {
  if (!isObject(input)) return fail('tool input must be an object', 'INVALID_ARGUMENT');
  const actorAgentId = asString(input.actor_agent_id ?? input.actorAgentId);
  const deliveryId = asString(input.delivery_id ?? input.deliveryId);
  if (!actorAgentId || !deliveryId) {
    return fail('actor_agent_id and delivery_id are required', 'INVALID_ARGUMENT');
  }
  const ctx = findDeliveryContext(deliveryId);
  if (!ctx) return fail('delivery not found', 'DELIVERY_NOT_FOUND');

  const actorMembership = resolveEffectiveMembership(ctx.team.id, actorAgentId);
  const canDelete = ctx.delivery.recipientAgentId === actorAgentId
    || isManagerRole(actorMembership);
  if (!canDelete) return fail('permission denied', 'PERMISSION_DENIED');

  const nextDeliveries = ctx.deliveries.filter((item) => item.id !== deliveryId);
  saveDeliveries(ctx.team.id, nextDeliveries);

  return ok('delivery deleted', {
    delivery_id: deliveryId,
    team_id: ctx.team.id,
  });
}
