import { create } from 'zustand';

export interface PendingSendData {
  workspaceId: string;
  position: string;
  snippet?: string;
}

interface EditorSendState {
  pendingSendToChannel: PendingSendData | null;
  pendingSendToIssue: PendingSendData | null;
  setPendingSendToChannel: (data: PendingSendData | null) => void;
  setPendingSendToIssue: (data: PendingSendData | null) => void;
}

export const useEditorSendStore = create<EditorSendState>((set) => ({
  pendingSendToChannel: null,
  pendingSendToIssue: null,
  setPendingSendToChannel: (data) => set({ pendingSendToChannel: data }),
  setPendingSendToIssue: (data) => set({ pendingSendToIssue: data }),
}));
