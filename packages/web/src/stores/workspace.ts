import { create } from "zustand";
import type { Workspace } from "@agent-spaces/shared";

interface WorkspaceStore {
  workspaces: Workspace[];
  setWorkspaces: (workspaces: Workspace[]) => void;
  upsertWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],

  setWorkspaces: (workspaces) => set({ workspaces }),

  upsertWorkspace: (workspace) => {
    set((state) => {
      const index = state.workspaces.findIndex((item) => item.id === workspace.id);
      if (index === -1) return { workspaces: [...state.workspaces, workspace] };

      const workspaces = [...state.workspaces];
      workspaces[index] = workspace;
      return { workspaces };
    });
  },

  removeWorkspace: (workspaceId) => {
    set((state) => ({
      workspaces: state.workspaces.filter((workspace) => workspace.id !== workspaceId),
    }));
  },
}));
