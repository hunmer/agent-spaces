import { create } from "zustand";
import type { Workspace } from "@agent-spaces/shared";

interface WorkspaceStore {
  workspaces: Workspace[];
  dialogOpen: boolean;
  editingWorkspace: Workspace | null;
  openWorkspaceDialog: (workspace?: Workspace | null) => void;
  closeWorkspaceDialog: () => void;
  /** @deprecated use openWorkspaceDialog() instead */
  createDialogOpen: boolean;
  /** @deprecated use closeWorkspaceDialog() instead */
  setCreateDialogOpen: (open: boolean) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  upsertWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspaces: [],
  dialogOpen: false,
  editingWorkspace: null,
  openWorkspaceDialog: (workspace) => set({ dialogOpen: true, editingWorkspace: workspace ?? null }),
  closeWorkspaceDialog: () => set({ dialogOpen: false, editingWorkspace: null }),

  // deprecated compat
  createDialogOpen: false,
  setCreateDialogOpen: (open) => {
    if (open) {
      set({ dialogOpen: true, editingWorkspace: null, createDialogOpen: true });
    } else {
      set((_s) => ({ dialogOpen: false, editingWorkspace: null, createDialogOpen: false }));
    }
  },

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
