import type { HttpClient } from '../client';

export interface NpmSettings {
  registry: string;
  proxy?: string;
}

export function createNpmSettingsApi(http: HttpClient) {
  return {
    get: (): Promise<NpmSettings> =>
      http.get('/api/npm-settings'),

    update: (settings: Partial<NpmSettings>): Promise<NpmSettings> =>
      http.put('/api/npm-settings', settings),
  };
}
