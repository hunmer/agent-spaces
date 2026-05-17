import type { TaskResult, WorkspaceNotificationSettings } from '@agent-spaces/shared';

export type NotificationBroadcastEvent =
  | 'issuse_status_change'
  | 'issue_status_change'
  | 'issue_task_start'
  | 'issue_task_done'
  | 'channel_agent_completed';

export interface BroadcastEnvelope {
  event: NotificationBroadcastEvent;
  workspaceId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface BotAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(envelope: BroadcastEnvelope): Promise<void>;
  hasRecipients(): boolean;
}

export interface LarkMessageReceiveEvent {
  event_id?: string;
  header?: { event_id?: string };
  sender?: { sender_type?: string };
  message?: {
    chat_id?: string;
    content?: string;
    message_id?: string;
    message_type?: string;
    create_time?: string;
  };
}

export interface WeChatQRCodeSession {
  qrcode: string;
  qrcodeImgContent: string;
  createdAt: number;
}

export interface WeChatLoginQRCodeResult {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  qrcode?: string;
  qrcodeImgContent?: string;
  accountId?: string;
  userId?: string;
  baseUrl?: string;
  workspace?: import('@agent-spaces/shared').Workspace;
}

export interface WeChatQRCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

export interface WeChatQRCodeStatusResponse {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
}

export interface WeChatCredentials {
  token: string;
  baseUrl: string;
  accountId: string;
  userId?: string;
}

export const WeChatMessageType = {
  USER: 1,
  BOT: 2,
} as const;

export const WeChatMessageItemType = {
  TEXT: 1,
} as const;

export const WeChatMessageState = {
  FINISH: 2,
} as const;

export interface WeChatMessageItem {
  type?: number;
  text_item?: { text?: string };
  ref_msg?: { title?: string; message_item?: WeChatMessageItem };
}

export interface WeChatMessage {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  create_time_ms?: number;
  session_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: WeChatMessageItem[];
  context_token?: string;
}

export interface WeChatGetUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeChatMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

export interface BotCommandContext {
  workspaceId?: string;
  issueId?: string;
  markdown?: boolean;
}

export interface BuildCommandResponseInput {
  defaultWorkspaceId: string;
  conversationId: string;
  text: string;
}

// Shared state
export const adapters = new Map<string, BotAdapter>();
export const larkChatIdsByWorkspace = new Map<string, Set<string>>();
export const recentLarkMessageIdsByWorkspace = new Map<string, Map<string, number>>();
export const botCommandContexts = new Map<string, BotCommandContext>();
export const recentWechatMessageIdsByWorkspace = new Map<string, Map<string, number>>();
export const wechatUserIdsByWorkspace = new Map<string, Set<string>>();
export const wechatContextTokensByWorkspace = new Map<string, Map<string, string>>();
export const wechatLoginSessions = new Map<string, WeChatQRCodeSession>();

// Constants
export const LARK_MESSAGE_DEDUPE_TTL_MS = 5 * 60 * 1000;
export const WECHAT_BASE_URL = 'https://ilinkai.weixin.qq.com';
export const WECHAT_BOT_TYPE = '3';
export const WECHAT_API_TIMEOUT_MS = 15_000;
export const WECHAT_QR_STATUS_TIMEOUT_MS = 8_000;
export const WECHAT_LONG_POLL_TIMEOUT_MS = 35_000;
export const WECHAT_RETRY_DELAY_MS = 2_000;
export const WECHAT_BACKOFF_DELAY_MS = 30_000;
export const WECHAT_MAX_CONSECUTIVE_FAILURES = 5;
export const WECHAT_MESSAGE_DEDUPE_TTL_MS = 5 * 60 * 1000;
