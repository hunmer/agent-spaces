import type { HttpClient } from '../client';
import type { FileNode } from '@agent-spaces/shared';

export function createDataApi(http: HttpClient) {
  return {
    /** 数据目录文件树 */
    tree: (opts?: { path?: string; depth?: number }): Promise<FileNode[]> => {
      const params = new URLSearchParams();
      if (opts?.path) params.set('path', opts.path);
      if (opts?.depth) params.set('depth', String(opts.depth));
      const qs = params.toString();
      return http.get(`/api/data/files/tree${qs ? `?${qs}` : ''}`);
    },

    /** 数据目录文件内容 */
    content: (path: string): Promise<{ content: string }> =>
      http.get(`/api/data/files/content?path=${encodeURIComponent(path)}`),

    /** 保存数据目录文件 */
    save: (path: string, content: string): Promise<void> =>
      http.putVoid('/api/data/files/content', { path, content }),

    /** 删除数据目录文件或目录 */
    deleteFile: (path: string): Promise<void> =>
      http.delete(`/api/data/files?path=${encodeURIComponent(path)}`),

    /** 重命名/移动数据目录文件 */
    rename: (oldPath: string, newPath: string): Promise<void> =>
      http.postVoid('/api/data/files/rename', { oldPath, newPath }),

    /** 复制数据目录文件 */
    copy: (srcPath: string, destPath: string): Promise<void> =>
      http.postVoid('/api/data/files/copy', { srcPath, destPath }),

    /** 导出数据为 ZIP */
    exportZip: (): Promise<Response> =>
      http.raw('/api/data/export'),

    /** 导入 ZIP 数据 */
    importZip: (formData: FormData): Promise<{ success: boolean }> =>
      http.upload('/api/data/import', formData),

    /** cc-switch 迁移 */
    importCcSwitch: (): Promise<{ success: boolean; imported: string[] }> =>
      http.post('/api/import/cc-switch', {}),

    /** Preview cc-switch import */
    ccSwitchPreview: (): Promise<{ error?: string; providers?: unknown[]; skills?: unknown[]; mcps?: unknown[] }> =>
      http.get('/api/import/cc-switch/preview'),

    /** Execute cc-switch import */
    ccSwitchExecute: (body: Record<string, unknown>): Promise<{ providers?: string[]; models?: unknown[]; skills?: unknown[]; mcps?: unknown[] }> =>
      http.post('/api/import/cc-switch/execute', body),

    /** Preview ZIP import */
    importPreview: (formData: FormData): Promise<{ error?: string; sessionId?: string; categories?: unknown[] }> =>
      http.upload('/api/data/import/preview', formData),

    /** Execute ZIP import */
    importExecute: (sessionId: string, categories: string[]): Promise<{ error?: string; results?: Record<string, unknown> }> =>
      http.post('/api/data/import/execute', { sessionId, categories }),
  };
}
