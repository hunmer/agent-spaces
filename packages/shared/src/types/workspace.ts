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
  name: string;
  role: 'scheduler' | 'planner' | 'executor' | 'reviewer' | 'custom';
  description?: string;
  runtimeKind?: 'open-agent-sdk' | 'claude-code';
  modelProvider?: 'anthropic-messages' | 'openai-chat-completions' | 'openai-responses' | 'gemini-generate-content';
  modelId?: string;
  apiBase?: string;
  apiKey?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: string[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  avatarUrl?: string;
  sandboxDirs?: string[];
  maxRetries?: number;
  enabled: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  boundDirs: string[];
}
