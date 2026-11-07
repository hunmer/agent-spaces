import type { HttpClient } from '../client';

export function createAvatarApi(http: HttpClient) {
  return {
    get: (userId: string): Promise<{ url: string }> =>
      http.get(`/api/avatar/${userId}`),

    upload: (formData: FormData): Promise<{ url: string }> =>
      http.upload('/api/avatar', formData),
  };
}
