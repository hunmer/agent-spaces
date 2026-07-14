import type { HttpClient } from '../client';

export interface SkillInfo {
  name: string;
  content: string;
  group?: string;
  favorited?: boolean;
  storeId?: string;
  [key: string]: unknown;
}

export interface SkillSyncItem {
  agentId: string;
  skillName: string;
  [key: string]: unknown;
}

export function createSkillsApi(http: HttpClient) {
  return {
    list: (): Promise<SkillInfo[]> =>
      http.get('/api/skills'),

    save: (name: string, content: string): Promise<void> =>
      http.putVoid(`/api/skills/${name}`, { content }),

    delete_: (name: string): Promise<void> =>
      http.delete(`/api/skills/${name}`),

    toggleFavorite: (name: string): Promise<{ favorited: boolean }> =>
      http.post(`/api/skills/${name}/favorite`),

    importStore: (path: string, group?: string): Promise<void> =>
      http.postVoid('/api/skills/import-store', { path, group }),

    importBatch: (items: Array<{ name: string; content: string; group?: string; files?: Array<{ path: string; content: string }> }>): Promise<void> =>
      http.postVoid('/api/skills/import-batch', { items }),

    importGit: (url: string): Promise<Array<{ name: string; content: string }> | null> =>
      http.post('/api/skills/import-git', { url }),

    syncCheck: (): Promise<SkillSyncItem[]> =>
      http.get('/api/skills/sync-check'),

    sync: (items: Array<{ agentId: string; skillName: string }>): Promise<void> =>
      http.postVoid('/api/skills/sync', { items }),

    /** List skill files */
    listFiles: (name: string): Promise<unknown> =>
      http.get(`/api/skills/${encodeURIComponent(name)}/files`),

    /** Get a skill file */
    getFile: (name: string, path: string): Promise<unknown> =>
      http.get(`/api/skills/${encodeURIComponent(name)}/files/${encodeURIComponent(path)}`),

    /** Save a skill file */
    saveFile: (name: string, path: string, content: string): Promise<void> =>
      http.putVoid(`/api/skills/${encodeURIComponent(name)}/files/${encodeURIComponent(path)}`, { content }),

    /** Reveal skill in file manager */
    reveal: (name: string): Promise<void> =>
      http.postVoid(`/api/skills/${encodeURIComponent(name)}/reveal`),
  };
}
