import type { IssueStatus } from '@agent-spaces/shared';

export const ISSUE_STATUS_COLOR: Record<IssueStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  in_progress: 'default',
  completed: 'secondary',
  stopped: 'outline',
  archived: 'outline',
  error: 'destructive',
};
