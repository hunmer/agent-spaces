import { create } from "zustand";
import { fetchWithAuth } from "@/lib/auth";

export type IframeSize = "9:16" | "4:3" | "full";

export interface IframeTab {
  id: string;
  url: string;
  title: string;
  size?: IframeSize;
}

export interface IframeBookmark {
  id: string;
  title: string;
  url: string;
  size: IframeSize;
  createdAt: string;
}

interface IframeTabsState {
  tabs: IframeTab[];
  bookmarks: IframeBookmark[];
  bookmarksLoaded: boolean;
  activeId: string | null;
  ballVisible: boolean;
  add: (url: string, title?: string, size?: IframeSize) => string;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  toggleBall: () => void;
  loadBookmarks: () => Promise<void>;
  addBookmark: (title: string, url: string, size: IframeSize) => Promise<IframeBookmark | null>;
  removeBookmark: (id: string) => Promise<void>;
}

let counter = 0;

export const useIframeTabs = create<IframeTabsState>((set, get) => ({
  tabs: [],
  bookmarks: [],
  bookmarksLoaded: false,
  activeId: null,
  ballVisible: false,

  add: (url, title, size) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.url === url);
    if (existing) return existing.id;
    const id = `iframe-${++counter}`;
    const tab: IframeTab = { id, url, title: title || new URL(url).hostname, size };
    set({ tabs: [...tabs, tab] });
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

  toggleBall: () => set((s) => ({ ballVisible: !s.ballVisible })),

  loadBookmarks: async () => {
    if (get().bookmarksLoaded) return;
    try {
      const res = await fetchWithAuth("/api/iframe-bookmarks");
      if (res.ok) {
        const bookmarks: IframeBookmark[] = await res.json();
        set({ bookmarks, bookmarksLoaded: true });
      }
    } catch {}
  },

  addBookmark: async (title, url, size) => {
    try {
      const res = await fetchWithAuth("/api/iframe-bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url, size }),
      });
      if (!res.ok) return null;
      const bookmark: IframeBookmark = await res.json();
      set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
      return bookmark;
    } catch {
      return null;
    }
  },

  removeBookmark: async (id) => {
    try {
      await fetchWithAuth(`/api/iframe-bookmarks/${id}`, { method: "DELETE" });
      set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
    } catch {}
  },
}));
