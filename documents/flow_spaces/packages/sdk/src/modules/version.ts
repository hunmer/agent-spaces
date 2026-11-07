import type { HttpClient } from '../client';

export function createVersionApi(http: HttpClient) {
  return {
    current: (): Promise<{ version: string }> =>
      http.get('/api/version', { noAuth: true }),

    check: (): Promise<{ current: string; latest: string; updateAvailable: boolean }> =>
      http.get('/api/version/check', { noAuth: true }),

    triggerUpdate: (): Promise<{ success: boolean }> =>
      http.post('/api/version/update', {}),
  };
}
