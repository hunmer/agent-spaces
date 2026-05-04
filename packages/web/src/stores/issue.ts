import { create } from 'zustand';
import type { Issue, IssueStatus } from '@agent-spaces/shared';

interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
}

interface IssueStore {
  issues: Issue[];
  activeIssueId: string | null;
  /** 每次 setActiveIssue 递增，用于触发 tab 切换 */
  issueSelectSeq: number;
  loading: boolean;

  loadIssues: (workspaceId: string) => Promise<void>;
  createIssue: (workspaceId: string, title: string, description: string) => Promise<void>;
  setActiveIssue: (id: string | null) => void;
  updateIssue: (workspaceId: string, issueId: string, input: UpdateIssueInput) => Promise<void>;
  updateIssueStatus: (workspaceId: string, issueId: string, status: IssueStatus) => Promise<void>;
  startIssue: (workspaceId: string, issueId: string) => Promise<void>;

  // WS handlers
  upsertIssue: (issue: Issue) => void;
  removeIssue: (id: string) => void;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
  issues: [],
  activeIssueId: null,
  issueSelectSeq: 0,
  loading: false,

  loadIssues: async (workspaceId) => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/issues`);
      const issues: Issue[] = await res.json();
      set({ issues, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createIssue: async (workspaceId, title, description) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    const issue: Issue = await res.json();
    set((s) => ({ issues: [...s.issues, issue] }));
  },

  setActiveIssue: (id) => set((s) => ({ activeIssueId: id, issueSelectSeq: s.issueSelectSeq + 1 })),

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
