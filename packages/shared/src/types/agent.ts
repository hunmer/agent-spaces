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

/** 过滤运算符（前后端共享，与 reui/filters.tsx 对齐） */
export type UsageFilterOperator =
  | 'is' | 'is_not' | 'is_any_of' | 'is_not_any_of'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'empty' | 'not_empty'
  | 'greater_than' | 'less_than' | 'between';

/** 单个过滤条件，field 用 camelCase（与 AgentUsageRecord 字段名一致） */
export interface UsageFilter {
  id: string;
  field: string;
  operator: UsageFilterOperator;
  values: (string | number)[];
}

/** recent 用量表格查询入参 */
export interface AgentUsageRecentQuery {
  days?: number;
  filters?: UsageFilter[];
  page?: number;
  pageSize?: number;
}

/** recent 用量表格查询结果 */
export interface AgentUsageRecentResult {
  records: AgentUsageRecord[];
  total: number;
}

/** 过滤选项（model/status/role 去重列表，供下拉选择） */
export interface AgentUsageFilterOptions {
  models: string[];
  statuses: string[];
  roles: string[];
  runtimes: string[];
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
  systemPrompt?: string;
  source: 'channel' | 'cli_history' | 'none';
  cliHistoryPath?: string;
  rawSession?: unknown;
}
