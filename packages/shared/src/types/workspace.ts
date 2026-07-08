import type { BuiltInAgentToolName } from './tool.js';

export type BuiltInAgentRole = 'agent' | 'scheduler' | 'bot';
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
  editorSettings?: WorkspaceEditorSettings;
  notificationSettings?: WorkspaceNotificationSettings;
  hooksEnabled?: boolean;
  isWorktree?: boolean;
  parentWorkspaceId?: string;
}

export type NotificationProvider = 'lark' | 'wechat' | 'native';

export interface WorkspaceEditorSettings {
  showHiddenFiles?: boolean;
}

export type NotificationEventKey = 'issue_started' | 'issue_completed';

export interface RobotAccount {
  id: string;
  name: string;
  type: 'lark' | 'wechat';
  lark?: { appId: string; appSecret: string };
  wechat?: { token: string; baseUrl?: string; accountId: string; userId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceNotificationSettings {
  enabled: boolean;
  provider: NotificationProvider;
  events: NotificationEventKey[];
  serviceRunning?: boolean;
  botAgentId?: string;
  botMarkdown?: boolean;
  robotAccountId?: string;
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
  native?: {
    permissionGranted?: boolean;
    androidOngoingWorkflowNotification?: boolean;
  };
}

export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  runtimeKind?: 'open-agent-sdk' | 'claude-code' | 'codex' | 'langchain' | 'hermes' | 'oh-my-pi';
  modelProvider?: 'anthropic-messages' | 'openai-chat-completions' | 'openai-responses' | 'openai-responses-to-anthropic-messages' | 'openai-chat-completions-to-anthropic-messages' | 'gemini-generate-content';
  providerId?: string;
  modelId?: string;
  apiBase?: string;
  apiKey?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: string[];
  tools?: BuiltInAgentToolName[];
  boundWorkflowIds?: string[];
  boundWorkflowPluginTools?: Array<{ pluginId: string; toolName: string }>;
  systemPrompt?: string;
  outputStyle?: string;
  /** 预设消息建议：聊天输入框的快捷提示（如 mini-app 预览聊天） */
  suggestions?: string[];
  /** 开场白：进入会话空状态时由 Agent 主动发出的欢迎语 */
  openingMessage?: string;
  temperature?: number;
  maxTokens?: number;
  avatarUrl?: string;
  /** emoji icon，优先级低于 avatarUrl */
  icon?: string;
  /** 个人资料背景图 */
  backgroundUrl?: string;
  sandboxDirs?: string[];
  maxRetries?: number;
  /** 标识该 agent 由哪个模板创建，用于导入去重 */
  templateId?: string;
  /** Hide this agent from the global sidebar agent list. */
  hideInAgentList?: boolean;
  enabled: boolean;
}

export interface CreateWorkspaceInput {
  name: string;
  boundDirs: string[];
}
