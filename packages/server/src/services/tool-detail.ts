import { join } from 'node:path';
import { readJsonFile, writeJsonFile, getDataDir } from '../storage/json-store.js';

export interface ToolDetail {
  id: string;
  workspaceId: string;
  channelId: string;
  messageId: string;
  title: string;
  raw: string;
  input?: unknown;
  output?: unknown;
  createdAt: string;
  updatedAt?: string;
}

function detailFilePath(workspaceId: string, channelId: string): string {
  return join(getDataDir(), 'workspaces', workspaceId, 'channels', channelId, 'tool-details.json');
}

export function saveToolDetails(workspaceId: string, channelId: string, details: ToolDetail[]): void {
  const path = detailFilePath(workspaceId, channelId);
  const existing = readJsonFile<ToolDetail[]>(path) || [];
  const nextById = new Map(existing.map((detail) => [detail.id, detail]));

  for (const detail of details) {
    nextById.set(detail.id, detail);
  }

  writeJsonFile(path, Array.from(nextById.values()));
}

export function getToolDetail(
  workspaceId: string,
  channelId: string,
  messageId: string,
  detailId: string,
): ToolDetail | null {
  const details = readJsonFile<ToolDetail[]>(detailFilePath(workspaceId, channelId)) || [];
  return details.find((detail) => detail.messageId === messageId && detail.id === detailId) ?? null;
}
