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
  data: {
    senderId: string;
    content: string;
    type?: Message['type'];
    senderRole?: string;
    status?: Message['status'];
    attachments?: Message['attachments'];
    parts?: Message['parts'];
    metadata?: Message['metadata'];
  },
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
    attachments: data.attachments,
    parts: data.parts,
    metadata: data.metadata,
    createdAt: new Date().toISOString(),
  };
  messages.push(message);
  writeJsonFile(path, messages);
  return message;
}

export function updateMessage(
  workspaceId: string,
  channelId: string,
  messageId: string,
  data: Partial<Pick<Message, 'content' | 'status' | 'senderRole' | 'type' | 'attachments' | 'parts' | 'metadata' | 'replies'>>,
): Message | null {
  const path = messageFilePath(workspaceId, channelId);
  const messages = readJsonFile<Message[]>(path) || [];
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return null;

  const updated: Message = {
    ...messages[index],
    ...data,
  };
  messages[index] = updated;
  writeJsonFile(path, messages);
  return updated;
}

export function appendMessageReply(
  workspaceId: string,
  channelId: string,
  messageId: string,
  data: {
    senderId: string;
    content: string;
    senderRole?: string;
    status?: Message['status'];
    attachments?: Message['attachments'];
    parts?: Message['parts'];
    metadata?: Message['metadata'];
  },
): Message | null {
  const path = messageFilePath(workspaceId, channelId);
  const messages = readJsonFile<Message[]>(path) || [];
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return null;

  const reply = {
    id: uuid(),
    senderId: data.senderId,
    senderRole: data.senderRole,
    content: data.content,
    status: data.status,
    attachments: data.attachments,
    parts: data.parts,
    metadata: data.metadata,
    createdAt: new Date().toISOString(),
  };
  const updated: Message = {
    ...messages[index],
    replies: [...(messages[index].replies ?? []), reply],
  };
  messages[index] = updated;
  writeJsonFile(path, messages);
  return updated;
}

export function deleteMessage(
  workspaceId: string,
  channelId: string,
  messageId: string,
): boolean {
  const path = messageFilePath(workspaceId, channelId);
  const messages = readJsonFile<Message[]>(path) || [];
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return false;
  messages.splice(index, 1);
  writeJsonFile(path, messages);
  return true;
}

export function clearMessages(workspaceId: string, channelId: string): boolean {
  const path = messageFilePath(workspaceId, channelId);
  const messages = readJsonFile<Message[]>(path) || [];
  if (messages.length === 0) return false;
  writeJsonFile(path, []);
  return true;
}
