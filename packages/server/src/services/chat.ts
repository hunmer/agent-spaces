import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import * as store from '../storage/chat-store.js';
import { listProviders } from '../storage/llm-store.js';
import type { ChatAgent, ChatMessage, ChatWorkspace, ChatSession } from '../storage/chat-store.js';

// --- Agent CRUD ---

export function listAgents(): ChatAgent[] {
  return store.listAgents().map(hydrateAgentProvider);
}

export function createAgent(data: Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'>): ChatAgent {
  const id = randomUUID();
  const now = new Date().toISOString();
  const agent: ChatAgent = {
    ...normalizeAgentData(data),
    id,
    workingDir: store.chatWorkspaceDir(id),
    createdAt: now,
    updatedAt: now,
  };
  store.saveAgent(agent, data.skills as Array<string | { name: string; content?: string }> | undefined);
  return hydrateAgentProvider(agent);
}

export function updateAgent(id: string, data: Partial<Omit<ChatAgent, 'id' | 'createdAt'>>): ChatAgent | null {
  const existing = store.findAgent(id);
  if (!existing) return null;
  const updated: ChatAgent = {
    ...existing,
    ...normalizeAgentData({ ...existing, ...data }),
    id,
    createdAt: existing.createdAt,
    workingDir: store.chatWorkspaceDir(id),
    updatedAt: new Date().toISOString(),
  };
  store.saveAgent(updated, data.skills as Array<string | { name: string; content?: string }> | undefined);
  return hydrateAgentProvider(updated);
}

export function deleteAgent(id: string): boolean {
  if (!store.findAgent(id)) return false;
  store.deleteAgent(id);
  return true;
}

export function findAgent(id: string): ChatAgent | undefined {
  const agent = store.findAgent(id);
  return agent ? hydrateAgentProvider(agent) : undefined;
}

// --- Message CRUD ---

export function listMessages(agentId: string, limit?: number, before?: string): ChatMessage[] {
  return store.listMessages(agentId, limit, before);
}

export function saveMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
  const message: ChatMessage = {
    ...msg,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  store.saveMessage(message);
  return message;
}

export function clearMessages(agentId: string): void {
  store.deleteMessagesByAgent(agentId);
}

export function getRecentMessages(agentId: string, limit?: number): ChatMessage[] {
  return store.getRecentMessages(agentId, limit);
}

export function getAgentWorkingDir(agentId: string): string | null {
  const agent = store.findAgent(agentId);
  if (!agent) return null;
  return agent.workingDir || store.chatWorkspaceDir(agentId);
}

export function getAgentConfigDir(agentId: string): string | null {
  return store.findAgent(agentId) ? store.agentDir(agentId) : null;
}

export function resolveProviderIdFromChatAgentInput(data: Partial<ChatAgent> & Record<string, unknown>): string {
  return stringValue(data.providerId) || resolveProviderConfig(data)?.id || '';
}

export function getAgentWorkspace(agentId: string) {
  const workingDir = getAgentWorkingDir(agentId);
  if (!workingDir) return null;
  if (!existsSync(workingDir)) {
    const defaultWorkingDir = store.chatWorkspaceDir(agentId);
    if (workingDir !== defaultWorkingDir) return null;
    mkdirSync(workingDir, { recursive: true });
  }
  const now = new Date().toISOString();
  return {
    id: `chat:${agentId}`,
    name: 'Chat Agent',
    boundDirs: [workingDir],
    agentspaceDir: workingDir,
    createdAt: now,
    updatedAt: now,
    activeChannels: [],
    activeIssues: [],
  };
}

