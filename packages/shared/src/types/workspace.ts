export interface Workspace {
  id: string;
  name: string;
  boundDirs: string[];
  agentspaceDir: string;
  createdAt: string;
  updatedAt: string;
  activeChannels: string[];
  activeIssues: string[];
  agents: AgentConfig[];
}

export interface AgentConfig {
  id: string;
  role: 'scheduler' | 'planner' | 'executor' | 'reviewer';
  modelProvider?: string;
  modelId?: string;
  sandboxDirs?: string[];
  maxRetries?: number;
  enabled: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  boundDirs: string[];
}
