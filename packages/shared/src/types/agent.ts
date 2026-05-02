export type AgentSessionStatus =
  | 'idle'
  | 'active'
  | 'blocked'
  | 'completed'
  | 'crashed';

export interface AgentSession {
  id: string;
  workspaceId: string;
  agentConfigId: string;
  role: 'scheduler' | 'planner' | 'executor' | 'reviewer' | 'custom';
  status: AgentSessionStatus;
  currentTaskId?: string;
  processId?: number;
  startedAt: string;
  lastActivityAt: string;
  error?: string;
}
