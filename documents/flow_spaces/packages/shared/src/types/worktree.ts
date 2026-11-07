export interface WorktreeInfo {
  id: string;
  workspaceId: string;
  name: string;
  branch: string;
  path: string;
  agentId?: string;
  issueId?: string;
  nodeExecutionId?: string;
  prUrl?: string;
  status: WorktreeStatus;
  createdAt: string;
  updatedAt: string;
}

export type WorktreeStatus = 'active' | 'merged' | 'deleted';

export interface CreateWorktreeInput {
  name: string;
  branch?: string;
  agentId?: string;
  issueId?: string;
  nodeExecutionId?: string;
}
