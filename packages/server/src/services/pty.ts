import pty from 'node-pty';
import { v4 as uuid } from 'uuid';

interface PtySession {
  id: string;
  pty: pty.IPty;
  workspaceId: string;
  cwd: string;
}

const sessions = new Map<string, PtySession>();

export function createSession(
  workspaceId: string,
  cwd: string,
  onOutput: (sessionId: string, data: string) => void,
  onExit: (sessionId: string, exitCode: number) => void,
  shell?: string,
): string {
  const id = uuid();
  const resolvedShell = shell || process.env.SHELL || '/bin/zsh';
  const ptyProcess = pty.spawn(resolvedShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env as Record<string, string> },
  });

  ptyProcess.onData((data) => onOutput(id, data));
  ptyProcess.onExit(({ exitCode }) => onExit(id, exitCode ?? 0));

  sessions.set(id, { id, pty: ptyProcess, workspaceId, cwd });
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
