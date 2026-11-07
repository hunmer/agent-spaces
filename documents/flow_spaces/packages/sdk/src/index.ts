/**
 * @agent-spaces/sdk — Agent Spaces 前端 API 统一 SDK
 *
 * 用法：
 *   import { createSDK } from '@agent-spaces/sdk';
 *   const sdk = createSDK({
 *     baseUrl: 'http://localhost:3100',
 *     getToken: () => localStorage.getItem('token'),
 *     onUnauthorized: () => { window.location.href = '/login'; },
 *     debug: import.meta.env.DEV,
 *   });
 *
 *   // 调用
 *   const workspaces = await sdk.workspace.list();
 *   const status = await sdk.git.status(wsId);
 *
 *   // 调试开关（运行时切换）
 *   sdk.setDebug(true);
 *   sdk.setDebug(false);
 */

// ---- 核心导出 ----
export { HttpClient } from './client';
export { ApiError } from './types';
export type { SDKConfig, RequestOptions } from './types';

// ---- 模块导出 ----
export { createWorkspaceApi } from './modules/workspace';
export { createAgentApi } from './modules/agent';
export { createChannelApi } from './modules/channel';
export { createIssueApi } from './modules/issue';
export { createGitApi } from './modules/git';
export { createEditorApi } from './modules/editor';
export { createLlmApi } from './modules/llm';
export { createWorkflowApi } from './modules/workflow';
export { createWorkflowPluginApi } from './modules/workflow-plugin';
export { createKnowledgeBaseApi } from './modules/knowledge-base';
export { createWorktreeApi } from './modules/worktree';
export { createHooksApi } from './modules/hooks';
export { createCommandApi } from './modules/command';
export { createSubscriptionApi } from './modules/subscription';
export { createNotificationApi } from './modules/notification';
export { createSpeechApi } from './modules/speech';
export { createPromptsApi, type PromptTemplate } from './modules/prompts';
export { createSkillsApi, type SkillInfo, type SkillSyncItem } from './modules/skills';
export { createSkillsPackageApi, type InstalledSkillsPackage } from './modules/skills-package';
export { createMcpsApi, type McpServerInfo } from './modules/mcps';
export { createNpmSettingsApi, type NpmSettings } from './modules/npm-settings';
export { createWorkflowSettingsApi, type WorkflowSettings, type WorkflowFaultTolerance } from './modules/workflow-settings';
export { createOutputStylesApi, type OutputStyleTemplate } from './modules/output-styles';
export { createToolsApi } from './modules/tools';
export { createRobotAccountsApi, type RobotAccount } from './modules/robot-accounts';
export { createAuthApi } from './modules/auth';
export { createDataApi } from './modules/data';
export { createVersionApi } from './modules/version';
export { createSearchApi } from './modules/search';
export { createAgentStoreApi } from './modules/agent-store';
export { createFontApi } from './modules/font';
export { createInspectorApi } from './modules/inspector';
export { createAvatarApi } from './modules/avatar';
export { createAgentCommandsApi } from './modules/agent-commands';
export { createExternalImportApi, type ExternalImportKind, type ExternalImportMode, type ExternalImportSource, type ExternalImportResult } from './modules/external-import';
export { createChatApi } from './modules/chat';
export type { ChatAgent, ChatMessage, ChatWorkspace, ChatSession } from './modules/chat';
export { createMiniAppApi, type MiniAppProject, type MiniAppAgentConfig, type MiniAppChatMessage } from './modules/mini-apps';
export { createSqliteApi } from './modules/sqlite';
export { createTeamApi } from './modules/team';
export type {
  TeamView,
  TeamMembershipView,
  TeamDetail,
  TeamRuntimeView,
  TeamRuntimeMessageView,
  TeamRuntimeAgentProfile,
  TeamRuntimeResponse,
  TeamSessionView,
  TeamInboxItemView,
  TeamInboxListResponse,
  ListTeamsParams,
  CreateTeamInput,
  UpdateTeamInput,
} from './modules/team';

// ---- 工厂函数 ----

import { HttpClient } from './client';
import type { SDKConfig } from './types';

import { createWorkspaceApi } from './modules/workspace';
import { createAgentApi } from './modules/agent';
import { createChannelApi } from './modules/channel';
import { createIssueApi } from './modules/issue';
import { createGitApi } from './modules/git';
import { createEditorApi } from './modules/editor';
import { createLlmApi } from './modules/llm';
import { createWorkflowApi } from './modules/workflow';
import { createWorkflowPluginApi } from './modules/workflow-plugin';
import { createKnowledgeBaseApi } from './modules/knowledge-base';
import { createWorktreeApi } from './modules/worktree';
import { createHooksApi } from './modules/hooks';
import { createCommandApi } from './modules/command';
import { createSubscriptionApi } from './modules/subscription';
import { createNotificationApi } from './modules/notification';
import { createSpeechApi } from './modules/speech';
import { createPromptsApi } from './modules/prompts';
import { createSkillsApi } from './modules/skills';
import { createSkillsPackageApi } from './modules/skills-package';
import { createMcpsApi } from './modules/mcps';
import { createNpmSettingsApi } from './modules/npm-settings';
import { createWorkflowSettingsApi } from './modules/workflow-settings';
import { createOutputStylesApi } from './modules/output-styles';
import { createToolsApi } from './modules/tools';
import { createRobotAccountsApi } from './modules/robot-accounts';
import { createAuthApi } from './modules/auth';
import { createDataApi } from './modules/data';
import { createVersionApi } from './modules/version';
import { createSearchApi } from './modules/search';
import { createAgentStoreApi } from './modules/agent-store';
import { createFontApi } from './modules/font';
import { createInspectorApi } from './modules/inspector';
import { createAvatarApi } from './modules/avatar';
import { createAgentCommandsApi } from './modules/agent-commands';
import { createExternalImportApi } from './modules/external-import';
import { createChatApi } from './modules/chat';
import { createMiniAppApi } from './modules/mini-apps';
import { createSqliteApi } from './modules/sqlite';
import { createTeamApi } from './modules/team';

