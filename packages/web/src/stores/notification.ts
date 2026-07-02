import { create } from 'zustand';
import type { AppNotification } from '@agent-spaces/shared';
import { sdk } from '@/lib/sdk';

interface NotificationState {
  notifications: AppNotification[];
  loaded: boolean;
  load: (workspaceId: string) => Promise<void>;
  addNotification: (notification: AppNotification) => void;
  clearAll: (workspaceId: string) => Promise<void>;
  remove: (workspaceId: string, notificationId: string) => Promise<void>;
  markRead: (workspaceId: string, notificationId: string) => Promise<void>;
  markAllRead: (workspaceId: string) => Promise<void>;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, _get) => ({
  notifications: [],
  loaded: false,

  load: async (workspaceId: string) => {
    try {
      // 无 workspace（主页场景）走全局聚合接口
      const url = workspaceId
        ? `/api/workspaces/${workspaceId}/notifications`
        : '/api/notifications';
      const notifications: AppNotification[] = await sdk.http.get(url);
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
    await sdk.http.delete(`/api/workspaces/${workspaceId}/notifications`);
    set({ notifications: [] });
  },

  remove: async (workspaceId: string, notificationId: string) => {
    await sdk.http.delete(`/api/workspaces/${workspaceId}/notifications/${notificationId}`).catch(() => {});
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== notificationId),
    }));
  },

  markRead: async (workspaceId: string, notificationId: string) => {
    await sdk.http.putVoid(`/api/workspaces/${workspaceId}/notifications/${notificationId}/read`, {});
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
  },

  markAllRead: async (workspaceId: string) => {
    await sdk.http.putVoid(`/api/workspaces/${workspaceId}/notifications/read-all`, {});
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  reset: () => set({ notifications: [], loaded: false }),
}));
