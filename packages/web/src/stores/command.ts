import { create } from 'zustand';
import type { QuickCommand, CommandProcess } from '@agent-spaces/shared';
import { fetchWithAuth } from '@/lib/auth';
import { getWS } from '@/lib/ws';

interface RunningState {
  sessionId: string;
  status: CommandProcess['status'];
}

interface CommandStore {
  commands: QuickCommand[];
  runningMap: Record<string, RunningState>;
  loaded: boolean;
  wsAttached: boolean;

  load: (workspaceId: string) => Promise<void>;
  create: (workspaceId: string, input: { name: string; command: string; folder?: string; cwd?: string; shell?: string; env?: Record<string, string>; autoRestart?: boolean }) => Promise<void>;
  update: (workspaceId: string, id: string, updates: Partial<QuickCommand>) => Promise<void>;
  remove: (workspaceId: string, id: string) => Promise<void>;
  run: (workspaceId: string, commandId: string) => Promise<void>;
  stop: (workspaceId: string, commandId: string) => Promise<void>;
  attachWS: (workspaceId: string) => void;
  isRunning: (commandId: string) => boolean;
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  commands: [],
  runningMap: {},
  loaded: false,
  wsAttached: false,

  load: async (workspaceId: string) => {
    const [commandsRes, processesRes] = await Promise.all([
      fetchWithAuth(`/api/workspaces/${workspaceId}/commands`),
      fetchWithAuth(`/api/workspaces/${workspaceId}/commands/processes`),
    ]);
    const commands = await commandsRes.json();
    const processes: CommandProcess[] = await processesRes.json();
    const runningMap: Record<string, RunningState> = {};
    for (const p of processes) {
      runningMap[p.commandId] = { sessionId: p.sessionId, status: p.status };
    }
    set({ commands, runningMap, loaded: true });
    get().attachWS(workspaceId);
  },

  create: async (workspaceId, input) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const cmd = await res.json();
    set(s => ({ commands: [...s.commands, cmd] }));
  },

  update: async (workspaceId, id, updates) => {
    const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const updated = await res.json();
    set(s => ({
      commands: s.commands.map(c => c.id === id ? updated : c),
    }));
  },

  remove: async (workspaceId, id) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${id}`, { method: 'DELETE' });
    set(s => ({
      commands: s.commands.filter(c => c.id !== id),
      runningMap: Object.fromEntries(Object.entries(s.runningMap).filter(([k]) => k !== id)),
    }));
  },

  run: async (workspaceId, commandId) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${commandId}/run`, { method: 'POST' });
  },

  stop: async (workspaceId, commandId) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/commands/${commandId}/stop`, { method: 'POST' });
  },

  attachWS: (workspaceId: string) => {
    if (get().wsAttached) return;
    const ws = getWS(workspaceId);

    ws.on('command.started', (data) => {
      const { commandId, sessionId } = data as { commandId: string; sessionId: string };
      set(s => ({
        runningMap: { ...s.runningMap, [commandId]: { sessionId, status: 'running' } },
      }));
    });

    ws.on('command.stopped', (data) => {
      const { commandId } = data as { commandId: string };
      set(s => {
        const { [commandId]: _, ...rest } = s.runningMap;
        return { runningMap: rest };
      });
    });

    ws.on('command.restarted', (data) => {
      const { commandId, sessionId } = data as { commandId: string; sessionId: string };
      set(s => ({
        runningMap: { ...s.runningMap, [commandId]: { sessionId, status: 'running' } },
      }));
    });

    // User closes terminal tab manually -> clean up running state
    ws.on('terminal.closed', (data) => {
      const { sessionId } = data as { sessionId: string };
      set(s => {
        const newMap = Object.fromEntries(
          Object.entries(s.runningMap).filter(([_, v]) => v.sessionId !== sessionId)
        );
        if (Object.keys(newMap).length === Object.keys(s.runningMap).length) return s;
        return { runningMap: newMap };
      });
    });

    set({ wsAttached: true });
  },

  isRunning: (commandId: string) => {
    return !!get().runningMap[commandId];
  },
}));
