import { create } from 'zustand';
import type { AgentConfig } from '@agent-spaces/shared';

interface AgentStore {
  agents: AgentConfig[];
  ensure: (workspaceId: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>(() => ({
  agents: [],
  ensure: async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/agents/presets`);
      if (!res.ok) return;
      const data: AgentConfig[] = await res.json();
      useAgentStore.setState({ agents: data });
    } catch { /* ignore */ }
  },
}));

export function findAgentById(id: string): AgentConfig | undefined {
  return useAgentStore.getState().agents.find((a) => a.id === id);
}
