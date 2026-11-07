import type { HttpClient } from '../client';

export function createInspectorApi(http: HttpClient) {
  return {
    /** DOM Inspector 跟踪（免认证） */
    track: (data: { file: string; line: number; column?: number }): Promise<void> =>
      http.postVoid('/api/inspector/track', data, { noAuth: true }),
  };
}
