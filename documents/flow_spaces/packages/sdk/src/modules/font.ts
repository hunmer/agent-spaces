import type { HttpClient } from '../client';

export function createFontApi(http: HttpClient) {
  return {
    list: (): Promise<Array<{ id: string; name: string; url: string }>> =>
      http.get('/api/fonts'),

    upload: (formData: FormData): Promise<{ id: string; name: string; url: string }> =>
      http.upload('/api/fonts', formData),

    /** Upload a font file by name and base64 content */
    uploadByName: (name: string, content: string): Promise<{ url: string; name: string }> =>
      http.post('/api/fonts/upload', { name, content }),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/fonts/${id}`),
  };
}
