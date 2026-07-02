export type NotificationType = 'issue_completed' | 'issue_failed' | 'workflow_completed' | 'workflow_failed' | 'channel_agent_completed';

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
