import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from '../storage/json-store.js';
import type { Channel } from '@agent-spaces/shared';

function workspaceDir(workspaceId: string) {
  return join(getDataDir(), 'workspaces', workspaceId);
}

function channelsPath(workspaceId: string) {
  return join(workspaceDir(workspaceId), 'channels', 'index.json');
}

function messagesPath(workspaceId: string, channelId: string) {
  return join(workspaceDir(workspaceId), 'channels', channelId, 'messages.json');
}

export function listChannels(workspaceId: string): Channel[] {
  return readJsonFile<Channel[]>(channelsPath(workspaceId)) || [];
}

export function getChannel(workspaceId: string, channelId: string): Channel | undefined {
  return listChannels(workspaceId).find((c) => c.id === channelId);
}

export function createChannel(workspaceId: string, data: { name: string; type: Channel['type']; members?: string[] }): Channel {
  const channels = listChannels(workspaceId);
  const channel: Channel = {
    id: uuid(),
    workspaceId,
    name: data.name,
    type: data.type,
    members: data.members || ['user'],
    createdAt: new Date().toISOString(),
  };
  channels.push(channel);
  writeJsonFile(channelsPath(workspaceId), channels);
  ensureDir(join(workspaceDir(workspaceId), 'channels', channel.id));
  return channel;
}

export function updateChannel(workspaceId: string, channelId: string, data: Partial<Pick<Channel, 'name' | 'type' | 'members'>>): Channel | null {
  const channels = listChannels(workspaceId);
  const idx = channels.findIndex((c) => c.id === channelId);
  if (idx === -1) return null;
  if (data.name !== undefined) channels[idx].name = data.name;
  if (data.type !== undefined) channels[idx].type = data.type;
  if (data.members !== undefined) channels[idx].members = data.members;
  writeJsonFile(channelsPath(workspaceId), channels);
  return channels[idx];
}

export function ensureGeneralChannel(workspaceId: string): void {
  const channels = listChannels(workspaceId);
  if (!channels.some((c) => c.name === 'general')) {
    createChannel(workspaceId, { name: 'general', type: 'general' });
  }
}
