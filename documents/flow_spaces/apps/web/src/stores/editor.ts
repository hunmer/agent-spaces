import { create } from 'zustand';
import type { FileNode, GitDiffResult } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

export type MediaType = 'image' | 'video' | 'audio' | 'svg' | 'markdown' | 'mermaid';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.opus']);
const SVG_EXTS = new Set(['.svg']);
const MD_EXTS = new Set(['.md', '.mdx']);
const MERMAID_EXTS = new Set(['.mermaid', '.mmd']);

export function getMediaType(path: string): MediaType | null {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (SVG_EXTS.has(ext)) return 'svg';
  if (MD_EXTS.has(ext)) return 'markdown';
  if (MERMAID_EXTS.has(ext)) return 'mermaid';
  return null;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  modified: boolean;
  pinned?: boolean;
  mediaType?: MediaType;
}

export const COMMIT_DIFF_PREFIX = '__commit_diff__:';

export function isCommitDiffPath(path: string): boolean {
  return path.startsWith(COMMIT_DIFF_PREFIX);
}

export function getCommitHashFromPath(path: string): string {
  return path.slice(COMMIT_DIFF_PREFIX.length);
}

interface JumpPosition {
  path: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface EditorState {
  tree: FileNode[];
  treeLoading: boolean;
  loadingDirs: Set<string>;
  openFiles: OpenFile[];
  modifiedFileContents: Record<string, string>;
  activeFilePath: string | null;
  pendingJump: JumpPosition | null;
  revealPath: string | null;
  commitDiffs: Record<string, { diffs: GitDiffResult[]; message: string }>;

  loadTree: (workspaceId: string) => Promise<void>;
  loadDirectory: (workspaceId: string, dirPath: string) => Promise<void>;
  openFile: (workspaceId: string, path: string) => Promise<void>;
  saveFile: (workspaceId: string, path: string) => Promise<void>;
  updateContent: (path: string, content: string) => void;
  refreshFile: (workspaceId: string, path: string) => Promise<void>;
  closeFile: (workspaceId: string, path: string) => void;
  setActiveFile: (workspaceId: string, path: string | null) => void;
  jumpToPosition: (workspaceId: string, path: string, line: number, column?: number, endLine?: number, endColumn?: number) => Promise<void>;
  clearPendingJump: () => void;
  setRevealPath: (path: string | null) => void;
  clearRevealPath: () => void;
  resetEditorState: () => void;
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

function clearPendingSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
}

function debouncedSave(workspaceId: string) {
  clearPendingSave();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    useEditorStore.getState().saveEditorState(workspaceId);
  }, 500);
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n?/g, '\n');
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tree: [],
  treeLoading: false,
  loadingDirs: new Set(),
  openFiles: [],
  modifiedFileContents: {},
  activeFilePath: null,
  pendingJump: null,
  revealPath: null,
  commitDiffs: {},

  loadTree: async (workspaceId) => {
    set({ treeLoading: true });
    try {
      const tree = await sdk.editor.tree(workspaceId, { depth: 1 });
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
      const children = await sdk.editor.tree(workspaceId, { path: dirPath, depth: 1 });
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

    const name = path.split('/').pop() || path;
    const mediaType = getMediaType(path);

    // Binary media files (image/video/audio) don't need text content
    if (mediaType && mediaType !== 'svg' && mediaType !== 'markdown') {
      set((s) => ({
        openFiles: [...s.openFiles, { path, name, content: '', modified: false, mediaType }],
        activeFilePath: path,
      }));
      debouncedSave(workspaceId);
      return;
    }

    const data = await sdk.editor.content(workspaceId, path);

    set((s) => ({
      openFiles: [...s.openFiles, { path, name, content: data.content, modified: false, mediaType: mediaType || undefined }],
      activeFilePath: path,
    }));
    debouncedSave(workspaceId);
  },

  saveFile: async (workspaceId, path) => {
    const file = get().openFiles.find((f) => f.path === path);
    if (!file) return;
    const content = get().modifiedFileContents[path] ?? file.content;

    await sdk.editor.save(workspaceId, path, content);

    set((s) => ({
      openFiles: s.openFiles.map((f) =>
        f.path === path ? { ...f, content, modified: false } : f
      ),
      modifiedFileContents: Object.fromEntries(
        Object.entries(s.modifiedFileContents).filter(([filePath]) => filePath !== path)
      ),
    }));
  },

  updateContent: (path, content) => {
    set((s) => ({
      openFiles: s.openFiles.map((f) => {
        if (f.path !== path) return f;
        return { ...f, modified: normalizeContent(f.content) !== normalizeContent(content) };
      }),
      modifiedFileContents: (() => {
        const file = s.openFiles.find((f) => f.path === path);
        if (!file) return s.modifiedFileContents;
        const next = { ...s.modifiedFileContents };
        if (normalizeContent(file.content) === normalizeContent(content)) {
          delete next[path];
        } else {
          next[path] = content;
        }
        return next;
      })(),
    }));
  },

  refreshFile: async (workspaceId, path) => {
    const file = get().openFiles.find(f => f.path === path);
    if (!file || file.modified) return;
    try {
      const data = await sdk.editor.content(workspaceId, path);
      if (data.content !== file.content) {
        set(s => ({
          openFiles: s.openFiles.map(f =>
            f.path === path ? { ...f, content: data.content } : f
          ),
        }));
      }
    } catch {}
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
      const modifiedFileContents = { ...s.modifiedFileContents };
      delete modifiedFileContents[path];
      return { openFiles: files, activeFilePath: active, commitDiffs: newCommitDiffs, modifiedFileContents };
    });
    debouncedSave(workspaceId);
  },

  setActiveFile: (workspaceId, path) => {
    set({ activeFilePath: path });
    debouncedSave(workspaceId);
  },

  jumpToPosition: async (workspaceId, path, line, column, endLine, endColumn) => {
    await get().openFile(workspaceId, path);
    set({ pendingJump: { path, line, column, endLine, endColumn } });
  },

  clearPendingJump: () => set({ pendingJump: null }),

  setRevealPath: (path) => set({ revealPath: path }),
  clearRevealPath: () => set({ revealPath: null }),

  resetEditorState: () => {
    clearPendingSave();
    set({
      tree: [],
      treeLoading: false,
      loadingDirs: new Set(),
      openFiles: [],
      modifiedFileContents: {},
      activeFilePath: null,
      pendingJump: null,
      revealPath: null,
      commitDiffs: {},
    });
  },

  loadEditorState: async (workspaceId) => {
    get().resetEditorState();
    try {
      const state = await sdk.editor.editorState(workspaceId);
      const { openFilePaths = [], activeFilePath = null, pinnedPaths = [] } = state;
      if (openFilePaths.length === 0) {
        set({ openFiles: [], activeFilePath: null, modifiedFileContents: {} });
        return;
      }

      const pinnedSet = new Set(pinnedPaths);
      const openFiles: OpenFile[] = [];
      for (const path of openFilePaths) {
        try {
          const name = path.split('/').pop() || path;
          const mediaType = getMediaType(path);
          if (mediaType && mediaType !== 'svg' && mediaType !== 'markdown') {
            openFiles.push({ path, name, content: '', modified: false, mediaType, pinned: pinnedSet.has(path) || undefined });
          } else {
            const data = await sdk.editor.content(workspaceId, path);
            openFiles.push({ path, name, content: data.content, modified: false, mediaType: mediaType || undefined, pinned: pinnedSet.has(path) || undefined });
          }
        } catch {
          // file may have been deleted, skip
        }
      }
      const active = activeFilePath && openFiles.find(f => f.path === activeFilePath)
        ? activeFilePath
        : openFiles.length > 0
          ? openFiles[openFiles.length - 1].path
          : null;
      set({ openFiles, activeFilePath: active, commitDiffs: {}, modifiedFileContents: {} });
    } catch {
      set({ openFiles: [], activeFilePath: null, commitDiffs: {}, modifiedFileContents: {} });
    }
  },

  saveEditorState: async (workspaceId) => {
    const { openFiles, activeFilePath } = get();
    const realFiles = openFiles.filter(f => !isCommitDiffPath(f.path));
    const realActive = activeFilePath && !isCommitDiffPath(activeFilePath) ? activeFilePath : null;
    const pinnedPaths = realFiles.filter(f => f.pinned).map(f => f.path);
    try {
      await sdk.editor.saveEditorState(workspaceId, {
        openFilePaths: realFiles.map(f => f.path),
        activeFilePath: realActive,
        pinnedPaths,
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
      const openPaths = new Set(files.map((f) => f.path));
      const modifiedFileContents = Object.fromEntries(
        Object.entries(s.modifiedFileContents).filter(([filePath]) => openPaths.has(filePath))
      );
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path, modifiedFileContents };
    });
    debouncedSave(workspaceId);
  },

  closeToLeft: (workspaceId, path) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.path === path);
      if (idx <= 0) return s;
      const files = s.openFiles.filter((f, i) => i >= idx || f.pinned);
      const openPaths = new Set(files.map((f) => f.path));
      const modifiedFileContents = Object.fromEntries(
        Object.entries(s.modifiedFileContents).filter(([filePath]) => openPaths.has(filePath))
      );
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path, modifiedFileContents };
    });
    debouncedSave(workspaceId);
  },

  closeToRight: (workspaceId, path) => {
    set((s) => {
      const idx = s.openFiles.findIndex((f) => f.path === path);
      if (idx < 0 || idx >= s.openFiles.length - 1) return s;
      const files = s.openFiles.filter((f, i) => i <= idx || f.pinned);
      const openPaths = new Set(files.map((f) => f.path));
      const modifiedFileContents = Object.fromEntries(
        Object.entries(s.modifiedFileContents).filter(([filePath]) => openPaths.has(filePath))
      );
      return { openFiles: files, activeFilePath: files.some((f) => f.path === s.activeFilePath) ? s.activeFilePath : path, modifiedFileContents };
    });
    debouncedSave(workspaceId);
  },
}));
