import * as workspaceService from '../workspace.js';
import { resolveCredentials } from '../robot-account.js';
import type { BroadcastEnvelope } from './types.js';
import { adapters } from './types.js';
import { persistServiceRunning } from './helpers.js';
import { WeChatNotificationAdapter } from './wechat-adapter.js';
import { LarkNotificationAdapter } from './lark-adapter.js';

export async function startWorkspaceNotificationService(workspaceId: string): Promise<{ started: boolean; provider?: string }> {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings?.enabled) return { started: false };

  await stopWorkspaceNotificationService(workspaceId);

  const credentials = resolveCredentials(settings);

  if (settings.provider === 'lark') {
    if (!credentials || credentials.type !== 'lark') {
      throw new Error('Lark credentials not found. Link a Robot Account or configure appId/appSecret.');
    }
    const mergedSettings = { ...settings, lark: { ...settings.lark, appId: credentials.appId, appSecret: credentials.appSecret } };
    const adapter = new LarkNotificationAdapter(workspace, mergedSettings);
    await adapter.start();
    adapters.set(workspaceId, adapter);
    persistServiceRunning(workspaceId, true);
    return { started: true, provider: 'lark' };
  }

  if (settings.provider === 'wechat') {
    if (!credentials || credentials.type !== 'wechat') {
      throw new Error('WeChat credentials not found. Link a Robot Account or scan QR code first.');
    }
    const mergedSettings = { ...settings, wechat: { ...settings.wechat, token: credentials.token, baseUrl: credentials.baseUrl, accountId: credentials.accountId, userId: credentials.userId } };
    const adapter = new WeChatNotificationAdapter(workspace, mergedSettings);
    await adapter.start();
    adapters.set(workspaceId, adapter);
    persistServiceRunning(workspaceId, true);
    return { started: true, provider: 'wechat' };
  }

  return { started: false, provider: settings.provider };
}

export async function stopWorkspaceNotificationService(workspaceId: string): Promise<void> {
  const adapter = adapters.get(workspaceId);
  if (adapter) {
    adapters.delete(workspaceId);
    await adapter.stop();
  }
  persistServiceRunning(workspaceId, false);
}

export async function startPersistedNotificationServices(): Promise<void> {
  for (const workspace of workspaceService.getAll()) {
    const settings = workspace.notificationSettings;
    if (!settings?.enabled || !settings.serviceRunning) continue;
    try {
      await startWorkspaceNotificationService(workspace.id);
      console.log(`[notification] restored ${settings.provider} service workspaceId=${workspace.id}`);
    } catch (err) {
      console.error(`[notification] failed to restore service workspaceId=${workspace.id}:`, err);
    }
  }
}

export async function sendTestNotification(workspaceId: string): Promise<{ sent: boolean; reason?: string }> {
  const workspace = workspaceService.getById(workspaceId);
  if (!workspace?.notificationSettings?.enabled) {
    return { sent: false, reason: 'Notification service is not enabled' };
  }

  let adapter = adapters.get(workspaceId);
  if (!adapter) {
    const started = await startWorkspaceNotificationService(workspaceId);
    if (!started.started) return { sent: false, reason: 'Notification service is not running' };
    adapter = adapters.get(workspaceId);
  }
  if (!adapter) return { sent: false, reason: 'Notification adapter is unavailable' };
  if (!adapter.hasRecipients()) {
    const provider = workspace.notificationSettings.provider === 'wechat' ? 'WeChat user' : 'Feishu chat';
    return { sent: false, reason: `No ${provider} is registered yet. Send any message to the bot first.` };
  }

  await adapter.send({
    event: 'issue_status_change',
    workspaceId,
    timestamp: new Date().toISOString(),
    data: {
      title: 'Notification test',
      status: 'test',
      message: 'Agent Spaces notification service is connected.',
    },
  });
  return { sent: true };
}
