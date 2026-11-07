import type { HttpClient } from '../client';

export function createAgentStoreApi(http: HttpClient) {
  /** 注意：这些请求访问外部 Store URL（GitHub），需要 absoluteUrl */
  return {
    fetchIndex: (baseUrl: string): Promise<Array<{ id: string; name: string; description?: string }>> =>
      http.get(`${baseUrl}/index.json`, { absoluteUrl: true, noAuth: true }),
  };
}
