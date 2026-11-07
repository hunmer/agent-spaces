import type { HttpClient } from '../client';

export function createAuthApi(http: HttpClient) {
  return {
    login: (secretKey: string): Promise<{ token: string }> =>
      http.post('/api/auth/login', { secretKey }, { noAuth: true }),

    check: (): Promise<{ valid: boolean }> =>
      http.get('/api/auth/check'),

    /** 头像上传 */
    uploadAvatar: (formData: FormData): Promise<{ url: string }> =>
      http.upload('/api/avatar', formData),

    /** Change secret key */
    changeSecret: (newSecret: string): Promise<void> =>
      http.postVoid('/api/auth/change-secret', { newSecret }),
  };
}
