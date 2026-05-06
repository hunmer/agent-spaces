import { create } from 'zustand';
import type { Issue, IssueStatus } from '@agent-spaces/shared';
import { useChannelStore } from './channel';
import { useTaskStore } from './task';

interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  members?: string[];
}

interface IssueStore {
  workspaceId: string | null;
  issues: Issue[];
  activeIssueId: string | null;
  /** 每次 setActiveIssue 递增，用于触发 tab 切换 */
  issueSelectSeq: number;
  loading: boolean;

  loadIssues: (workspaceId: string) => Promise<void>;
  createIssue: (workspaceId: string, title: string, description: string, members?: string[]) => Promise<void>;
  setActiveIssue: (id: string | null) => void;
  updateIssue: (workspaceId: string, issueId: string, input: UpdateIssueInput) => Promise<void>;
  updateIssueStatus: (workspaceId: string, issueId: string, status: IssueStatus) => Promise<void>;
  startIssue: (workspaceId: string, issueId: string) => Promise<void>;
  resumeIssue: (workspaceId: string, issueId: string) => Promise<void>;
  deleteIssue: (workspaceId: string, issueId: string) => Promise<void>;

  // WS handlers
  upsertIssue: (issue: Issue) => void;
  removeIssue: (id: string) => void;
}

const STORAGE_KEY_PREFIX = 'agent-spaces:issue:';

function getStoredActiveId(workspaceId: string, issues: Issue[]): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + workspaceId);
    if (saved && issues.some((i) => i.id === saved)) return saved;
  } catch { /* ignore */ }
  return null;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
  workspaceId: null,
  issues: [],
  activeIssueId: null,
  issueSelectSeq: 0,
  loading: false,

  loadIssues: async (workspaceId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/issues`);
      const issues: Issue[] = await res.json();
      const activeIssueId = getStoredActiveId(workspaceId, issues);
      set({ workspaceId, issues, activeIssueId, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createIssue: async (workspaceId, title, description, members) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, members }),
    });
    const issue: Issue = await res.json();
    get().upsertIssue(issue);
    get().setActiveIssue(issue.id);
  },

  setActiveIssue: (id) => {
    const { workspaceId } = useIssueStore.getState();
    if (workspaceId && id) {
      try { localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, id); } catch { /* ignore */ }
    }
    set((s) => ({ activeIssueId: id, issueSelectSeq: s.issueSelectSeq + 1 }));
  },

  updateIssue: async (workspaceId, issueId, input) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const updated: Issue = await res.json();
    get().upsertIssue(updated);
  },

  updateIssueStatus: async (workspaceId, issueId, status) => {
    await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },

  startIssue: async (workspaceId, issueId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}/start`, {
      method: 'POST',
    });
    const issue: Issue = await res.json();
    get().upsertIssue(issue);
  },

  resumeIssue: async (workspaceId, issueId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}/resume`, {
      method: 'POST',
    });
    const issue: Issue = await res.json();
    get().upsertIssue(issue);
  },

  deleteIssue: async (workspaceId, issueId) => {
    const issue = get().issues.find((i) => i.id === issueId);
    await fetch(`/api/workspaces/${workspaceId}/issues/${issueId}`, { method: 'DELETE' });
    get().removeIssue(issueId);

    // 同步清理关联的 channel 和 tasks
    if (issue?.channelId) {
      const { removeChannelLocal } = useChannelStore.getState();
      removeChannelLocal(issue.channelId);
    }
    const { tasks } = useTaskStore.getState();
    const relatedTasks = tasks.filter((t) => t.issueId === issueId);
    if (relatedTasks.length > 0) {
      const relatedIds = new Set(relatedTasks.map((t) => t.id));
      useTaskStore.setState((s) => ({ tasks: s.tasks.filter((t) => !relatedIds.has(t.id)) }));
    }
  },

  upsertIssue: (issue) => {
    set((s) => {
      const idx = s.issues.findIndex((i) => i.id === issue.id);
      if (idx >= 0) {
        const copy = [...s.issues];
        copy[idx] = issue;
        return { issues: copy };
      }
      return { issues: [...s.issues, issue] };
    });
  },

  removeIssue: (id) => {
    set((s) => ({
      issues: s.issues.filter((i) => i.id !== id),
      activeIssueId: s.activeIssueId === id ? null : s.activeIssueId,
    }));
  },
}));