export function getChatWorkspaceRoot(workspaceId: string) {
  const workspace = store.findWorkspace(workspaceId);
  if (!workspace) return null;
  const dir = store.workspaceDir(workspaceId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  return {
    id: `chat-workspace:${workspaceId}`,
    name: workspace.name,
    boundDirs: [dir],
    agentspaceDir: dir,
    createdAt: workspace.createdAt ?? now,
    updatedAt: workspace.updatedAt ?? now,
    activeChannels: [],
    activeIssues: [],
  };
}

// --- Workspace CRUD ---

export function listWorkspaces(): ChatWorkspace[] {
  return store.listWorkspaces();
}

export function createWorkspace(data: { name: string; agentIds?: string[] }): ChatWorkspace {
  return store.createWorkspace(data);
}

export function updateWorkspace(id: string, data: { name?: string; agentIds?: string[] }): ChatWorkspace | null {
  return store.updateWorkspace(id, data);
}

export function deleteWorkspace(id: string): boolean {
  return store.deleteWorkspace(id);
}

// --- Session CRUD ---

export function listSessions(workspaceId: string): ChatSession[] {
  return store.listSessions(workspaceId);
}

export function createSession(workspaceId: string, agentId: string): ChatSession | null {
  return store.createSession(workspaceId, agentId);
}

export function updateSession(
  workspaceId: string,
  sessionId: string,
  data: {
    title?: string;
    archived?: boolean;
    editorDirectoryTabs?: Array<{ id: string; path: string }>;
    activeEditorDirectoryTabId?: string;
  },
): ChatSession | null {
  return store.updateSession(workspaceId, sessionId, data);
}

export function deleteSession(workspaceId: string, sessionId: string): boolean {
  return store.deleteSession(workspaceId, sessionId);
}

export function findSession(workspaceId: string, sessionId: string): ChatSession | undefined {
  return store.findSession(workspaceId, sessionId);
}

// --- Session Messages ---

export function listSessionMessages(workspaceId: string, sessionId: string): ChatMessage[] {
  return store.listSessionMessages(workspaceId, sessionId);
}

export function saveSessionMessage(workspaceId: string, sessionId: string, msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
  const message: ChatMessage = {
    ...msg,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  store.saveSessionMessage(workspaceId, sessionId, message);
  return message;
}

export function clearSessionMessages(workspaceId: string, sessionId: string): void {
  store.clearSessionMessages(workspaceId, sessionId);
}

export function getRecentSessionMessages(workspaceId: string, sessionId: string, limit?: number): ChatMessage[] {
  return store.getRecentSessionMessages(workspaceId, sessionId, limit);
}

// --- Migration ---

export { migrateToWorkspaces } from '../storage/chat-store.js';

function normalizeAgentData(data: Partial<ChatAgent> & Record<string, unknown>): Omit<ChatAgent, 'id' | 'createdAt' | 'updatedAt'> {
  const provider = stringValue(data.provider) || stringValue(data.modelProvider) || 'openai-chat-completions';
  const model = stringValue(data.model) || stringValue(data.modelId) || '';
  const providerConfig = resolveProviderConfig(data);
  const baseURL = providerConfig?.apiBase || stringValue(data.baseURL) || stringValue(data.apiBase) || undefined;
  const avatar = stringValue(data.avatar) || stringValue(data.avatarUrl) || undefined;
  const skills = normalizeSkillNames(data.skills);

  return {
    name: stringValue(data.name) || 'New Chat Agent',
    role: 'agent',
    runtimeKind: 'langchain',
    avatar,
    avatarUrl: avatar,
    icon: stringValue(data.icon) || undefined,
    description: stringValue(data.description) || undefined,
    systemPrompt: stringValue(data.systemPrompt) || undefined,
    provider,
    modelProvider: provider,
    providerId: stringValue(data.providerId) || providerConfig?.id || undefined,
    model,
    modelId: model,
    apiKey: providerConfig?.apiKey || stringValue(data.apiKey) || undefined,
    baseURL,
    apiBase: baseURL,
    workingDir: stringValue(data.workingDir),
    mcps: isRecord(data.mcps) ? data.mcps : {},
    skills,
    tools: Array.isArray(data.tools) ? data.tools as ChatAgent['tools'] : [],
    boundWorkflowIds: normalizeStringList(data.boundWorkflowIds),
    boundWorkflowPluginTools: normalizeBoundWorkflowPluginTools(data.boundWorkflowPluginTools),
    outputStyle: stringValue(data.outputStyle) || undefined,
    temperature: typeof data.temperature === 'number' ? data.temperature : 0.3,
    maxTokens: typeof data.maxTokens === 'number' ? data.maxTokens : 4096,
    enabled: data.enabled !== false,
  };
}

function resolveProviderConfig(data: Partial<ChatAgent>) {
  const providers = listProviders();
  const providerId = stringValue(data.providerId);
  if (providerId) {
    const byId = providers.find((provider) => provider.id === providerId);
    if (byId) return byId;
  }

  const apiBase = stringValue(data.apiBase) || stringValue(data.baseURL);
  const apiKey = stringValue(data.apiKey);
  if (!apiBase && !apiKey) return undefined;
  return providers.find((provider) =>
    (!apiBase || provider.apiBase === apiBase)
    && (!apiKey || provider.apiKey === apiKey),
  );
}

function hydrateAgentProvider(agent: ChatAgent): ChatAgent {
  const provider = resolveProviderConfig(agent);
  if (!provider) {
    return {
      ...agent,
      provider: agent.provider || agent.modelProvider || 'openai-chat-completions',
      baseURL: agent.baseURL || agent.apiBase,
      apiBase: agent.apiBase || agent.baseURL,
    };
  }
  return {
    ...agent,
    providerId: provider.id,
    provider: agent.provider || agent.modelProvider || 'openai-chat-completions',
    apiKey: provider.apiKey,
    baseURL: provider.apiBase,
    apiBase: provider.apiBase,
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map(skill => typeof skill === 'string' ? skill : isRecord(skill) ? stringValue(skill.name) : '')
    .filter(Boolean);
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean);
}

function normalizeBoundWorkflowPluginTools(values: unknown): Array<{ pluginId: string; toolName: string }> {
  if (!Array.isArray(values)) return [];
  const dedup = new Set<string>();
  return values.flatMap((value) => {
    if (!isRecord(value)) return [];
    const pluginId = stringValue(value.pluginId);
    const toolName = stringValue(value.toolName);
    if (!pluginId || !toolName) return [];
    const key = `${pluginId}:${toolName}`;
    if (dedup.has(key)) return [];
    dedup.add(key);
    return [{ pluginId, toolName }];
  });
}
