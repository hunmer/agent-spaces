import { create } from 'zustand';
import type { GitStatusResult, GitDiffResult, GitLogEntry, GitBranch } from '@agent-spaces/shared';

interface GitState {
  status: GitStatusResult | null;
  diffs: GitDiffResult[];
  selectedFile: string | null;
  log: GitLogEntry[];
  branches: GitBranch[];
  loading: boolean;
  error: string | null;
  notGitRepo: boolean;

  loadStatus: (workspaceId: string) => Promise<void>;
  loadDiffs: (workspaceId: string, filePath?: string) => Promise<void>;
  loadLog: (workspaceId: string) => Promise<void>;
  loadBranches: (workspaceId: string) => Promise<void>;
  initRepo: (workspaceId: string) => Promise<void>;
  commit: (workspaceId: string, message: string) => Promise<void>;
  discard: (workspaceId: string, filePath: string) => Promise<void>;
  discardAll: (workspaceId: string) => Promise<void>;
  checkout: (workspaceId: string, branch: string) => Promise<void>;
  push: (workspaceId: string) => Promise<void>;
  pull: (workspaceId: string) => Promise<void>;
  getRemotes: (workspaceId: string) => Promise<{ name: string; refs: { fetch: string; push: string } }[]>;
  addRemote: (workspaceId: string, name: string, url: string) => Promise<void>;
  selectFile: (path: string | null) => void;
}

const GIT_NOT_REPO_PATTERN = /not a git repository/i;

function isNotGitRepoError(err: unknown): boolean {
  return err instanceof Error && GIT_NOT_REPO_PATTERN.test(err.message);
}

export const useGitStore = create<GitState>((set) => ({
  status: null,
  diffs: [],
  selectedFile: null,
  log: [],
  branches: [],
  loading: false,
  error: null,
  notGitRepo: false,

  loadStatus: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/status`);
      if (!res.ok) throw new Error(await res.text());
      const data: GitStatusResult = await res.json();
      set({ status: data, notGitRepo: false });
    } catch (err: any) {
      set({ error: err.message, notGitRepo: isNotGitRepoError(err) });
    }
  },

  loadDiffs: async (workspaceId, filePath) => {
    set({ loading: true });
    try {
      const url = filePath
        ? `/api/workspaces/${workspaceId}/git/diff?path=${encodeURIComponent(filePath)}`
        : `/api/workspaces/${workspaceId}/git/diff`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data: GitDiffResult[] = await res.json();
      set({ diffs: data, loading: false, notGitRepo: false });
    } catch (err: any) {
      set({ error: err.message, loading: false, notGitRepo: isNotGitRepoError(err) });
    }
  },

  loadLog: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/log`);
      if (!res.ok) throw new Error(await res.text());
      const data: GitLogEntry[] = await res.json();
      set({ log: data, notGitRepo: false });
    } catch (err: any) {
      set({ error: err.message, notGitRepo: isNotGitRepoError(err) });
    }
  },

  loadBranches: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/branches`);
      if (!res.ok) throw new Error(await res.text());
      const data: GitBranch[] = await res.json();
      set({ branches: data, notGitRepo: false });
    } catch (err: any) {
      set({ error: err.message, notGitRepo: isNotGitRepoError(err) });
    }
  },

  initRepo: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/init`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      set({ error: null, notGitRepo: false });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  commit: async (workspaceId, message) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  discard: async (workspaceId, filePath) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  discardAll: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/discard-all`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  checkout: async (workspaceId, branch) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  push: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/git/push`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Push failed' }));
      throw new Error(err.error);
    }
  },

  pull: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/git/pull`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Pull failed' }));
      throw new Error(err.error);
    }
  },

  getRemotes: async (workspaceId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/git/remotes`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  addRemote: async (workspaceId, name, url) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/git/remotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add remote' }));
      throw new Error(err.error);
    }
  },

  selectFile: (path) => set({ selectedFile: path }),
}));
