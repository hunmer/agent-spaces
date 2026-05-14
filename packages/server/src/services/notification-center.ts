import { randomUUID } from 'node:crypto';
import { readJsonFile, writeJsonFile, ensureDir } from '../storage/json-store.js';
import { join } from 'node:path';
import type { AppNotification, NotificationType } from '@agent-spaces/shared';
import { broadcastToWorkspace } from '../ws/connection-manager.js';

function notificationsPath(workspaceId: string): string {
  const dir = join(
    process.env.AGENT_SPACES_DATA_DIR || join(process.env.HOME || '~', '.agent-spaces-data'),
    'workspaces', workspaceId,
  );
  ensureDir(dir);
  return join(dir, 'notifications.json');
}

function readAll(workspaceId: string): AppNotification[] {
  return readJsonFile<AppNotification[]>(notificationsPath(workspaceId)) ?? [];
}

function writeAll(workspaceId: string, notifications: AppNotification[]): void {
  writeJsonFile(notificationsPath(workspaceId), notifications);
}

export function listNotifications(workspaceId: string): AppNotification[] {
  return readAll(workspaceId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function createNotification(
  workspaceId: string,
  type: NotificationType,
  title: string,
  description: string | undefined,
  data: Record<string, unknown>,
): AppNotification {
  const notifications = readAll(workspaceId);
  const notification: AppNotification = {
    id: randomUUID(),
    workspaceId,
    type,
    title,
    description,
    data,
    read: false,
    createdAt: new Date().toISOString(),
  };
  notifications.push(notification);
  writeAll(workspaceId, notifications);
  broadcastToWorkspace(workspaceId, 'notification.created', notification);
  return notification;
}

export function markRead(workspaceId: string, notificationId: string): AppNotification | null {
  const notifications = readAll(workspaceId);
  const n = notifications.find((n) => n.id === notificationId);
  if (!n) return null;
  n.read = true;
  writeAll(workspaceId, notifications);
  return n;
}

export function clearAll(workspaceId: string): void {
  writeAll(workspaceId, []);
  broadcastToWorkspace(workspaceId, 'notification.cleared', null);
}

export function unreadCount(workspaceId: string): number {
  return readAll(workspaceId).filter((n) => !n.read).length;
}
