import type { IssueStatus, TaskStatus } from '@agent-spaces/shared';

export const ISSUE_STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  in_progress: 'default',
  completed: 'secondary',
  stopped: 'outline',
  archived: 'outline',
  error: 'destructive',
};

export const TASK_STATUS_COLOR: Record<TaskStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  reviewing: 'outline',
  waiting_review: 'outline',
  retrying: 'outline',
  done: 'secondary',
  failed: 'destructive',
  cancelled: 'outline',
};
