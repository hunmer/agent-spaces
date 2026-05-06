import { create } from 'zustand';
import type { WorkspaceWS } from '@/lib/ws';

export interface TerminalSession {
  id: string;
  cwd: string;
  shell?: string;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;
  ws: WorkspaceWS | null;
  _initialized: boolean;

  init: (ws: WorkspaceWS) => void;
  createSession: (shell?: string, cwd?: string) => void;
  setActive: (id: string) => void;
  removeSession: (id: string) => void;
  sendInput: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeId: null,
  ws: null,
  _initialized: false,

  init: (ws) => {
    const state = get();
    if (state._initialized && state.ws === ws) return;
    set({ ws, _initialized: true });
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
  },

  createSession: (shell?: string, cwd?: string) => {
    const { ws } = get();
    ws?.send('terminal.create', { sessionId: crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''), shell, cwd });
  },

  setActive: (id) => set({ activeId: id }),

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
