import type { HttpClient } from '../client';

export interface RobotAccount {
  id: string;
  name: string;
  provider: 'lark' | 'wechat';
  credentials: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function createRobotAccountsApi(http: HttpClient) {
  return {
    list: (): Promise<RobotAccount[]> =>
      http.get('/api/robot-accounts'),

    create: (data: Partial<RobotAccount>): Promise<RobotAccount> =>
      http.post('/api/robot-accounts', data),

    update: (id: string, data: Partial<RobotAccount>): Promise<RobotAccount> =>
      http.put(`/api/robot-accounts/${id}`, data),

    delete_: (id: string): Promise<void> =>
      http.delete(`/api/robot-accounts/${id}`),

    /** Request WeChat QR code for login */
    wechatQR: (): Promise<{ error?: string; qrcodeImgContent?: string; sessionId?: string }> =>
      http.post('/api/robot-accounts/wechat/qr'),

    /** Poll WeChat QR scan status */
    wechatQRPoll: (sessionId: string): Promise<{ status: string; error?: string; account?: RobotAccount }> =>
      http.post('/api/robot-accounts/wechat/qr/poll', { sessionId }),
  };
}
