import type { HttpClient } from '../client';

export function createToolsApi(http: HttpClient) {
  return {
    list: (): Promise<Array<{ name: string; description: string; enabled: boolean }>> =>
      http.get('/api/tools'),

    update: (name: string, enabled: boolean): Promise<void> =>
      http.putVoid(`/api/tools/${name}`, { enabled }),
  };
}
