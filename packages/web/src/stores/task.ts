import { create } from 'zustand';
import type { Task, TaskStatus } from '@agent-spaces/shared';

interface TaskStore {
  tasks: Task[];
  loading: boolean;

  loadTasks: (workspaceId: string, issueId?: string) => Promise<void>;
  createTask: (workspaceId: string, issueId: string, title: string, description: string, agentConfigId?: string) => Promise<Task>;
  updateTask: (workspaceId: string, taskId: string, data: { title?: string; description?: string }) => Promise<void>;
  deleteTask: (workspaceId: string, taskId: string) => Promise<void>;
  retryTask: (workspaceId: string, taskId: string) => Promise<void>;
  cancelTask: (workspaceId: string, taskId: string) => Promise<void>;
  reorderTasks: (workspaceId: string, issueId: string, taskIds: string[]) => Promise<void>;

  // WS handlers
  upsertTask: (task: Task) => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,

  loadTasks: async (workspaceId, issueId) => {
    set({ loading: true });
    try {
      const params = issueId ? `?issueId=${issueId}` : '';
      const res = await fetch(`/api/workspaces/${workspaceId}/tasks${params}`);
      const tasks: Task[] = await res.json();
      set({ tasks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createTask: async (workspaceId, issueId, title, description, agentConfigId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId, title, description, agentConfigId }),
    });
    const task: Task = await res.json();
    get().upsertTask(task);
    return task;
  },

  updateTask: async (workspaceId, taskId, data) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const task: Task = await res.json();
    get().upsertTask(task);
  },

  deleteTask: async (workspaceId, taskId) => {
    await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}`, { method: 'DELETE' });
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== taskId) }));
  },

  retryTask: async (workspaceId, taskId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}/retry`, {
      method: 'POST',
    });
    const task: Task = await res.json();
    get().upsertTask(task);
  },

  cancelTask: async (workspaceId, taskId) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
    const task: Task = await res.json();
    get().upsertTask(task);
  },

  reorderTasks: async (workspaceId, issueId, taskIds) => {
    await fetch(`/api/workspaces/${workspaceId}/tasks/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueId, taskIds }),
    });
  },

  upsertTask: (task) => {
    set((s) => {
      const idx = s.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const copy = [...s.tasks];
        copy[idx] = task;
        return { tasks: copy };
      }
      return { tasks: [...s.tasks, task] };
    });
  },
}));
