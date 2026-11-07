import pty from 'node-pty';
import { v4 as uuid } from 'uuid';
import { accessSync, constants } from 'node:fs';

const MAX_BUFFER_LINES = 1000;
const DEFAULT_READ_LIMIT = 100;
const DEBUG_TERMINAL_DUP = '[DEBUG-terminal-dup]';

interface PtySession {
  id: string;
  pty: pty.IPty;
  workspaceId: string;
  cwd: string;
  shell: string;
  buffer: string[];
  output: string;
}

const sessions = new Map<string, PtySession>();

export function createSession(
  workspaceId: string,
  cwd: string,
  onOutput: (sessionId: string, data: string) => void,
  onExit: (sessionId: string, exitCode: number) => void,
  shell?: string,
  env?: Record<string, string>,
  sessionId?: string,
): string {
  const id = sessionId || uuid();
  console.log(DEBUG_TERMINAL_DUP, 'server pty.createSession start', {
    workspaceId,
    sessionId: id,
    cwd,
    shell,
    existingSessionIds: Array.from(sessions.keys()),
  });
  if (sessions.has(id)) {
    throw new Error(`Terminal session already exists: ${id}`);
  }
  const resolvedShell = resolveShell(shell);
  const ptyEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) ptyEnv[k] = v;
  }
  if (env) Object.assign(ptyEnv, env);
  const ptyProcess = pty.spawn(resolvedShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: ptyEnv,
  });

  const session: PtySession = { id, pty: ptyProcess, workspaceId, cwd, shell: resolvedShell, buffer: [], output: '' };

  ptyProcess.onData((data) => {
    console.log(DEBUG_TERMINAL_DUP, 'server pty.onData', {
      workspaceId,
      sessionId: id,
      outputLength: data.length,
      preview: data.slice(0, 80),
    });
    session.buffer.push(data);
    if (session.buffer.length > MAX_BUFFER_LINES) {
      session.buffer = session.buffer.slice(-MAX_BUFFER_LINES);
    }
    session.output = trimOutputLines(session.output + data, MAX_BUFFER_LINES);
    onOutput(id, data);
  });
  ptyProcess.onExit(({ exitCode }) => onExit(id, exitCode ?? 0));

  sessions.set(id, session);
  console.log(DEBUG_TERMINAL_DUP, 'server pty.createSession stored', {
    workspaceId,
    sessionId: id,
    resolvedShell,
    sessionCount: sessions.size,
  });
  return id;
}

export function write(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.pty.write(data);
  return true;
}

export function resize(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.pty.resize(cols, rows);
  return true;
}

export function kill(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.pty.kill();
  sessions.delete(sessionId);
  return true;
}

export function getSession(sessionId: string): PtySession | undefined {
  return sessions.get(sessionId);
}

export function getSessionsByWorkspace(workspaceId: string): PtySession[] {
  const result: PtySession[] = [];
  for (const session of sessions.values()) {
    if (session.workspaceId === workspaceId) result.push(session);
  }
  return result;
}

export function readSessionOutput(
  workspaceId: string,
  sessionId: string,
  options: { offset?: number; limit?: number } = {},
): { sessionId: string; offset: number; limit: number; totalLines: number; lines: string[]; text: string } {
  const session = sessions.get(sessionId);
  if (!session || session.workspaceId !== workspaceId) {
    throw new Error(`Terminal session not found: ${sessionId}`);
  }

  const lines = normalizeOutput(session.output).split('\n');
  const totalLines = lines.length === 1 && lines[0] === '' ? 0 : lines.length;
  const limit = normalizePositiveInteger(options.limit, DEFAULT_READ_LIMIT);
  const offset = normalizeNonNegativeInteger(options.offset);
  const start = Math.max(totalLines - offset - limit, 0);
  const end = Math.max(totalLines - offset, 0);
  const page = totalLines === 0 ? [] : lines.slice(start, end);

  return {
    sessionId,
    offset,
    limit,
    totalLines,
    lines: page,
    text: page.join('\n'),
  };
}

function normalizeOutput(output: string): string {
  return stripAnsi(output).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '');
}

function trimOutputLines(output: string, maxLines: number): string {
  const lines = output.split(/\r\n|\n|\r/);
  if (lines.length <= maxLines) return output;
  return lines.slice(-maxLines).join('\n');
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_BUFFER_LINES, Math.max(1, Math.floor(value)));
}

function normalizeNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, '');
}

function resolveShell(shell?: string): string {
  if (process.platform === 'win32') {
    return shell || 'powershell.exe';
  }
  const candidates = [shell, process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      accessSync(candidate!, constants.X_OK);
      return candidate!;
    } catch {
      continue;
    }
  }
  throw new Error(`No available shell found. Tried: ${candidates.join(', ')}`);
}
