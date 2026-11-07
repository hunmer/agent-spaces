import type { HttpClient } from '../client';
import type { SubscriptionConfig, SubscriptionQuota } from '@agent-spaces/shared';

export function createSubscriptionApi(http: HttpClient) {
  return {
    list: (): Promise<SubscriptionConfig[]> =>
      http.get('/api/subscriptions'),

    create: (data: Partial<SubscriptionConfig>): Promise<SubscriptionConfig> =>
      http.post('/api/subscriptions', data),

    update: (id: string, data: Partial<SubscriptionConfig>): Promise<SubscriptionConfig> =>
      http.put(`/api/subscriptions/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/subscriptions/${id}`),

    quota: (id: string): Promise<SubscriptionQuota> =>
      http.get(`/api/subscriptions/${id}/quota`),
  };
}
