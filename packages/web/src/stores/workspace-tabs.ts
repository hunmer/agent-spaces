import { create } from "zustand";

interface OpenTab {
  id: string;
  name: string;
}

interface WorkspaceTabsState {
  tabs: OpenTab[];
  activeId: string | null;
  openTab: (tab: OpenTab) => void;
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
}

export const useWorkspaceTabs = create<WorkspaceTabsState>((set) => ({
  tabs: [],
  activeId: null,
  openTab: (tab) =>
    set((s) => {
      if (s.tabs.some((t) => t.id === tab.id)) {
        return { activeId: tab.id };
      }
      return { tabs: [...s.tabs, tab], activeId: tab.id };
    }),
  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      const next = s.tabs.filter((t) => t.id !== id);
      let activeId = s.activeId;
      if (activeId === id) {
        if (next.length === 0) activeId = null;
        else if (idx > 0) activeId = next[idx - 1].id;
        else activeId = next[0].id;
      }
      return { tabs: next, activeId };
    }),
  setActive: (id) => set({ activeId: id }),
}));
