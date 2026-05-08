import type { IssueStatus, TaskStatus } from '@agent-spaces/shared';

export const ISSUE_STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  planned: 'outline',
  in_progress: 'default',
  review_pending: 'outline',
  changes_requested: 'destructive',
  approved: 'default',
  completed: 'secondary',
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
