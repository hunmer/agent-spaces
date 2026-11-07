import { create } from 'zustand';
import type { AgentConfig } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

interface AgentStore {
  agents: AgentConfig[];
  loaded: boolean;
  loading: boolean;
  ensure: () => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
}

function uniqueAgentsById(agents: AgentConfig[]): AgentConfig[] {
  const seen = new Set<string>();
  return agents.filter((agent) => {
    if (seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
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
      const data: AgentConfig[] = await sdk.agent.listPresets();
      set({ agents: uniqueAgentsById(data), loaded: true });
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
      await sdk.agent.updatePreset(id, { ...agent, enabled: nextEnabled });
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
