import type { LarkMessageReceiveEvent } from './types.js';
import {
  recentLarkMessageIdsByWorkspace,
  LARK_MESSAGE_DEDUPE_TTL_MS,
} from './types.js';

export function isDuplicateLarkMessage(workspaceId: string, data: LarkMessageReceiveEvent): boolean {
  const id = data.message?.message_id
    ?? buildFallbackLarkMessageId(data)
    ?? data.header?.event_id
    ?? data.event_id;
  if (!id) return false;

  const now = Date.now();
  const seen = recentLarkMessageIdsByWorkspace.get(workspaceId) ?? new Map<string, number>();
  for (const [key, timestamp] of seen) {
    if (now - timestamp > LARK_MESSAGE_DEDUPE_TTL_MS) seen.delete(key);
  }
  recentLarkMessageIdsByWorkspace.set(workspaceId, seen);

  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

function buildFallbackLarkMessageId(data: LarkMessageReceiveEvent): string | undefined {
  const chatId = data.message?.chat_id;
  const content = data.message?.content;
  const createTime = data.message?.create_time;
  if (!chatId || !content) return undefined;
  return `${chatId}:${createTime ?? ''}:${content}`;
}

export function parseLarkText(content?: string): string {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text?.trim() ?? '';
  } catch {
    return content.trim();
  }
}
