import type { BuiltInAgentToolName } from './tool.js';

export type BuiltInAgentRole = 'agent' | 'scheduler' | 'task_creator' | 'bot';
export type AgentRole = BuiltInAgentRole | (string & {});

export interface Workspace {
  id: string;
  name: string;
  boundDirs: string[];
  agentspaceDir: string;
  createdAt: string;
  updatedAt: string;
  activeChannels: string[];
  activeIssues: string[];
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
  botMarkdown?: boolean;
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
  role: AgentRole;
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
  /** 标识该 agent 由哪个模板创建，用于导入去重 */
  templateId?: string;
  enabled: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  boundDirs: string[];
}
