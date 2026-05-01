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
  title: string;
  description: string;
  status: IssueStatus;
  planFile?: string;
  tasks: string[];
  assignedAgents: string[];
  branch?: string;
  prUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  title: string;
  description: string;
}
