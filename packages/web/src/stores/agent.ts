import { create } from 'zustand';
import type { AgentConfig } from '@agent-spaces/shared';

interface AgentStore {
  agents: AgentConfig[];
  loaded: boolean;
  ensure: (workspaceId: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loaded: false,
  ensure: async (workspaceId: string) => {
    if (get().loaded) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agents/presets`);
      if (!res.ok) return;
      const data: AgentConfig[] = await res.json();
      set({ agents: data, loaded: true });
    } catch { /* ignore */ }
  },
}));

export function findAgentById(id: string): AgentConfig | undefined {
  return useAgentStore.getState().agents.find((a) => a.id === id);
}
