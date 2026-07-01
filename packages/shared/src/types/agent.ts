import type { AgentRole } from './workspace.js';
import type { MessagePart, MessageMetadata } from './channel.js';
import type { WorkflowAgentTimelineItem } from './workflow.js';

export const BUILTIN_AGENT_IDS = new Set([
  'agent-generator',
  'commit-agent',
  'title-generator',
]);

export function isBuiltinAgent(id: string): boolean {
  return BUILTIN_AGENT_IDS.has(id);
}

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
  role: AgentRole;
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
    requests: number;
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

export interface AgentUsageSessionMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
  senderId?: string;
  senderRole?: string;
  metadata?: MessageMetadata;
  parts?: MessagePart[];
  contextPart?: Extract<MessagePart, { type: 'context' }>;
  timeline?: WorkflowAgentTimelineItem[];
  sourceChannelId?: string;
  sourceChannelName?: string;
}

export interface AgentUsageSessionDetail {
  session: AgentSession | null;
  usage: AgentUsageRecord | null;
  messages: AgentUsageSessionMessage[];
  source: 'channel' | 'cli_history' | 'none';
  cliHistoryPath?: string;
  rawSession?: unknown;
}
