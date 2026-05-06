import type { WorkspaceNotificationSettings } from '@agent-spaces/shared';
import * as workspaceService from '../workspace.js';

export function shouldNotify(workspaceId: string, event: NonNullable<WorkspaceNotificationSettings['events']>[number]): boolean {
  const settings = workspaceService.getById(workspaceId)?.notificationSettings;
  return Boolean(settings?.enabled && settings.events?.includes(event));
}

export function isIssueStartStatus(status?: string): boolean {
  return status === 'planned' || status === 'in_progress';
}

export function isTaskDoneStatus(status?: string): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled';
}

export function persistServiceRunning(workspaceId: string, serviceRunning: boolean): void {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings || settings.serviceRunning === serviceRunning) return;
  workspaceService.update(workspaceId, {
    notificationSettings: {
      ...settings,
      serviceRunning,
    },
  });
}

export function persistLarkChatIds(workspaceId: string, chatIds: string[]): void {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings) return;
  workspaceService.update(workspaceId, {
    notificationSettings: {
      ...settings,
      lark: {
        ...settings.lark,
        chatIds: [...new Set(chatIds)],
      },
    },
  });
}

export function persistWeChatUserIds(workspaceId: string, userIds: string[]): void {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings) return;
  workspaceService.update(workspaceId, {
    notificationSettings: {
      ...settings,
      wechat: {
        ...settings.wechat,
        userIds: [...new Set(userIds)],
      },
    },
  });
}

export function persistWeChatGetUpdatesBuf(workspaceId: string, getUpdatesBuf: string): void {
  const workspace = workspaceService.getById(workspaceId);
  const settings = workspace?.notificationSettings;
  if (!workspace || !settings) return;
  workspaceService.update(workspaceId, {
    notificationSettings: {
      ...settings,
      wechat: {
        ...settings.wechat,
        getUpdatesBuf,
      },
    },
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
