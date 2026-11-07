import type { HttpClient } from '../client';
import type { CodeSearchResult, FileSearchResult } from '@agent-spaces/shared';

export function createSearchApi(http: HttpClient) {
  return {
    code: (workspaceId: string, opts: { query: string; regex?: boolean; caseSensitive?: boolean; filePattern?: string; maxResults?: number }): Promise<CodeSearchResult[]> => {
      const params = new URLSearchParams({ query: opts.query });
      if (opts.regex) params.set('regex', 'true');
      if (opts.caseSensitive) params.set('caseSensitive', 'true');
      if (opts.filePattern) params.set('filePattern', opts.filePattern);
      if (opts.maxResults) params.set('maxResults', String(opts.maxResults));
      return http.get(`/api/workspaces/${workspaceId}/search/code?${params}`);
    },

    files: (workspaceId: string, query: string): Promise<FileSearchResult[]> =>
      http.get(`/api/workspaces/${workspaceId}/search/files?q=${encodeURIComponent(query)}`),
  };
}
