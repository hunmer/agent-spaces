import { create } from "zustand";

export type MobilePanel =
  | "channel-list"
  | "chat"
  | "issue-list"
  | "issue-detail"
  | "workfolder"
  | "code-editor"
  | "terminal"
  | "git-commits"
  | "project-settings"
  | "database"
  | "database-list"
  | "cli-list"
  | "cli-panel";

interface MobileOverlay {
  id: string;
  close: () => void;
}

interface MobilePanelState {
  activePanel: MobilePanel;
  setActivePanel: (panel: MobilePanel) => void;
  overlays: MobileOverlay[];
  registerOverlay: (id: string, close: () => void, options?: { ignoreBack?: boolean }) => void;
  unregisterOverlay: (id: string) => void;
  handleBackAction: () => boolean;
}

export const useMobilePanelStore = create<MobilePanelState>((set) => ({
  activePanel: "channel-list",
  setActivePanel: (panel) => set({ activePanel: panel }),
  overlays: [],
  registerOverlay: (id, close, options) =>
    set((state) => {
      if (options?.ignoreBack) {
        return state;
      }
      const existingIndex = state.overlays.findIndex((overlay) => overlay.id === id);
      if (existingIndex === -1) {
        return { overlays: [...state.overlays, { id, close }] };
      }

      const overlays = [...state.overlays];
      overlays[existingIndex] = { id, close };
      return { overlays };
    }),
  unregisterOverlay: (id) =>
    set((state) => ({
      overlays: state.overlays.filter((overlay) => overlay.id !== id),
    })),
  handleBackAction: () => {
    const { overlays, activePanel } = useMobilePanelStore.getState();
    const topOverlay = overlays[overlays.length - 1];
    if (topOverlay) {
      topOverlay.close();
      return true;
    }

    if (activePanel === "issue-detail") {
      set({ activePanel: "issue-list" });
      return true;
    }

    if (activePanel === "chat") {
      set({ activePanel: "channel-list" });
      return true;
    }

    if (activePanel === "cli-panel") {
      set({ activePanel: "cli-list" });
      return true;
    }

    return false;
  },
}));
