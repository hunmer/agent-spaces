import { v4 as uuid } from 'uuid';
import type { QuickCommand } from '@agent-spaces/shared';
import * as commandStore from '../storage/command-store.js';

export function listCommands(workspaceId: string): QuickCommand[] {
  return commandStore.listCommands(workspaceId);
}

export function getCommand(workspaceId: string, commandId: string): QuickCommand | null {
  return commandStore.getCommand(workspaceId, commandId);
}

export interface CreateCommandInput {
  name: string;
  command: string;
  cwd?: string;
  shell?: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
}

export function createCommand(workspaceId: string, input: CreateCommandInput): QuickCommand {
  const now = new Date().toISOString();
  const cmd: QuickCommand = {
    id: uuid(),
    name: input.name.trim(),
    command: input.command,
    cwd: input.cwd,
    shell: input.shell,
    env: input.env,
    autoRestart: input.autoRestart,
    createdAt: now,
    updatedAt: now,
  };
  const commands = commandStore.listCommands(workspaceId);
  commands.push(cmd);
  commandStore.saveCommands(workspaceId, commands);
  return cmd;
}

export function updateCommand(
  workspaceId: string,
  commandId: string,
  updates: Partial<Omit<QuickCommand, 'id' | 'createdAt'>>,
): QuickCommand {
  const commands = commandStore.listCommands(workspaceId);
  const idx = commands.findIndex(c => c.id === commandId);
  if (idx === -1) throw new Error('Command not found');
  commands[idx] = {
    ...commands[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  commandStore.saveCommands(workspaceId, commands);
  return commands[idx];
}

export function deleteCommand(workspaceId: string, commandId: string): void {
  const commands = commandStore.listCommands(workspaceId);
  const filtered = commands.filter(c => c.id !== commandId);
  if (filtered.length === commands.length) throw new Error('Command not found');
  commandStore.saveCommands(workspaceId, filtered);
}
