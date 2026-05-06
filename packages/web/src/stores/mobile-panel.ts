import { create } from "zustand";

interface MobilePanelState {
  activePanel: string;
  setActivePanel: (panel: string) => void;
}

export const useMobilePanelStore = create<MobilePanelState>((set) => ({
  activePanel: "channel-list",
  setActivePanel: (panel) => set({ activePanel: panel }),
}));
