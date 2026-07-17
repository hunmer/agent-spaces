import { create } from 'zustand'
import type { AgentActivity } from '@agent-spaces/shared/skyoffice'

export interface AgentListItem {
  id: string
  name: string
  texture: string
  x: number
  y: number
  anim: string
  activity: AgentActivity
  /** true=浏览器键盘控制，false=外部 Agent 推送 */
  isHuman: boolean
}

export interface HumanListItem {
  id: string
  name: string
}

interface AgentDebugState {
  agents: Record<string, AgentListItem>
  humans: Record<string, HumanListItem>
  upsertAgent: (a: AgentListItem) => void
  patchAgent: (payload: { id: string; patch: Partial<AgentListItem> }) => void
  removeAgent: (id: string) => void
  clearAgents: () => void
  upsertHuman: (h: HumanListItem) => void
  removeHuman: (id: string) => void
  clearHumans: () => void
}

export const useAgentDebugStore = create<AgentDebugState>((set) => ({
  agents: {},
  humans: {},

  upsertAgent: (a) => set((s) => ({ agents: { ...s.agents, [a.id]: a } })),
  patchAgent: ({ id, patch }) =>
    set((s) => {
      const cur = s.agents[id]
      if (!cur) return s
      return { agents: { ...s.agents, [id]: { ...cur, ...patch } } }
    }),
  removeAgent: (id) =>
    set((s) => {
      const next = { ...s.agents }
      delete next[id]
      return { agents: next }
    }),
  clearAgents: () => set({ agents: {} }),

  upsertHuman: (h) => set((s) => ({ humans: { ...s.humans, [h.id]: h } })),
  removeHuman: (id) =>
    set((s) => {
      const next = { ...s.humans }
      delete next[id]
      return { humans: next }
    }),
  clearHumans: () => set({ humans: {} }),
}))
