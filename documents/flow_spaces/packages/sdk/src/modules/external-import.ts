import type { HttpClient } from '../client';

export type ExternalImportKind = 'skills' | 'commands' | 'mcps' | 'output-styles' | 'agents';
export type ExternalImportMode = 'copy' | 'symlink';

export interface ExternalImportSource {
  id: string;
  kind: ExternalImportKind;
  name: string;
  source: string;
  sourceRoot: string;
  provider: 'codex' | 'claude' | 'gemini';
  relativePath: string;
  isDirectory: boolean;
  description?: string;
  group?: string;
  preview?: string;
}

export interface ExternalImportRequestItem {
  id: string;
  name?: string;
  group?: string;
  targetAgentId?: string;
}

export interface ExternalImportResult {
  id: string;
  name: string;
  kind: ExternalImportKind;
  ok: boolean;
  error?: string;
}

export function createExternalImportApi(http: HttpClient) {
  return {
    scan: (kinds?: ExternalImportKind[]): Promise<ExternalImportSource[]> => {
      const query = kinds?.length ? `?kinds=${encodeURIComponent(kinds.join(','))}` : '';
      return http.get(`/api/external-import/scan${query}`);
    },

    import: (
      kind: ExternalImportKind,
      mode: ExternalImportMode,
      items: ExternalImportRequestItem[],
    ): Promise<ExternalImportResult[]> =>
      http.post('/api/external-import/import', { kind, mode, items }),
  };
}
