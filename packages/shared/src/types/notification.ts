export type NotificationType = 'issue_completed' | 'issue_failed' | 'task_completed' | 'task_failed';

export interface AppNotification {
  id: string;
  workspaceId: string;
  type: NotificationType;
  title: string;
  description?: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
