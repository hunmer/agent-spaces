import crypto from 'node:crypto';
import type { Workspace } from '@agent-spaces/shared';
import * as workspaceService from '../workspace.js';
import {
  type WeChatCredentials,
  type WeChatGetUpdatesResponse,
  type WeChatLoginQRCodeResult,
  type WeChatMessage,
  type WeChatQRCodeResponse,
  type WeChatQRCodeSession,
  type WeChatQRCodeStatusResponse,
  WeChatMessageItemType,
  WeChatMessageState,
  WeChatMessageType,
  WECHAT_API_TIMEOUT_MS,
  WECHAT_BASE_URL,
  WECHAT_BOT_TYPE,
  WECHAT_LONG_POLL_TIMEOUT_MS,
  WECHAT_MESSAGE_DEDUPE_TTL_MS,
  WECHAT_QR_STATUS_TIMEOUT_MS,
  wechatContextTokensByWorkspace,
  wechatLoginSessions,
  recentWechatMessageIdsByWorkspace,
} from './types.js';

// --- WeChat Login ---

export async function getWeChatLoginQRCode(workspaceId: string, forceRefresh = false): Promise<WeChatLoginQRCodeResult> {
  const workspace = workspaceService.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  const settings = workspace.notificationSettings;
  if (!forceRefresh && settings?.wechat?.token && settings.wechat.accountId) {
    return {
      status: 'confirmed',
      accountId: settings.wechat.accountId,
      userId: settings.wechat.userId,
      baseUrl: settings.wechat.baseUrl,
      workspace,
    };
  }

  if (forceRefresh) wechatLoginSessions.delete(workspaceId);
  const existing = wechatLoginSessions.get(workspaceId);
  if (existing && Date.now() - existing.createdAt < 2 * 60_000) {
    return {
      status: 'wait',
      qrcode: existing.qrcode,
      qrcodeImgContent: existing.qrcodeImgContent,
    };
  }

  const qr = await fetchWeChatQRCode();
  wechatLoginSessions.set(workspaceId, {
    qrcode: qr.qrcode,
    qrcodeImgContent: qr.qrcode_img_content,
    createdAt: Date.now(),
  });
  return {
    status: 'wait',
    qrcode: qr.qrcode,
    qrcodeImgContent: qr.qrcode_img_content,
  };
}

export async function pollWeChatLoginStatus(workspaceId: string): Promise<WeChatLoginQRCodeResult> {
  const session = wechatLoginSessions.get(workspaceId);
  if (!session) return getWeChatLoginQRCode(workspaceId);

  const status = await fetchWeChatQRCodeStatus(session.qrcode);
  if (status.status === 'confirmed') {
    if (!status.bot_token || !status.ilink_bot_id) {
      throw new Error('WeChat login confirmed but token or bot id is missing');
    }
    const workspace = workspaceService.getById(workspaceId);
    const settings = workspace?.notificationSettings ?? {
      enabled: true,
      provider: 'wechat' as const,
      events: ['issue_started', 'issue_completed', 'issue_task_completed'] as const,
    };
    const baseUrl = status.baseurl || WECHAT_BASE_URL;
    const updated = workspaceService.update(workspaceId, {
      notificationSettings: {
        ...settings,
        provider: 'wechat',
        wechat: {
          ...settings.wechat,
          token: status.bot_token,
          baseUrl,
          accountId: status.ilink_bot_id,
          userId: status.ilink_user_id,
        },
      },
    });
    wechatLoginSessions.delete(workspaceId);
    return {
      status: 'confirmed',
      accountId: updated?.notificationSettings?.wechat?.accountId,
      userId: updated?.notificationSettings?.wechat?.userId,
      baseUrl: updated?.notificationSettings?.wechat?.baseUrl,
      workspace: updated ?? undefined,
    };
  }

  if (status.status === 'expired') {
    wechatLoginSessions.delete(workspaceId);
  }

  return {
    status: status.status,
    qrcode: session.qrcode,
    qrcodeImgContent: session.qrcodeImgContent,
  };
}

// --- WeChat HTTP API ---