export interface SDK {
  /** 底层 HTTP 客户端 */
  readonly http: HttpClient;
  /** 切换调试日志 */
  setDebug(enabled: boolean): void;
  /** 更新配置（切换服务器等） */
  updateConfig(patch: Partial<SDKConfig>): void;

  // ---- API 模块 ----
  readonly workspace: ReturnType<typeof createWorkspaceApi>;
  readonly agent: ReturnType<typeof createAgentApi>;
  readonly channel: ReturnType<typeof createChannelApi>;
  readonly issue: ReturnType<typeof createIssueApi>;
  readonly git: ReturnType<typeof createGitApi>;
  readonly editor: ReturnType<typeof createEditorApi>;
  readonly llm: ReturnType<typeof createLlmApi>;
  readonly workflow: ReturnType<typeof createWorkflowApi>;
  readonly workflowPlugin: ReturnType<typeof createWorkflowPluginApi>;
  readonly knowledgeBase: ReturnType<typeof createKnowledgeBaseApi>;
  readonly worktree: ReturnType<typeof createWorktreeApi>;
  readonly hooks: ReturnType<typeof createHooksApi>;
  readonly command: ReturnType<typeof createCommandApi>;
  readonly subscription: ReturnType<typeof createSubscriptionApi>;
  readonly notification: ReturnType<typeof createNotificationApi>;
  readonly speech: ReturnType<typeof createSpeechApi>;
  readonly prompts: ReturnType<typeof createPromptsApi>;
  readonly skills: ReturnType<typeof createSkillsApi>;
  readonly skillsPackage: ReturnType<typeof createSkillsPackageApi>;
  readonly mcps: ReturnType<typeof createMcpsApi>;
  readonly npmSettings: ReturnType<typeof createNpmSettingsApi>;
  readonly workflowSettings: ReturnType<typeof createWorkflowSettingsApi>;
  readonly outputStyles: ReturnType<typeof createOutputStylesApi>;
  readonly tools: ReturnType<typeof createToolsApi>;
  readonly robotAccounts: ReturnType<typeof createRobotAccountsApi>;
  readonly auth: ReturnType<typeof createAuthApi>;
  readonly data: ReturnType<typeof createDataApi>;
  readonly version: ReturnType<typeof createVersionApi>;
  readonly search: ReturnType<typeof createSearchApi>;
  readonly agentStore: ReturnType<typeof createAgentStoreApi>;
  readonly font: ReturnType<typeof createFontApi>;
  readonly inspector: ReturnType<typeof createInspectorApi>;
  readonly avatar: ReturnType<typeof createAvatarApi>;
  readonly agentCommands: ReturnType<typeof createAgentCommandsApi>;
  readonly externalImport: ReturnType<typeof createExternalImportApi>;
  readonly chat: ReturnType<typeof createChatApi>;
  readonly miniApp: ReturnType<typeof createMiniAppApi>;
  readonly sqlite: ReturnType<typeof createSqliteApi>;
  readonly team: ReturnType<typeof createTeamApi>;
}

/**
 * 创建 SDK 实例 — 统一入口
 *
 * @param config.baseUrl - 服务器基础 URL
 * @param config.getToken - Token 获取函数（延迟求值）
 * @param config.onUnauthorized - 401/403 回调
 * @param config.debug - 是否启用调试日志
 */
export function createSDK(config: SDKConfig): SDK {
  const http = new HttpClient(config);

  return {
    http,
    setDebug: (enabled: boolean) => http.setDebug(enabled),
    updateConfig: (patch: Partial<SDKConfig>) => http.updateConfig(patch),

    workspace: createWorkspaceApi(http),
    agent: createAgentApi(http),
    channel: createChannelApi(http),
    issue: createIssueApi(http),
    git: createGitApi(http),
    editor: createEditorApi(http),
    llm: createLlmApi(http),
    workflow: createWorkflowApi(http),
    workflowPlugin: createWorkflowPluginApi(http),
    knowledgeBase: createKnowledgeBaseApi(http),
    worktree: createWorktreeApi(http),
    hooks: createHooksApi(http),
    command: createCommandApi(http),
    subscription: createSubscriptionApi(http),
    notification: createNotificationApi(http),
    speech: createSpeechApi(http),
    prompts: createPromptsApi(http),
    skills: createSkillsApi(http),
    skillsPackage: createSkillsPackageApi(http),
    mcps: createMcpsApi(http),
    npmSettings: createNpmSettingsApi(http),
    workflowSettings: createWorkflowSettingsApi(http),
    outputStyles: createOutputStylesApi(http),
    tools: createToolsApi(http),
    robotAccounts: createRobotAccountsApi(http),
    auth: createAuthApi(http),
    data: createDataApi(http),
    version: createVersionApi(http),
    search: createSearchApi(http),
    agentStore: createAgentStoreApi(http),
    font: createFontApi(http),
    inspector: createInspectorApi(http),
    avatar: createAvatarApi(http),
    agentCommands: createAgentCommandsApi(http),
    externalImport: createExternalImportApi(http),
    chat: createChatApi(http),
    miniApp: createMiniAppApi(http),
    sqlite: createSqliteApi(http),
    team: createTeamApi(http),
  };
}
