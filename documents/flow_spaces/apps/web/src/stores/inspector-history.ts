import { create } from 'zustand';

export interface InspectorHistoryEntry {
  id: string;
  path: string;
  name?: string;
  line: number;
  column: number;
  timestamp: number;
}

export interface PendingInspectorJump {
  workspaceId: string;
  path: string;
  line: number;
  column: number;
}

interface InspectorHistoryState {
  histories: Record<string, InspectorHistoryEntry[]>;
  pendingJump: PendingInspectorJump | null;
  loadHistory: (workspaceId: string) => void;
  addEntry: (workspaceId: string, entry: Omit<InspectorHistoryEntry, 'id'> & { id?: string }) => void;
  setHistory: (workspaceId: string, history: InspectorHistoryEntry[]) => void;
  clearHistory: (workspaceId: string) => void;
  setPendingJump: (data: PendingInspectorJump | null) => void;
}

const MAX_HISTORY = 50;

function storageKey(workspaceId: string) {
  return `agent-spaces:inspector-history:${workspaceId}`;
}

function normalizeHistory(value: unknown): InspectorHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is InspectorHistoryEntry => (
      item &&
      typeof item === 'object' &&
      typeof (item as InspectorHistoryEntry).path === 'string' &&
      typeof (item as InspectorHistoryEntry).line === 'number'
    ))
    .map((item) => ({
      ...item,
      column: typeof item.column === 'number' ? item.column : 1,
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
    }))
    .slice(0, MAX_HISTORY);
}

function readHistory(workspaceId: string): InspectorHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeHistory(JSON.parse(localStorage.getItem(storageKey(workspaceId)) || '[]'));
  } catch {
    return [];
  }
}

function writeHistory(workspaceId: string, history: InspectorHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(history.slice(0, MAX_HISTORY)));
}

export const useInspectorHistoryStore = create<InspectorHistoryState>((set) => ({
  histories: {},
  pendingJump: null,

  setPendingJump: (data) => set({ pendingJump: data }),

  loadHistory: (workspaceId) => {
    const history = readHistory(workspaceId);
    set((state) => ({
      histories: { ...state.histories, [workspaceId]: history },
    }));
  },

  addEntry: (workspaceId, entry) => {
    const fullEntry: InspectorHistoryEntry = {
      ...entry,
      id: entry.id ?? `${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      column: entry.column ?? 1,
      timestamp: entry.timestamp ?? Date.now(),
    };
    const current = readHistory(workspaceId);
    const deduped = current.filter((item) => (
      item.path !== fullEntry.path ||
      item.line !== fullEntry.line ||
      item.column !== fullEntry.column
    ));
    const history = [fullEntry, ...deduped].slice(0, MAX_HISTORY);
    writeHistory(workspaceId, history);
    set((state) => ({
      histories: { ...state.histories, [workspaceId]: history },
    }));
  },

  setHistory: (workspaceId, history) => {
    writeHistory(workspaceId, history);
    set((state) => ({
      histories: { ...state.histories, [workspaceId]: history },
    }));
  },

  clearHistory: (workspaceId) => {
    writeHistory(workspaceId, []);
    set((state) => ({
      histories: { ...state.histories, [workspaceId]: [] },
    }));
  },
}));
