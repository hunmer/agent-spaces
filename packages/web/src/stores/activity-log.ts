import { create, type StoreApi, type UseBoundStore } from "zustand"
import type { LogEntry } from "@/components/viewers/log-viewer"
import { getWS } from "@/lib/ws"
import { useAgentStore } from "@/stores/agent"
import { useWorkspaceStore } from "@/stores/workspace"
import type {
  AgentStatusChangedPayload,
  AgentCompletedPayload,
  IssueStatusChangedPayload,
} from "@agent-spaces/shared"

const MAX_ENTRIES = 2000

interface ActivityLogState {
  entries: LogEntry[]
  append: (entry: LogEntry) => void
  clear: () => void
}

const storeMap = new Map<string, UseBoundStore<StoreApi<ActivityLogState>>>()

function agentName(agentId: string): string {
  const a = useAgentStore.getState().agents.find((ag) => ag.id === agentId)
  return a?.name ?? agentId.slice(0, 8)
}

function wsLabel(workspaceId: string): string {
  const w = useWorkspaceStore.getState().workspaces.find((ws) => ws.id === workspaceId)
  return w?.name ? `[${w.name}] ` : ""
}

export function getActivityLogStore(workspaceId: string): UseBoundStore<StoreApi<ActivityLogState>> {
  let store = storeMap.get(workspaceId)
  if (!store) {
    store = create<ActivityLogState>((set) => ({
      entries: [],
      append: (entry) =>
        set((s) => {
          const next = [...s.entries, entry]
          return { entries: next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next }
        }),
      clear: () => set({ entries: [] }),
    }))
    storeMap.set(workspaceId, store)
  }
  return store
}

const activeListeners = new Set<string>()

export function startActivityLogListeners(workspaceId: string) {
  if (activeListeners.has(workspaceId)) return
  activeListeners.add(workspaceId)

  const ws = getWS(workspaceId)
  const ts = () => new Date().toISOString()
  const store = getActivityLogStore(workspaceId)

  const handlers: Array<() => void> = [
    ws.on("agent.started", (data) => {
      const s = data as { agentId: string; role?: string }
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Agent "${agentName(s.agentId)}" started (role: ${s.role ?? "agent"})` })
    }),

    ws.on("agent.status_changed", (data) => {
      const { agentId, from, to } = data as AgentStatusChangedPayload
      const level = to === "crashed" ? "error" : to === "blocked" ? "warn" : "info"
      store.getState().append({ level, timestamp: ts(), message: `${wsLabel(workspaceId)}Agent "${agentName(agentId)}" status: ${from} -> ${to}` })
    }),

    ws.on("agent.completed", (data) => {
      const { agentId, error } = data as AgentCompletedPayload
      if (error) {
        store.getState().append({ level: "error", timestamp: ts(), message: `${wsLabel(workspaceId)}Agent "${agentName(agentId)}" completed with error: ${error}` })
      } else {
        store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Agent "${agentName(agentId)}" completed` })
      }
    }),

    ws.on("agent.error", (data) => {
      const { agentId, error } = data as { agentId: string; error: string }
      store.getState().append({ level: "error", timestamp: ts(), message: `${wsLabel(workspaceId)}Agent "${agentName(agentId)}" error: ${error}` })
    }),

    ws.on("issue.created", (data) => {
      const i = data as { id: string; title?: string }
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Issue created: ${i.title ?? i.id}` })
    }),

    ws.on("issue.status_changed", (data) => {
      const { from, to } = data as IssueStatusChangedPayload
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Issue status: ${from} -> ${to}` })
    }),

    ws.on("workflow:started", (data) => {
      const event = data as { workflowId?: string; executionId?: string }
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Workflow started: ${event.workflowId ?? "-"} (${event.executionId ?? "-"})` })
    }),

    ws.on("workflow:paused", (data) => {
      const event = data as { workflowId?: string; executionId?: string }
      store.getState().append({ level: "warn", timestamp: ts(), message: `${wsLabel(workspaceId)}Workflow paused: ${event.workflowId ?? "-"} (${event.executionId ?? "-"})` })
    }),

    ws.on("workflow:resumed", (data) => {
      const event = data as { workflowId?: string; executionId?: string }
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Workflow resumed: ${event.workflowId ?? "-"} (${event.executionId ?? "-"})` })
    }),

    ws.on("workflow:completed", (data) => {
      const event = data as { workflowId?: string; executionId?: string }
      store.getState().append({ level: "info", timestamp: ts(), message: `${wsLabel(workspaceId)}Workflow completed: ${event.workflowId ?? "-"} (${event.executionId ?? "-"})` })
    }),

    ws.on("workflow:error", (data) => {
      const event = data as { workflowId?: string; executionId?: string; error?: { message?: string } }
      store.getState().append({ level: "error", timestamp: ts(), message: `${wsLabel(workspaceId)}Workflow failed: ${event.workflowId ?? "-"} (${event.executionId ?? "-"}) ${event.error?.message ?? ""}`.trim() })
    }),
  ]

  const wsAny = ws as unknown as Record<string, unknown>
  wsAny._activityLogCleanup = () => {
    handlers.forEach((h) => h())
    activeListeners.delete(workspaceId)
  }
}

export function stopActivityLogListeners(workspaceId: string) {
  const ws = getWS(workspaceId) as unknown as Record<string, unknown>
  const cleanup = ws._activityLogCleanup as (() => void) | undefined
  cleanup?.()
}