async function fetchWeChatQRCode(): Promise<WeChatQRCodeResponse> {
  const res = await fetch(`${WECHAT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${WECHAT_BOT_TYPE}`);
  if (!res.ok) throw new Error(`Failed to get WeChat QR code: ${res.status}`);
  return await res.json() as WeChatQRCodeResponse;
}

async function fetchWeChatQRCodeStatus(qrcode: string): Promise<WeChatQRCodeStatusResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WECHAT_QR_STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${WECHAT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, {
      headers: { 'iLink-App-ClientVersion': '1' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Failed to poll WeChat QR code status: ${res.status}`);
    return await res.json() as WeChatQRCodeStatusResponse;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') return { status: 'wait' };
    throw err;
  }
}

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function buildWeChatHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function postWeChatApi<T>(
  baseUrl: string,
  endpoint: string,
  body: Record<string, unknown>,
  token?: string,
  timeoutMs = WECHAT_API_TIMEOUT_MS,
): Promise<T> {
  const url = new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const bodyStr = JSON.stringify(body);
  const headers = buildWeChatHeaders(token);
  headers['Content-Length'] = String(Buffer.byteLength(bodyStr, 'utf-8'));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) throw new Error(`WeChat API ${endpoint} responded ${res.status}: ${text}`);
    return JSON.parse(text) as T;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError' && endpoint === 'ilink/bot/getupdates') {
      return { ret: 0, msgs: [], get_updates_buf: (body.get_updates_buf as string | undefined) ?? '' } as T;
    }
    throw err;
  }
}

export async function getWeChatUpdates(baseUrl: string, token: string, buf: string): Promise<WeChatGetUpdatesResponse> {
  return postWeChatApi<WeChatGetUpdatesResponse>(
    baseUrl,
    'ilink/bot/getupdates',
    { get_updates_buf: buf },
    token,
    WECHAT_LONG_POLL_TIMEOUT_MS,
  );
}

export async function sendWeChatTextMessage(
  baseUrl: string,
  token: string,
  to: string,
  text: string,
  contextToken?: string,
): Promise<void> {
  const clientId = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await postWeChatApi(
    baseUrl,
    'ilink/bot/sendmessage',
    {
      msg: {
        from_user_id: '',
        to_user_id: to,
        client_id: clientId,
        message_type: WeChatMessageType.BOT,
        message_state: WeChatMessageState.FINISH,
        item_list: text
          ? [{ type: WeChatMessageItemType.TEXT, text_item: { text } }]
          : undefined,
        context_token: contextToken,
      } satisfies WeChatMessage,
    },
    token,
  );
}

// --- WeChat Message Helpers ---

export function extractWeChatTextFromMessage(msg: WeChatMessage): string {
  for (const item of msg.item_list ?? []) {
    if (item.type !== WeChatMessageItemType.TEXT || !item.text_item?.text) continue;
    const refTitle = item.ref_msg?.title;
    return refTitle ? `[引用: ${refTitle}]\n${item.text_item.text}` : item.text_item.text;
  }
  return '';
}

export function isDuplicateWeChatMessage(workspaceId: string, msg: WeChatMessage): boolean {
  const id = msg.message_id
    ? String(msg.message_id)
    : `${msg.from_user_id ?? ''}:${msg.create_time_ms ?? ''}:${extractWeChatTextFromMessage(msg)}`;
  if (!id.replace(/:/g, '')) return false;

  const now = Date.now();
  const seen = recentWechatMessageIdsByWorkspace.get(workspaceId) ?? new Map<string, number>();
  for (const [key, timestamp] of seen) {
    if (now - timestamp > WECHAT_MESSAGE_DEDUPE_TTL_MS) seen.delete(key);
  }
  recentWechatMessageIdsByWorkspace.set(workspaceId, seen);

  if (seen.has(id)) return true;
  seen.set(id, now);
  return false;
}

export function getWeChatContextToken(workspaceId: string, userId: string): string | undefined {
  return wechatContextTokensByWorkspace.get(workspaceId)?.get(userId);
}

export function setWeChatContextToken(workspaceId: string, userId: string, contextToken: string): void {
  const tokens = wechatContextTokensByWorkspace.get(workspaceId) ?? new Map<string, string>();
  tokens.set(userId, contextToken);
  wechatContextTokensByWorkspace.set(workspaceId, tokens);
}
