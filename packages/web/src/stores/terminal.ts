import { create } from 'zustand';
import type { WorkspaceWS } from '@/lib/ws';
import { toast } from 'sonner';

// Buffer cache for terminal session reconnection, consumed by TerminalInstance
const sessionBufferCache = new Map<string, string>();
export function consumeSessionBuffer(sessionId: string): string | undefined {
  const buf = sessionBufferCache.get(sessionId);
  sessionBufferCache.delete(sessionId);
  return buf;
}

type SessionCreatedCallback = () => void;

export interface TerminalSession {
  id: string;
  cwd: string;
  shell?: string;
  commandId?: string;
  name?: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;
  ws: WorkspaceWS | null;
  workspaceId: string | null;
  _initialized: boolean;
  _restored: boolean;

  init: (ws: WorkspaceWS, onRestored?: SessionCreatedCallback) => void;
  createSession: (shell?: string, cwd?: string) => void;
  setActive: (id: string) => void;
  setSessionName: (id: string, name: string) => void;
  removeSession: (id: string) => void;
  sendInput: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeId: null,
  ws: null,
  workspaceId: null,
  _initialized: false,
  _restored: false,

  init: (ws, onRestored) => {
    const state = get();
    if (state._initialized && state.ws === ws) return;
    const workspaceChanged = state.workspaceId !== ws.workspaceId;
    if (workspaceChanged) {
      sessionBufferCache.clear();
    }
    set({
      ws,
      workspaceId: ws.workspaceId,
      sessions: workspaceChanged ? [] : state.sessions,
      activeId: workspaceChanged ? null : state.activeId,
      _initialized: true,
      _restored: false,
    });
    ws.on('terminal.created', (data) => {
      const { sessionId, cwd, shell } = data as { sessionId: string; cwd: string; shell?: string };
      set((s) => {
        if (s.sessions.some((t) => t.id === sessionId)) return s;
        return {
          sessions: [...s.sessions, { id: sessionId, cwd, shell }],
          activeId: sessionId,
        };
      });
    });
    ws.on('terminal.error', (data) => {
      const { error } = data as { sessionId?: string; error: string };
      toast.error(error);
    });
    ws.on('terminal.closed', (data) => {
      const { sessionId } = data as { sessionId: string };
      set((s) => {
        const sessions = s.sessions.filter((t) => t.id !== sessionId);
        const activeId = s.activeId === sessionId
          ? (sessions[0]?.id ?? null)
          : s.activeId;
        return { sessions, activeId };
      });
    });
    ws.on('terminal.sessions', (data) => {
      const { sessions: remoteSessions } = data as {
        sessions: Array<{ sessionId: string; cwd: string; shell?: string; buffer?: string }>;
      };
      set((s) => {
        const previousById = new Map(s.sessions.map(t => [t.id, t]));
        const sessions = remoteSessions.map((rs) => {
          const previous = previousById.get(rs.sessionId);
          if (rs.buffer) sessionBufferCache.set(rs.sessionId, rs.buffer);
          return {
            ...previous,
            id: rs.sessionId,
            cwd: rs.cwd,
            shell: rs.shell ?? previous?.shell,
          };
        });
        const hasActive = s.activeId ? sessions.some((t) => t.id === s.activeId) : false;
        for (const rs of remoteSessions) {
          if (!rs.buffer) sessionBufferCache.delete(rs.sessionId);
        }
        return {
          sessions,
          activeId: hasActive ? s.activeId : sessions[0]?.id ?? null,
          _restored: true,
        };
      });
      onRestored?.();
    });
    // Server pushes terminal.sessions on each WS connection (handleConnection),
    // no need to request terminal.list here.
  },

  createSession: (shell?: string, cwd?: string) => {
    const { ws } = get();
    ws?.send('terminal.create', { sessionId: crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''), shell, cwd });
  },

  setActive: (id) => set({ activeId: id }),

  setSessionName: (id, name) => set((s) => ({
    sessions: s.sessions.map((t) => t.id === id ? { ...t, name } : t),
  })),

  removeSession: (id) => {
    const { ws, sessions, activeId } = get();
    ws?.send('terminal.close', { sessionId: id });
    const remaining = sessions.filter((s) => s.id !== id);
    const newActive = activeId === id ? (remaining[0]?.id ?? null) : activeId;
    set({ sessions: remaining, activeId: newActive });
  },

  sendInput: (id, data) => {
    get().ws?.send('terminal.input', { sessionId: id, data });
  },

  resize: (id, cols, rows) => {
    get().ws?.send('terminal.resize', { sessionId: id, cols, rows });
  },
}));
