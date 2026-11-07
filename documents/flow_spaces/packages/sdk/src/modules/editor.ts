import type { HttpClient } from '../client';
import type { FileNode } from '@agent-spaces/shared';

export function createEditorApi(http: HttpClient) {
  return {
    /** 文件树 */
    tree: (workspaceId: string, opts?: { path?: string; depth?: number }): Promise<FileNode[]> => {
      const params = new URLSearchParams();
      if (opts?.path) params.set('path', opts.path);
      if (opts?.depth) params.set('depth', String(opts.depth));
      const qs = params.toString();
      return http.get(`/api/workspaces/${workspaceId}/files/tree${qs ? `?${qs}` : ''}`);
    },

    /** 文件内容 */
    content: (workspaceId: string, path: string): Promise<{ content: string }> =>
      http.get(`/api/workspaces/${workspaceId}/files/content?path=${encodeURIComponent(path)}`),

    /** 保存文件 */
    save: (workspaceId: string, path: string, content: string): Promise<void> =>
      http.putVoid(`/api/workspaces/${workspaceId}/files/content`, { path, content }),

    /** 编辑器状态 */
    editorState: (workspaceId: string): Promise<{ openFilePaths: string[]; activeFilePath: string | null; pinnedPaths: string[] }> =>
      http.get(`/api/workspaces/${workspaceId}/files/editor-state`),

    /** 保存编辑器状态 */
    saveEditorState: (workspaceId: string, state: { openFilePaths: string[]; activeFilePath: string | null; pinnedPaths: string[] }): Promise<void> =>
      http.putVoid(`/api/workspaces/${workspaceId}/files/editor-state`, state),

    /** 代码搜索 */
    search: (workspaceId: string, opts: { query: string; regex?: boolean; caseSensitive?: boolean; filePattern?: string; maxResults?: number }): Promise<import('@agent-spaces/shared').CodeSearchResult[]> => {
      const params = new URLSearchParams({ query: opts.query });
      if (opts.regex) params.set('regex', 'true');
      if (opts.caseSensitive) params.set('caseSensitive', 'true');
      if (opts.filePattern) params.set('filePattern', opts.filePattern);
      if (opts.maxResults) params.set('maxResults', String(opts.maxResults));
      return http.get(`/api/workspaces/${workspaceId}/files/search?${params}`);
    },

    /** Check if file exists */
    exists: (workspaceId: string, path: string): Promise<boolean> =>
      http.get<{ exists: boolean }>(`/api/workspaces/${workspaceId}/files/exists?path=${encodeURIComponent(path)}`).then(r => r.exists),

    /** Reveal file in OS file manager */
    reveal: (workspaceId: string, path: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/reveal?path=${encodeURIComponent(path)}`),

    /** Copy a file */
    copy: (workspaceId: string, srcPath: string, destPath: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/copy`, { srcPath, destPath }),

    /** Delete a file */
    deleteFile: (workspaceId: string, path: string): Promise<void> =>
      http.delete(`/api/workspaces/${workspaceId}/files?path=${encodeURIComponent(path)}`),

    /** Rename/move a file */
    rename: (workspaceId: string, oldPath: string, newPath: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/rename`, { oldPath, newPath }),

    /** Import file from URL */
    importUrl: (workspaceId: string, url: string, targetDir: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/import-url`, { url, targetDir }),

    /** Import file from local path */
    importPath: (workspaceId: string, absPath: string, targetDir: string): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/import-path`, { absPath, targetDir }),

    /** Link a local folder into the workspace without copying it */
    linkFolder: (workspaceId: string, sourcePath: string): Promise<{ ok: true; path: string }> =>
      http.post(`/api/workspaces/${workspaceId}/files/link-folder`, { sourcePath }),

    /** Upload files */
    uploadFiles: (workspaceId: string, targetDir: string, files: Array<{ name: string; content: string }>): Promise<void> =>
      http.postVoid(`/api/workspaces/${workspaceId}/files/upload`, { targetDir, files }),
  };
}
