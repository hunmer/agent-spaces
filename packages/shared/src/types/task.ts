export type TaskStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'
  | 'retrying'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface Task {
  id: string;
  issueId: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgentId?: string;
  sandboxDirs?: string[];
  executionLog?: string;
  diffFiles?: string[];
  retryCount: number;
  maxRetries: number;
  result?: TaskResult;
  createdAt: string;
  updatedAt: string;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  artifacts: string[];
  error?: string;
}
