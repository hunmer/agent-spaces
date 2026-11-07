import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WorkspaceWS } from '@/lib/ws';

export interface TerminalRegistryEntry {
  xterm: Terminal;
  fit: FitAddon;
  inputDisposable?: { dispose: () => void };
  outputHandler?: (data: unknown) => void;
  lastResize?: { cols: number; rows: number };
}

export interface TerminalRegistrySessionStats {
  sessionId: string;
  bufferLines: number;
  outputBytes: number;
  cols: number;
  rows: number;
}

const terminalRegistry = new Map<string, TerminalRegistryEntry>();

export function getTerminalRegistryEntry(sessionId: string): TerminalRegistryEntry | undefined {
  return terminalRegistry.get(sessionId);
}

export function registerTerminalRegistryEntry(sessionId: string, entry: TerminalRegistryEntry): void {
  terminalRegistry.set(sessionId, entry);
}

export function getTerminalRegistrySessionIds(): string[] {
  return [...terminalRegistry.keys()];
}

export function getTerminalRegistrySize(): number {
  return terminalRegistry.size;
}

export function disposeTerminalSession(sessionId: string, ws?: WorkspaceWS | null): void {
  const cached = terminalRegistry.get(sessionId);
  if (!cached) return;

  if (cached.outputHandler) {
    ws?.off('terminal.output', cached.outputHandler);
  }
  cached.inputDisposable?.dispose();
  cached.xterm.dispose();
  terminalRegistry.delete(sessionId);
}

export function disposeAllTerminalSessions(ws?: WorkspaceWS | null): void {
  for (const sessionId of terminalRegistry.keys()) {
    disposeTerminalSession(sessionId, ws);
  }
}

function getXtermOutputBytes(xterm: Terminal): { bufferLines: number; outputBytes: number } {
  const buffer = xterm.buffer.active;
  let outputBytes = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    outputBytes += buffer.getLine(index)?.translateToString(true).length ?? 0;
  }

  return {
    bufferLines: buffer.length,
    outputBytes,
  };
}

export function getTerminalRegistryStats(): {
  sessionCount: number;
  sessionIds: string[];
  sessions: TerminalRegistrySessionStats[];
  outputBytes: number;
} {
  const sessions = [...terminalRegistry.entries()].map(([sessionId, entry]) => {
    const output = getXtermOutputBytes(entry.xterm);
    return {
      sessionId,
      bufferLines: output.bufferLines,
      outputBytes: output.outputBytes,
      cols: entry.xterm.cols,
      rows: entry.xterm.rows,
    };
  });

  return {
    sessionCount: terminalRegistry.size,
    sessionIds: [...terminalRegistry.keys()],
    sessions,
    outputBytes: sessions.reduce((total, session) => total + session.outputBytes, 0),
  };
}

export function updateTerminalResize(sessionId: string, cols: number, rows: number): void {
  const entry = terminalRegistry.get(sessionId);
  if (entry) {
    entry.lastResize = { cols, rows };
  }
}
