import type { HttpClient } from '../client';
import type { AppNotification } from '@agent-spaces/shared';

export function createNotificationApi(http: HttpClient) {
  return {
    list: (): Promise<AppNotification[]> =>
      http.get('/api/notifications'),

    markRead: (id: string): Promise<void> =>
      http.postVoid(`/api/notifications/${id}/read`),

    clearAll: (): Promise<void> =>
      http.postVoid('/api/notifications/clear'),
  };
}
