// Service lifecycle
export { startWorkspaceNotificationService, stopWorkspaceNotificationService, startPersistedNotificationServices, sendTestNotification } from './service.js';

// Event publishing
export { publishWorkspaceEvent } from './events.js';

// WeChat login
export { getWeChatLoginQRCode, pollWeChatLoginStatus } from './wechat-api.js';

// Types
export type { NotificationBroadcastEvent, WeChatLoginQRCodeResult } from './types.js';
