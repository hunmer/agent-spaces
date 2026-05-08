// packages/server/src/services/command-process-manager.ts
import type { CommandProcess } from '@agent-spaces/shared';
import * as ptyService from './pty.js';
import * as commandService from './command.js';
import { getWorkspace } from '../storage/workspace-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

const processes = new Map<string, CommandProcess>();
const sessionIndex = new Map<string, string>();
const restartTimers = new Map<string, NodeJS.Timeout>();

export function runCommand(workspaceId: string, commandId: string): string {
  const existing = processes.get(commandId);
  if (existing) {
    console.log(`[command] reuse existing session=${existing.sessionId} for command=${commandId}`);
    return existing.sessionId;
  }

  const command = commandService.getCommand(workspaceId, commandId);
  if (!command) throw new Error('Command not found');

  const workspace = getWorkspace(workspaceId);
  const cwd = command.cwd || workspace?.boundDirs[0] || process.env.HOME || '/tmp';
  const shell = command.shell;
  const env = command.env;
  console.log(`[command] runCommand: workspace=${workspaceId} command=${commandId} cwd=${cwd} shell=${shell} cmd=${command.command}`);

  const sessionId = ptyService.createSession(
    workspaceId,
    cwd,
    (id, output) => {
      broadcastToWorkspace(workspaceId, 'terminal.output', { sessionId: id, data: output });
    },
    (id, exitCode) => {
      handlePtyExit(id, exitCode);
    },
    shell,
    env,
  );

  const now = new Date().toISOString();
  const process: CommandProcess = {
    commandId,
    workspaceId,
    sessionId,
    status: 'running',
    startedAt: now,
    restartCount: 0,
  };

  processes.set(commandId, process);
  sessionIndex.set(sessionId, commandId);

  ptyService.write(sessionId, command.command + '\r');

  broadcastToWorkspace(workspaceId, 'terminal.created', { sessionId, cwd, shell });
  console.log(`[command] broadcasted terminal.created: session=${sessionId} cwd=${cwd}`);
  broadcastToWorkspace(workspaceId, 'command.started', {
    commandId,
    sessionId,
    workspaceId,
  });

  return sessionId;
}

export function stopCommand(workspaceId: string, commandId: string): void {
  const process = processes.get(commandId);
  if (!process) throw new Error('Command not running');
  console.log(`[command] stopCommand: command=${commandId} session=${process.sessionId}`);

  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  ptyService.write(process.sessionId, '\x03');
  process.status = 'stopping';
}

function handlePtyExit(sessionId: string, exitCode: number): void {
  const commandId = sessionIndex.get(sessionId);
  if (!commandId) return;
  console.log(`[command] handlePtyExit: session=${sessionId} command=${commandId} exitCode=${exitCode}`);

  const process = processes.get(commandId);
  if (!process) return;

  processes.delete(commandId);
  sessionIndex.delete(sessionId);
  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  const { workspaceId } = process;

  const command = commandService.getCommand(workspaceId, commandId);
  if (command?.autoRestart === true && process.status !== 'stopping') {
    const restartCount = process.restartCount + 1;
    broadcastToWorkspace(workspaceId, 'command.restarted', {
      commandId,
      sessionId: process.sessionId,
      restartCount,
      workspaceId,
    });
    const t = setTimeout(() => {
      restartTimers.delete(commandId);
      try {
        runCommand(workspaceId, commandId);
      } catch {
        // Command may have been deleted during delay
      }
    }, 1000);
    restartTimers.set(commandId, t);
  } else {
    broadcastToWorkspace(workspaceId, 'terminal.closed', { sessionId, exitCode });
    broadcastToWorkspace(workspaceId, 'command.stopped', {
      commandId,
      exitCode,
      workspaceId,
    });
  }
}

export function getCommandProcess(commandId: string): CommandProcess | undefined {
  return processes.get(commandId);
}

export function getCommandProcesses(workspaceId: string): CommandProcess[] {
  const result: CommandProcess[] = [];
  for (const process of processes.values()) {
    if (process.workspaceId === workspaceId) result.push(process);
  }
  return result;
}

export function cleanup(workspaceId: string): void {
  for (const [commandId, process] of processes) {
    if (process.workspaceId === workspaceId) {
      const timer = restartTimers.get(commandId);
      if (timer) clearTimeout(timer);
      restartTimers.delete(commandId);
      sessionIndex.delete(process.sessionId);
      processes.delete(commandId);
    }
  }
}
