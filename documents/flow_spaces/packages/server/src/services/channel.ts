import { v4 as uuid } from 'uuid';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile, ensureDir, getDataDir } from '../storage/json-store.js';
import { existsSync, renameSync, rmSync } from 'node:fs';
import type { Channel, Message } from '@agent-spaces/shared';
import { getWorkspace } from '../storage/workspace-store.js';
import * as agentService from '../services/agent.js';
import { loadTeam } from './team-internal.js';

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

export function createChannel(
  workspaceId: string,
  data: { id?: string; name: string; type: Channel['type']; members?: string[]; teamIds?: string[]; issueId?: string; overwrite?: boolean },
): { channel: Channel; created: boolean } {
  const channels = listChannels(workspaceId);
  const requestedId = normalizeRequestedId(data.id);
  if (requestedId) {
    const existingById = channels.find((c) => c.id === requestedId);
    if (existingById) return { channel: existingById, created: false };
  }
  if (!data.overwrite) {
    const existing = channels.find((c) => c.name === data.name && c.type === data.type && !c.archived);
    if (existing) {
      const channel = requestedId ? migrateChannelId(workspaceId, channels, existing, requestedId) : existing;
      return { channel, created: false };
    }
  }
  const channel: Channel = {
    id: requestedId ?? uuid(),
    workspaceId,
    name: data.name,
    type: data.type,
    issueId: data.issueId,
    members: normalizeMembers(workspaceId, data.members),
    teamIds: normalizeTeamIds(data.teamIds),
    createdAt: new Date().toISOString(),
  };
  channels.push(channel);
  writeJsonFile(channelsPath(workspaceId), channels);
  ensureDir(join(workspaceDir(workspaceId), 'channels', channel.id));
  return { channel, created: true };
}

function normalizeRequestedId(id: string | undefined): string | undefined {
  const trimmed = id?.trim();
  if (!trimmed) return undefined;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : undefined;
}

function migrateChannelId(
  workspaceId: string,
  channels: Channel[],
  channel: Channel,
  nextId: string,
): Channel {
  if (channel.id === nextId) return channel;
  if (channels.some((item) => item.id === nextId)) return channel;

  const previousId = channel.id;
  channel.id = nextId;
  writeJsonFile(channelsPath(workspaceId), channels);

  const previousDir = join(workspaceDir(workspaceId), 'channels', previousId);
  const nextDir = join(workspaceDir(workspaceId), 'channels', nextId);
  if (existsSync(previousDir) && !existsSync(nextDir)) {
    renameSync(previousDir, nextDir);
  } else {
    ensureDir(nextDir);
  }

  const messages = readJsonFile<Message[]>(messagesPath(workspaceId, nextId));
  if (messages) {
    writeJsonFile(
      messagesPath(workspaceId, nextId),
      messages.map((message) => ({ ...message, channelId: nextId })),
    );
  }

  return channel;
}

export function updateChannel(
  workspaceId: string,
  channelId: string,
  data: Partial<Pick<Channel, 'name' | 'type' | 'issueId' | 'members' | 'teamIds' | 'pinnedMentionId' | 'draft' | 'todos' | 'archived'>>,
): Channel | null {
  const channels = listChannels(workspaceId);
  const idx = channels.findIndex((c) => c.id === channelId);
  if (idx === -1) return null;
  if (data.name !== undefined) channels[idx].name = data.name;
  if (data.type !== undefined) channels[idx].type = data.type;
  if (Object.hasOwn(data, 'issueId')) channels[idx].issueId = data.issueId;
  if (data.members !== undefined) channels[idx].members = normalizeMembers(workspaceId, data.members);
  if (data.teamIds !== undefined) channels[idx].teamIds = normalizeTeamIds(data.teamIds);
  if (Object.hasOwn(data, 'pinnedMentionId')) channels[idx].pinnedMentionId = data.pinnedMentionId;
  if (Object.hasOwn(data, 'draft')) channels[idx].draft = data.draft;
  if (Object.hasOwn(data, 'todos')) channels[idx].todos = data.todos;
  if (Object.hasOwn(data, 'archived')) channels[idx].archived = data.archived;
  writeJsonFile(channelsPath(workspaceId), channels);
  return channels[idx];
}

function normalizeMembers(workspaceId: string, members: string[] = []): string[] {
  const agentIds = new Set(agentService.listPresets(workspaceId).map((agent) => agent.id));
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (!agentIds.has(member)) continue;
    if (seen.has(member)) continue;
    seen.add(member);
    normalized.push(member);
  }

  return normalized;
}

function normalizeTeamIds(teamIds: unknown): string[] {
  if (!Array.isArray(teamIds)) return [];
  return [...new Set(teamIds.filter((teamId): teamId is string => typeof teamId === 'string' && Boolean(teamId.trim())))]
    .filter((teamId) => loadTeam(teamId)?.status === 'active');
}

export function deleteChannel(workspaceId: string, channelId: string): boolean {
  const channels = listChannels(workspaceId);
  const idx = channels.findIndex((c) => c.id === channelId);
  if (idx === -1) return false;
  channels.splice(idx, 1);
  writeJsonFile(channelsPath(workspaceId), channels);
  const channelDir = join(workspaceDir(workspaceId), 'channels', channelId);
  rmSync(channelDir, { recursive: true, force: true });
  return true;
}

export function ensureGeneralChannel(workspaceId: string): void {
  const channels = listChannels(workspaceId);
  if (!channels.some((c) => c.name === 'general')) {
    createChannel(workspaceId, { name: 'general', type: 'general', overwrite: true });
  }
}
