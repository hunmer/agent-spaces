import {
  type WeChatQRCodeSession,
  type WeChatQRCodeStatusResponse,
  WECHAT_BASE_URL,
  WECHAT_BOT_TYPE,
  WECHAT_QR_STATUS_TIMEOUT_MS,
} from './notification-hub/types.js';
import { createAccount } from './robot-account.js';
import type { RobotAccount } from '@agent-spaces/shared';

const globalSessions = new Map<string, WeChatQRCodeSession>();

export interface GlobalWeChatQRResult {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  qrcodeImgContent?: string;
  sessionId?: string;
  account?: RobotAccount;
}

export async function getGlobalWeChatQRCode(): Promise<GlobalWeChatQRResult> {
  // cleanup old sessions
  const now = Date.now();
  for (const [key, s] of globalSessions) {
    if (now - s.createdAt > 5 * 60_000) globalSessions.delete(key);
  }

  const res = await fetch(`${WECHAT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${WECHAT_BOT_TYPE}`);
  if (!res.ok) throw new Error(`Failed to get WeChat QR code: ${res.status}`);
  const qr = await res.json() as { qrcode: string; qrcode_img_content: string };

  const sessionId = `global-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  globalSessions.set(sessionId, {
    qrcode: qr.qrcode,
    qrcodeImgContent: qr.qrcode_img_content,
    createdAt: now,
  });

  return { status: 'wait', qrcodeImgContent: qr.qrcode_img_content, sessionId };
}

export async function pollGlobalWeChatQRCode(sessionId?: string): Promise<GlobalWeChatQRResult> {
  if (!sessionId) throw new Error('sessionId is required');
  const session = globalSessions.get(sessionId);
  if (!session) throw new Error('Session not found or expired');

  const status = await fetchQRStatus(session.qrcode);

  if (status.status === 'confirmed') {
    if (!status.bot_token || !status.ilink_bot_id) {
      throw new Error('WeChat login confirmed but token or bot id is missing');
    }
    globalSessions.delete(sessionId);
    const account = createAccount({
      name: `微信 ${status.ilink_bot_id}`,
      type: 'wechat',
      wechat: {
        token: status.bot_token,
        baseUrl: status.baseurl || WECHAT_BASE_URL,
        accountId: status.ilink_bot_id,
        userId: status.ilink_user_id,
      },
    });
    return { status: 'confirmed', account };
  }

  if (status.status === 'expired') {
    globalSessions.delete(sessionId);
  }

  return { status: status.status, qrcodeImgContent: session.qrcodeImgContent, sessionId };
}

async function fetchQRStatus(qrcode: string): Promise<WeChatQRCodeStatusResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WECHAT_QR_STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${WECHAT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
      headers: { 'iLink-App-ClientVersion': '1' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Failed to poll QR status: ${res.status}`);
    return await res.json() as WeChatQRCodeStatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') return { status: 'wait' };
    throw err;
  }
}
