import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile, getDataDir } from '../storage/json-store.js';
import type { Message } from '@agent-spaces/shared';

export interface MessageListOptions {
  limit?: number;
  before?: string;
}

function messageFilePath(workspaceId: string, channelId: string): string {
  return join(getDataDir(), 'workspaces', workspaceId, 'channels', channelId, 'messages.json');
}

export function listMessages(workspaceId: string, channelId: string, opts: MessageListOptions = {}): Message[] {
  const all = readJsonFile<Message[]>(messageFilePath(workspaceId, channelId)) || [];
  const limit = opts.limit || 50;

  if (opts.before) {
    const idx = all.findIndex((m) => m.id === opts.before);
    if (idx <= 0) return [];
    return all.slice(Math.max(0, idx - limit), idx);
  }

  return all.slice(-limit);
}

export function createMessage(
  workspaceId: string,
  channelId: string,
  data: { senderId: string; content: string; type?: Message['type']; senderRole?: string; status?: Message['status'] },
): Message {
  const path = messageFilePath(workspaceId, channelId);
  const messages = readJsonFile<Message[]>(path) || [];
  const message: Message = {
    id: uuid(),
    channelId,
    senderId: data.senderId,
    senderRole: data.senderRole,
    content: data.content,
    type: data.type || 'text',
    status: data.status,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  writeJsonFile(path, messages);
  return message;
}
