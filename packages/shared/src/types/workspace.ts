import type { BuiltInAgentToolName } from './tool.js';

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
  autoProcessIssues?: boolean;
  notificationSettings?: WorkspaceNotificationSettings;
}

export type NotificationProvider = 'lark' | 'wechat';

export type NotificationEventKey = 'issue_started' | 'issue_completed' | 'issue_task_completed';

export interface WorkspaceNotificationSettings {
  enabled: boolean;
  provider: NotificationProvider;
  events: NotificationEventKey[];
  serviceRunning?: boolean;
  botAgentId?: string;
  lark?: {
    appId?: string;
    appSecret?: string;
    chatIds?: string[];
  };
  wechat?: {
    token?: string;
    baseUrl?: string;
    accountId?: string;
    userId?: string;
    userIds?: string[];
    getUpdatesBuf?: string;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  role: 'scheduler' | 'planner' | 'executor' | 'reviewer' | 'commit' | 'custom' | 'bot';
  description?: string;
  runtimeKind?: 'open-agent-sdk' | 'claude-code' | 'codex';
  modelProvider?: 'anthropic-messages' | 'openai-chat-completions' | 'openai-responses' | 'openai-responses-to-anthropic-messages' | 'openai-chat-completions-to-anthropic-messages' | 'gemini-generate-content';
  modelId?: string;
  apiBase?: string;
  apiKey?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: string[];
  tools?: BuiltInAgentToolName[];
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
