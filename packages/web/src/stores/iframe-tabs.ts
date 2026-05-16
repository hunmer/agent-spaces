import { create } from "zustand";

export interface IframeTab {
  id: string;
  url: string;
  title: string;
}

interface IframeTabsState {
  tabs: IframeTab[];
  activeId: string | null; // null = main page
  add: (url: string, title?: string) => string;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
}

let counter = 0;

export const useIframeTabs = create<IframeTabsState>((set, get) => ({
  tabs: [],
  activeId: null,

  add: (url, title) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.url === url);
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = `iframe-${++counter}`;
    const tab: IframeTab = { id, url, title: title || new URL(url).hostname };
    set({ tabs: [...tabs, tab], activeId: id });
    return id;
  },

  remove: (id) => {
    const { tabs, activeId } = get();
    const next = tabs.filter((t) => t.id !== id);
    set({
      tabs: next,
      activeId: activeId === id ? (next.length > 0 ? next[next.length - 1].id : null) : activeId,
    });
  },

  setActive: (id) => set({ activeId: id }),
}));
