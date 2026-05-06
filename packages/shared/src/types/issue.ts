export type IssueStatus =
  | 'draft'
  | 'planned'
  | 'in_progress'
  | 'review_pending'
  | 'changes_requested'
  | 'approved'
  | 'completed'
  | 'archived'
  | 'error';

export interface Issue {
  id: string;
  workspaceId: string;
  channelId: string;
  title: string;
  description: string;
  status: IssueStatus;
  planFile?: string;
  tasks: string[];
  assignedAgents: string[];
  members: string[];
  retryCount: number;
  maxRetries: number;
  retryPaused?: boolean;
  lastError?: string;
  branch?: string;
  prUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueComment {
  id: string;
  issueId: string;
  workspaceId: string;
  senderId: string;
  senderRole?: string;
  content: string;
  source?: 'user' | 'agent_progress';
  metadata?: {
    channelId?: string;
    messageId?: string;
    agentSessionId?: string;
    runtime?: string;
    model?: string;
    summary?: string;
    duration?: number;
    taskId?: string;
    mentions?: string[];
    phase?: 'planner' | 'task_creator' | 'executor' | 'reviewer';
  };
  createdAt: string;
  updatedAt?: string;
}

export interface CreateIssueInput {
  title: string;
  description: string;
  members?: string[];
}
