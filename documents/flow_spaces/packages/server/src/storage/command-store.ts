import type { QuickCommand } from '@agent-spaces/shared';
import { ensureDir, readJsonFile, writeJsonFile } from './json-store.js';
import path from 'node:path';
import { getDataDir } from './json-store.js';

function commandsFile(workspaceId: string) {
  return path.join(getDataDir(), 'workspaces', workspaceId, 'commands.json');
}

export function listCommands(workspaceId: string): QuickCommand[] {
  return readJsonFile<QuickCommand[]>(commandsFile(workspaceId)) ?? [];
}

export function getCommand(workspaceId: string, commandId: string): QuickCommand | null {
  return listCommands(workspaceId).find(c => c.id === commandId) ?? null;
}

export function saveCommands(workspaceId: string, commands: QuickCommand[]): void {
  ensureDir(path.dirname(commandsFile(workspaceId)));
  writeJsonFile(commandsFile(workspaceId), commands);
}
