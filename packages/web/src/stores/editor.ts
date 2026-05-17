import { create } from 'zustand';
import type { FileNode, GitDiffResult } from '@agent-spaces/shared';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  modified: boolean;
  pinned?: boolean;
}

export const COMMIT_DIFF_PREFIX = '__commit_diff__:';

export function isCommitDiffPath(path: string): boolean {
  return path.startsWith(COMMIT_DIFF_PREFIX);
}

export function getCommitHashFromPath(path: string): string {
  return path.slice(COMMIT_DIFF_PREFIX.length);
}

interface JumpPosition {
  line: number;
  column?: number;
}

interface EditorState {
  tree: FileNode[];
  treeLoading: boolean;
  loadingDirs: Set<string>;
  openFiles: OpenFile[];
  activeFilePath: string | null;
  pendingJump: JumpPosition | null;
  revealPath: string | null;
  commitDiffs: Record<string, { diffs: GitDiffResult[]; message: string }>;

  loadTree: (workspaceId: string) => Promise<void>;
  loadDirectory: (workspaceId: string, dirPath: string) => Promise<void>;
  openFile: (workspaceId: string, path: string) => Promise<void>;
  saveFile: (workspaceId: string, path: string) => Promise<void>;
  updateContent: (path: string, content: string) => void;
  closeFile: (workspaceId: string, path: string) => void;
  setActiveFile: (workspaceId: string, path: string | null) => void;
  jumpToPosition: (workspaceId: string, path: string, line: number, column?: number) => Promise<void>;
  clearPendingJump: () => void;
  setRevealPath: (path: string | null) => void;
  clearRevealPath: () => void;
  loadEditorState: (workspaceId: string) => Promise<void>;
  saveEditorState: (workspaceId: string) => Promise<void>;
  openCommitDiff: (workspaceId: string, hash: string, message: string, diffs: GitDiffResult[]) => void;
  closeCommitDiff: (workspaceId: string, hash: string) => void;
  togglePin: (workspaceId: string, path: string) => void;
  reorderFiles: (workspaceId: string, files: OpenFile[]) => void;
  closeOthers: (workspaceId: string, path: string) => void;
  closeToLeft: (workspaceId: string, path: string) => void;
  closeToRight: (workspaceId: string, path: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSave(workspaceId: string) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    useEditorStore.getState().saveEditorState(workspaceId);
  }, 500);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tree: [],
  treeLoading: false,
  loadingDirs: new Set(),
  openFiles: [],
  activeFilePath: null,
  pendingJump: null,
  revealPath: null,
  commitDiffs: {},

  loadTree: async (workspaceId) => {
    set({ treeLoading: true });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/tree?depth=1`);
      const tree = await res.json();
      set({ tree, treeLoading: false });
    } catch {
      set({ treeLoading: false });
    }
  },

  loadDirectory: async (workspaceId, dirPath) => {
    const { tree, loadingDirs } = get();
    const findNode = (nodes: FileNode[]): FileNode | undefined => {
      for (const node of nodes) {
        if (node.path === dirPath) return node;
        if (node.children) { const found = findNode(node.children); if (found) return found; }
      }
      return undefined;
    };
    if (findNode(tree)?.children !== undefined || loadingDirs.has(dirPath)) return;

    const newLoading = new Set(loadingDirs);
    newLoading.add(dirPath);
    set({ loadingDirs: newLoading });

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/tree?path=${encodeURIComponent(dirPath)}&depth=1`);
      const children = await res.json();
      const mergeChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map(node => {
          if (node.path === dirPath) return { ...node, children };
          if (node.children) return { ...node, children: mergeChildren(node.children) };
          return node;
        });
      const newLoading2 = new Set(get().loadingDirs);
      newLoading2.delete(dirPath);
      set({ tree: mergeChildren(get().tree), loadingDirs: newLoading2 });
    } catch {
      const newLoading2 = new Set(get().loadingDirs);
      newLoading2.delete(dirPath);
      set({ loadingDirs: newLoading2 });
    }
  },

  openFile: async (workspaceId, path) => {
    const existing = get().openFiles.find((f) => f.path === path);
    if (existing) {
      set({ activeFilePath: path });
      debouncedSave(workspaceId);
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
    debouncedSave(workspaceId);
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

  closeFile: (workspaceId, path) => {
    set((s) => {
      const files = s.openFiles.filter((f) => f.path !== path);
      const active =
        s.activeFilePath === path
          ? files.length > 0
            ? files[files.length - 1].path
            : null
          : s.activeFilePath;
      const newCommitDiffs = { ...s.commitDiffs };
      if (isCommitDiffPath(path)) {
        delete newCommitDiffs[getCommitHashFromPath(path)];
      }
      return { openFiles: files, activeFilePath: active, commitDiffs: newCommitDiffs };
    });
    debouncedSave(workspaceId);
  },

  setActiveFile: (workspaceId, path) => {
    set({ activeFilePath: path });
    debouncedSave(workspaceId);
  },

  jumpToPosition: async (workspaceId, path, line, column) => {
    await get().openFile(workspaceId, path);
    set({ pendingJump: { line, column } });
  },

  clearPendingJump: () => set({ pendingJump: null }),

  setRevealPath: (path) => set({ revealPath: path }),
  clearRevealPath: () => set({ revealPath: null }),

  loadEditorState: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/editor-state`);
      const state = await res.json();
      const { openFilePaths = [], activeFilePath = null, pinnedPaths = [] } = state;
      if (openFilePaths.length === 0) return;

      const pinnedSet = new Set(pinnedPaths);
      const openFiles: OpenFile[] = [];
      for (const path of openFilePaths) {
        try {
          const fileRes = await fetch(
            `/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`
          );
          const data = await fileRes.json();
          const name = path.split('/').pop() || path;
          openFiles.push({ path, name, content: data.content, modified: false, pinned: pinnedSet.has(path) || undefined });
        } catch {
          // file may have been deleted, skip
        }
      }
      const active = activeFilePath && openFiles.find(f => f.path === activeFilePath)
        ? activeFilePath
        : openFiles.length > 0
          ? openFiles[openFiles.length - 1].path
          : null;
      set({ openFiles, activeFilePath: active });
    } catch {
      // no saved state, fine
    }
  },

  saveEditorState: async (workspaceId) => {
    const { openFiles, activeFilePath } = get();
    const realFiles = openFiles.filter(f => !isCommitDiffPath(f.path));
    const realActive = activeFilePath && !isCommitDiffPath(activeFilePath) ? activeFilePath : null;
    const pinnedPaths = realFiles.filter(f => f.pinned).map(f => f.path);
    try {
      await fetch(`/api/workspaces/${workspaceId}/files/editor-state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openFilePaths: realFiles.map(f => f.path),
          activeFilePath: realActive,
          pinnedPaths,
        }),
      });
    } catch {
      // silent fail
    }
  },

  openCommitDiff: (workspaceId, hash, message, diffs) => {
    const path = COMMIT_DIFF_PREFIX + hash;
    set((s) => {
      const existing = s.openFiles.find((f) => f.path === path);
      if (existing) {
        return { activeFilePath: path, commitDiffs: { ...s.commitDiffs, [hash]: { diffs, message } } };
      }
      return {
        openFiles: [...s.openFiles, { path, name: hash.slice(0, 7), content: '', modified: false }],
        activeFilePath: path,
        commitDiffs: { ...s.commitDiffs, [hash]: { diffs, message } },
      };
    });
  },

  closeCommitDiff: (workspaceId, hash) => {
    const path = COMMIT_DIFF_PREFIX + hash;
    get().closeFile(workspaceId, path);
  },

  togglePin: (workspaceId, path) => {
    set((s) => {
      const files = s.openFiles.map((f) =>
        f.path === path ? { ...f, pinned: !f.pinned } : f
      );
      const pinned = files.filter((f) => f.pinned);
      const unpinned = files.filter((f) => !f.pinned);
      return { openFiles: [...pinned, ...unpinned] };
    });
    debouncedSave(workspaceId);
  },

  reorderFiles: (workspaceId, files) => {
    set({ openFiles: files });
    debouncedSave(workspaceId);
  },

  closeOthers: (workspaceId, path) => {
    set((s) => {
      const files = s.openFiles.filter((f) => f.path === path || f.pinned);
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path };
    });
    debouncedSave(workspaceId);
  },

  closeToLeft: (workspaceId, path) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.path === path);
      if (idx <= 0) return s;
      const files = s.openFiles.filter((f, i) => i >= idx || f.pinned);
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path };
    });
    debouncedSave(workspaceId);
  },

  closeToRight: (workspaceId, path) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.path === path);
      if (idx < 0 || idx >= s.openFiles.length - 1) return s;
      const files = s.openFiles.filter((f, i) => i <= idx || f.pinned);
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path };
    });
    debouncedSave(workspaceId);
  },
}));
