import type { HttpClient } from '../client';

export interface McpServerInfo {
  name: string;
  config: Record<string, unknown>;
  favorited?: boolean;
  [key: string]: unknown;
}

export function createMcpsApi(http: HttpClient) {
  return {
    list: (): Promise<McpServerInfo[]> =>
      http.get('/api/mcps'),

    save: (name: string, config: Record<string, unknown>): Promise<void> =>
      http.putVoid(`/api/mcps/${name}`, { config }),

    delete_: (name: string): Promise<void> =>
      http.delete(`/api/mcps/${name}`),

    toggleFavorite: (name: string): Promise<{ favorited: boolean }> =>
      http.post(`/api/mcps/${name}/favorite`),

    importJson: (jsonText: string): Promise<void> =>
      http.postVoid('/api/mcps/import', { jsonText }),
  };
}
