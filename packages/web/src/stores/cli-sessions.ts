import { create } from 'zustand';

/**
 * CLI 会话（cli-list / cli-panel）的存储模型。
 *
 * 一个 CliSession 对应右侧一个独立的 cli-panel（FlexLayoutShell），
 * panel 的布局数据存放在独立 localStorage key：
 * `agent-spaces:cli-panel:<session.id>:layout` 等（详见 flex-layout-shell.tsx）。
 * 本 store 只维护会话清单与当前激活项，不持有布局数据本身。
 */
export interface CliSession {
  id: string;
  name: string;
  createdAt: number;
}

const STORAGE_KEY = 'agent-spaces:cli-sessions';
/** 与 cli-panel 中 FlexLayoutShell 的 storageKey 前缀保持一致 */
export const CLI_PANEL_STORAGE_PREFIX = 'agent-spaces:cli-panel:';

interface CliSessionsState {
  sessions: CliSession[];
  activeId: string | null;
  /** 自增计数器：cli-panel layout 变更后调用 touchSession 触发 cli-list 刷新 tab 列表 */
  tabVersion: number;
  createSession: (name?: string) => string;
  removeSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setActive: (id: string | null) => void;
  /** 触发订阅了 sessions 的组件重新读取 localStorage 中的 tab 列表 */
  touchTabs: () => void;
  /** 拖拽排序：把 fromId 移到 toId 之前/之后 */
  reorderSessions: (fromId: string, toId: string) => void;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'cli-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadFromStorage(): { sessions: CliSession[]; activeId: string | null } {
  if (typeof window === 'undefined') return { sessions: [], activeId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [], activeId: null };
    const parsed = JSON.parse(raw) as Partial<{ sessions: CliSession[]; activeId: string | null }>;
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.filter((s): s is CliSession =>
          !!s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.createdAt === 'number',
        )
      : [];
    const activeId =
      typeof parsed.activeId === 'string' && sessions.some((s) => s.id === parsed.activeId)
        ? parsed.activeId
        : null;
    return { sessions, activeId };
  } catch {
    return { sessions: [], activeId: null };
  }
}

function persist(sessions: CliSession[], activeId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions, activeId }));
  } catch {
    /* ignore */
  }
}

function defaultName(existing: CliSession[]): string {
  const used = new Set(existing.map((s) => s.name));
  let n = existing.length + 1;
  while (used.has(`Session ${n}`)) n += 1;
  return `Session ${n}`;
}

/** 删除单个会话对应的 cli-panel localStorage 子 key（layout / templates / theme） */
export function clearCliPanelStorage(sessionId: string) {
  if (typeof window === 'undefined') return;
  const base = CLI_PANEL_STORAGE_PREFIX + sessionId;
  [base + ':layout', base + ':templates', base + ':theme'].forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  });
}

export const useCliSessionsStore = create<CliSessionsState>((set, get) => {
  const initial = loadFromStorage();
  return {
    sessions: initial.sessions,
    activeId: initial.activeId,
    tabVersion: 0,

    createSession: (name) => {
      const id = genId();
      const session: CliSession = {
        id,
        name: (name && name.trim()) || defaultName(get().sessions),
        createdAt: Date.now(),
      };
      const sessions = [...get().sessions, session];
      set({ sessions, activeId: id });
      persist(sessions, id);
      return id;
    },

    removeSession: (id) => {
      const sessions = get().sessions.filter((s) => s.id !== id);
      let activeId = get().activeId;
      if (activeId === id) {
        activeId = sessions.length > 0 ? sessions[sessions.length - 1].id : null;
      }
      clearCliPanelStorage(id);
      set({ sessions, activeId });
      persist(sessions, activeId);
    },

    renameSession: (id, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const sessions = get().sessions.map((s) => (s.id === id ? { ...s, name: trimmed } : s));
      set({ sessions });
      persist(sessions, get().activeId);
    },

    setActive: (id) => {
      set({ activeId: id });
      persist(get().sessions, id);
    },

    touchTabs: () => {
      set((s) => ({ tabVersion: s.tabVersion + 1 }));
    },

    reorderSessions: (fromId, toId) => {
      const sessions = [...get().sessions];
      const fromIdx = sessions.findIndex((s) => s.id === fromId);
      const toIdx = sessions.findIndex((s) => s.id === toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
      const [moved] = sessions.splice(fromIdx, 1);
      sessions.splice(toIdx, 0, moved);
      set({ sessions });
      persist(sessions, get().activeId);
    },
  };
});
