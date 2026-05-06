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
  role: 'scheduler' | 'planner' | 'executor' | 'reviewer' | 'commit' | 'custom' | 'bot';
  status: AgentSessionStatus;
  currentTaskId?: string;
  processId?: number;
  startedAt: string;
  lastActivityAt: string;
  error?: string;
}

export interface AgentUsageRecord {
  id: string;
  workspaceId: string;
  agentSessionId: string;
  agentConfigId: string;
  role: AgentSession['role'];
  status: AgentSessionStatus;
  runtime?: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  summary?: string;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
}

export interface AgentUsageDashboard {
  periodLabel: string;
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    avgDurationMs: number;
  };
  daily: Array<{
    date: string;
    label: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
  byModel: Array<{
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
  recent: AgentUsageRecord[];
}
