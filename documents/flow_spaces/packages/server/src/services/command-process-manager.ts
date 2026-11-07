// packages/server/src/services/command-process-manager.ts
import { statSync } from 'node:fs';
import { dirname } from 'node:path';
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
  const rawCwd = command.cwd || workspace?.boundDirs[0] || process.env.HOME || process.env.USERPROFILE || (process.platform === 'win32' ? process.env.SYSTEMROOT || 'C:\\' : '/tmp');
  let cwd: string;
  try {
    cwd = statSync(rawCwd).isFile() ? dirname(rawCwd) : rawCwd;
  } catch {
    cwd = rawCwd;
  }
  const shell = command.shell;
  const env = command.env;
  console.log(`[command] runCommand: workspace=${workspaceId} command=${commandId} cwd=${cwd} shell=${shell} cmd=${command.command}`);

  let sessionId: string;
  try {
    sessionId = ptyService.createSession(
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
  } catch (err: any) {
    console.error(`[command] pty.spawn failed: ${err.message}`);
    throw new Error(`Failed to spawn terminal: ${err.message}`);
  }

  const now = new Date().toISOString();
  const cmdProcess: CommandProcess = {
    commandId,
    workspaceId,
    sessionId,
    status: 'running',
    startedAt: now,
    restartCount: 0,
  };

  processes.set(commandId, cmdProcess);
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
  const cmdProcess = processes.get(commandId);
  if (!cmdProcess) throw new Error('Command not running');
  console.log(`[command] stopCommand: command=${commandId} session=${cmdProcess.sessionId}`);

  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  ptyService.write(cmdProcess.sessionId, '\x03');
  cmdProcess.status = 'stopping';
}

export function restartCommand(workspaceId: string, commandId: string): string {
  const cmdProcess = processes.get(commandId);
  if (!cmdProcess) return runCommand(workspaceId, commandId);

  console.log(`[command] restartCommand: command=${commandId} session=${cmdProcess.sessionId}`);

  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  processes.delete(commandId);
  sessionIndex.delete(cmdProcess.sessionId);
  ptyService.kill(cmdProcess.sessionId);
  broadcastToWorkspace(workspaceId, 'terminal.closed', { sessionId: cmdProcess.sessionId });

  return runCommand(workspaceId, commandId);
}

function handlePtyExit(sessionId: string, exitCode: number): void {
  const commandId = sessionIndex.get(sessionId);
  if (!commandId) return;
  console.log(`[command] handlePtyExit: session=${sessionId} command=${commandId} exitCode=${exitCode}`);

  const cmdProcess = processes.get(commandId);
  if (!cmdProcess) return;

  processes.delete(commandId);
  sessionIndex.delete(sessionId);
  const timer = restartTimers.get(commandId);
  if (timer) {
    clearTimeout(timer);
    restartTimers.delete(commandId);
  }

  const { workspaceId } = cmdProcess;

  const command = commandService.getCommand(workspaceId, commandId);
  if (command?.autoRestart === true && cmdProcess.status !== 'stopping') {
    const restartCount = cmdProcess.restartCount + 1;
    broadcastToWorkspace(workspaceId, 'command.restarted', {
      commandId,
      sessionId: cmdProcess.sessionId,
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
  for (const cmdProcess of processes.values()) {
    if (cmdProcess.workspaceId === workspaceId) result.push(cmdProcess);
  }
  return result;
}

export function readTerminalOutput(
  workspaceId: string,
  sessionId: string,
  options?: { offset?: number; limit?: number },
) {
  return ptyService.readSessionOutput(workspaceId, sessionId, options);
}

export function cleanup(workspaceId: string): void {
  for (const [commandId, cmdProcess] of processes) {
    if (cmdProcess.workspaceId === workspaceId) {
      const timer = restartTimers.get(commandId);
      if (timer) clearTimeout(timer);
      restartTimers.delete(commandId);
      sessionIndex.delete(cmdProcess.sessionId);
      processes.delete(commandId);
    }
  }
}
