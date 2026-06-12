import type { HttpClient } from '../client';

export interface MiniAppProject {
  id: string;
  name: string;
  description?: string;
  version: string;
  type: 'react' | 'html';
  tags?: string[];
  enabledPlugins?: string[];
  agentConfigId?: string;
  mainFile: string;
  icon?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
  storeUrl?: string;
  storeChecksum?: string;
}

export function createMiniAppApi(http: HttpClient) {
  return {
    list: (): Promise<MiniAppProject[]> =>
      http.get('/api/mini-apps'),

    get: (id: string): Promise<MiniAppProject> =>
      http.get(`/api/mini-apps/${id}`),

    create: (data: { name: string; type: 'react' | 'html'; description?: string; tags?: string[] }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps', data),

    update: (id: string, data: Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl'>>): Promise<MiniAppProject> =>
      http.put(`/api/mini-apps/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/mini-apps/${id}`),

    getFileTree: (id: string): Promise<string[]> =>
      http.get(`/api/mini-apps/${id}/files`),

    getFileManifest: (id: string): Promise<{ path: string; mtimeMs: number }[]> =>
      http.get(`/api/mini-apps/${id}/files/manifest`),

    readFile: (id: string, filePath: string): Promise<{ content: string }> =>
      http.get(`/api/mini-apps/${id}/files/content?path=${encodeURIComponent(filePath)}`),

    writeFile: (id: string, filePath: string, content: string): Promise<void> =>
      http.putVoid(`/api/mini-apps/${id}/files/content`, { path: filePath, content }),

    uploadFiles: (id: string, formData: FormData): Promise<{ ok: true; files: { path: string; size: number }[] }> =>
      http.upload(`/api/mini-apps/${id}/files/upload`, formData),

    deleteFile: (id: string, filePath: string): Promise<void> =>
      http.delete(`/api/mini-apps/${id}/files?path=${encodeURIComponent(filePath)}`),

    renameFile: (id: string, from: string, to: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${id}/files/rename`, { from, to }),

    createFolder: (id: string, dirPath: string): Promise<void> =>
      http.postVoid(`/api/mini-apps/${id}/files/folder`, { path: dirPath }),

    readConfig: <T = unknown>(id: string, filePath: string): Promise<{ value: T | null }> =>
      http.get(`/api/mini-apps/${id}/configs/content?path=${encodeURIComponent(filePath)}`),

    writeConfig: (id: string, filePath: string, value: unknown): Promise<void> =>
      http.putVoid(`/api/mini-apps/${id}/configs/content`, { path: filePath, value }),

    writeDataFile: (id: string, filePath: string, content: string, encoding?: 'base64'): Promise<{ ok: true; path: string; size: number }> =>
      http.put(`/api/mini-apps/${id}/data/content`, { path: filePath, content, encoding }),

    importZip: (data: { zip: string; name?: string; type?: 'react' | 'html'; description?: string }): Promise<MiniAppProject> =>
      http.post('/api/mini-apps/import', data),

    exportZip: (id: string): Promise<Blob> =>
      http.raw(`/api/mini-apps/${id}/export`).then(r => r.blob()),

    uploadAvatar: (id: string, dataUrl: string): Promise<{ url: string }> =>
      http.post(`/api/mini-apps/${id}/avatar`, { dataUrl }),

    getAvatarUrl: (id: string): string =>
      `/api/mini-apps/${id}/avatar`,

    /** Reveal project folder in OS file manager */
    revealFolder: (id: string): Promise<{ ok: true; path: string }> =>
      http.post(`/api/mini-apps/${id}/reveal`),
  };
}
