import { create } from 'zustand';
import type { AppNotification } from '@agent-spaces/shared';
import { fetchWithAuth } from '@/lib/auth';

interface NotificationState {
  notifications: AppNotification[];
  loaded: boolean;
  load: (workspaceId: string) => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  clearAll: (workspaceId: string) => Promise<void>;
  markRead: (workspaceId: string, notificationId: string) => Promise<void>;
  markAllRead: (workspaceId: string) => Promise<void>;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loaded: false,

  load: async (workspaceId: string) => {
    try {
      const res = await fetchWithAuth(`/api/workspaces/${workspaceId}/notifications`);
      const notifications: AppNotification[] = await res.json();
      set({ notifications, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addNotification: (notification: AppNotification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
    }));
  },

  clearAll: async (workspaceId: string) => {
    await fetchWithAuth(`/api/workspaces/${workspaceId}/notifications`, { method: 'DELETE' });
    set({ notifications: [] });
  },

  markRead: async (workspaceId: string, notificationId: string) => {
    await fetchWithAuth(
      `/api/workspaces/${workspaceId}/notifications/${notificationId}/read`,
      { method: 'PUT' },
    );
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
  },

  markAllRead: async (workspaceId: string) => {
    await fetchWithAuth(
      `/api/workspaces/${workspaceId}/notifications/read-all`,
      { method: 'PUT' },
    );
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  reset: () => set({ notifications: [], loaded: false }),
}));
