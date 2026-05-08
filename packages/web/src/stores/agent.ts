import { create } from 'zustand';
import type { AgentConfig } from '@agent-spaces/shared';

interface AgentStore {
  agents: AgentConfig[];
  loaded: boolean;
  loading: boolean;
  ensure: () => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  loaded: false,
  loading: false,

  ensure: async () => {
    const { loaded, loading } = get();
    if (loaded || loading) return;

    set({ loading: true });
    try {
      const res = await fetch('/api/agents/presets');
      if (!res.ok) return;
      const data: AgentConfig[] = await res.json();
      set({ agents: data, loaded: true });
    } catch { /* ignore */ }
    finally {
      set({ loading: false });
    }
  },

  toggleEnabled: async (id: string) => {
    const agent = get().agents.find((a) => a.id === id);
    if (!agent) return;

    const nextEnabled = !agent.enabled;
    // 乐观更新本地状态
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, enabled: nextEnabled } : a,
      ),
    }));

    try {
      const res = await fetch(`/api/agents/presets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...agent, enabled: nextEnabled }),
      });
      if (!res.ok) {
        // 回滚
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, enabled: agent.enabled } : a,
          ),
        }));
      }
    } catch {
      // 回滚
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === id ? { ...a, enabled: agent.enabled } : a,
        ),
      }));
    }
  },
}));

export function findAgentById(id: string): AgentConfig | undefined {
  return useAgentStore.getState().agents.find((a) => a.id === id);
}
