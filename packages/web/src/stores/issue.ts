import { create } from 'zustand';
import type { Issue, IssueStatus } from '@agent-spaces/shared';
import { useChannelStore } from './channel';
import { useTaskStore } from './task';
import { sdk } from '@/lib/sdk';
import { ApiError } from '@agent-spaces/sdk';

interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  members?: string[];
  workflowId?: string | null;
  continuousRun?: boolean;
}

interface IssueStore {
  workspaceId: string | null;
  issues: Issue[];
  activeIssueId: string | null;
  /** 每次 setActiveIssue 递增，用于触发 tab 切换 */
  issueSelectSeq: number;
  loading: boolean;
  createDialogOpen: boolean;
  setCreateDialogOpen: (open: boolean) => void;

  loadIssues: (workspaceId: string) => Promise<void>;
  createIssue: (workspaceId: string, title: string, description: string, members?: string[], workflowId?: string) => Promise<Issue>;
  setActiveIssue: (id: string | null) => void;
  updateIssue: (workspaceId: string, issueId: string, input: UpdateIssueInput) => Promise<void>;
  updateIssueStatus: (workspaceId: string, issueId: string, status: IssueStatus) => Promise<void>;
  startIssue: (workspaceId: string, issueId: string) => Promise<void>;
  resumeIssue: (workspaceId: string, issueId: string) => Promise<void>;
  continueIssue: (workspaceId: string, issueId: string) => Promise<void>;
  interruptIssue: (workspaceId: string, issueId: string) => Promise<void>;
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
  createDialogOpen: false,
  setCreateDialogOpen: (open) => set({ createDialogOpen: open }),

  loadIssues: async (workspaceId) => {
    set({ loading: true });
    try {
      const issues = await sdk.issue.list(workspaceId);
      const activeIssueId = getStoredActiveId(workspaceId, issues);
      set({ workspaceId, issues, activeIssueId, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createIssue: async (workspaceId, title, description, members, workflowId) => {
    const issue = await sdk.issue.create(workspaceId, { title, description, members, workflowId });
    get().upsertIssue(issue);
    get().setActiveIssue(issue.id);
    return issue;
  },

  setActiveIssue: (id) => {
    const { workspaceId } = useIssueStore.getState();
    if (workspaceId && id) {
      try { localStorage.setItem(STORAGE_KEY_PREFIX + workspaceId, id); } catch { /* ignore */ }
    }
    set((s) => ({ activeIssueId: id, issueSelectSeq: s.issueSelectSeq + 1 }));
  },

  updateIssue: async (workspaceId, issueId, input) => {
    const updated = await sdk.issue.update(workspaceId, issueId, input as Parameters<typeof sdk.issue.update>[2]);
    get().upsertIssue(updated);
  },

  updateIssueStatus: async (workspaceId, issueId, status) => {
    await sdk.issue.update(workspaceId, issueId, { status } as Record<string, unknown>).catch(() => {});
  },

  startIssue: async (workspaceId, issueId) => {
    try {
      const issue = await sdk.issue.start(workspaceId, issueId);
      get().upsertIssue(issue);
    } catch (err) {
      if (err instanceof ApiError) {
        const { toast } = await import('sonner');
        toast.error(err.body || 'Failed to start issue');
      }
    }
  },

  resumeIssue: async (workspaceId, issueId) => {
    try {
      const issue = await sdk.issue.resume(workspaceId, issueId);
      get().upsertIssue(issue);
    } catch { /* ignore */ }
  },

  continueIssue: async (workspaceId, issueId) => {
    try {
      const issue = await sdk.issue.continue(workspaceId, issueId);
      get().upsertIssue(issue);
    } catch { /* ignore */ }
  },

  interruptIssue: async (workspaceId, issueId) => {
    try {
      const issue = await sdk.issue.interrupt(workspaceId, issueId);
      get().upsertIssue(issue);
    } catch { /* ignore */ }
  },

  deleteIssue: async (workspaceId, issueId) => {
    const issue = get().issues.find((i) => i.id === issueId);
    await sdk.issue.delete_(workspaceId, issueId).catch(() => {});
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
