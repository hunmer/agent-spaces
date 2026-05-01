import { create } from 'zustand';
import type { FileNode } from '@agent-spaces/shared';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  modified: boolean;
}

interface EditorState {
  tree: FileNode[];
  treeLoading: boolean;
  openFiles: OpenFile[];
  activeFilePath: string | null;

  loadTree: (workspaceId: string) => Promise<void>;
  openFile: (workspaceId: string, path: string) => Promise<void>;
  saveFile: (workspaceId: string, path: string) => Promise<void>;
  updateContent: (path: string, content: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tree: [],
  treeLoading: false,
  openFiles: [],
  activeFilePath: null,

  loadTree: async (workspaceId) => {
    set({ treeLoading: true });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/tree`);
      const tree = await res.json();
      set({ tree, treeLoading: false });
    } catch {
      set({ treeLoading: false });
    }
  },

  openFile: async (workspaceId, path) => {
    const existing = get().openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activeFilePath: path });
      return;
    }

    const res = await fetch(
      `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`
    );
    const data = await res.json();
    const name = path.split('/').pop() || path;

    set((s) => ({
      openFiles: [...s.openFiles, { path, name, content: data.content, modified: false }],
      activeFilePath: path,
    }));
  },

  saveFile: async (workspaceId, path) => {
    const file = get().openFiles.find((f) => f.path === path);
    if (!file) return;

    await fetch(`/api/workspaces/${workspaceId}/files/content`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content: file.content }),
    });

    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, modified: false } : f
      ),
    }));
  },

  updateContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, modified: true } : f
      ),
    }));
  },

  closeFile: (path) => {
    set((s) => {
      const files = s.openFiles.filter((f) => f.path !== path);
      const active =
        s.activeFilePath === path
          ? files.length > 0
            ? files[files.length - 1].path
            : null
          : s.activeFilePath;
      return { openFiles: files, activeFilePath: active };
    });
  },

  setActiveFile: (path) => set({ activeFilePath: path }),
}));
