import { randomUUID } from 'node:crypto';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile, deleteFile } from './json-store.js';
import path from 'node:path';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { BuiltInAgentToolName, WorkflowAgentTimelineItem, WorkflowAgentToolCall } from '@agent-spaces/shared';

export interface ChatAgent {
  id: string;
  name: string;
  role?: 'agent';
  runtimeKind?: 'langchain';
  avatar?: string;
  avatarUrl?: string;
  icon?: string;
  description?: string;
  systemPrompt?: string;
  modelProvider?: string;
  modelId?: string;
  providerId?: string;
  provider?: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  apiBase?: string;
  workingDir?: string;
  mcps?: Record<string, unknown>;
  skills?: Array<string | { name: string; content?: string }>;
  tools?: BuiltInAgentToolName[];
  boundWorkflowIds?: string[];
  boundWorkflowPluginTools?: Array<{ pluginId: string; toolName: string }>;
  outputStyle?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  thinking?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  toolCalls?: WorkflowAgentToolCall[];
  timeline?: WorkflowAgentTimelineItem[];
  metadata?: {
    systemPrompt?: string;
    fullPrompt?: string;
  };
}

export interface ChatWorkspace {
  id: string;
  name: string;
  agentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  agentId: string;
  title?: string;
  archived?: boolean;
  editorDirectoryTabs?: Array<{ id: string; path: string }>;
  activeEditorDirectoryTabId?: string;
  createdAt: string;
  updatedAt: string;
}

function chatDir(): string {
  return path.join(getDataDir(), 'chat');
}

function chatTemplatesDir(): string {
  return path.join(getDataDir(), 'chat-templates');
}

export function agentDir(agentId: string): string {
  return path.join(chatTemplatesDir(), agentId);
}

function agentFile(agentId: string): string {
  return path.join(agentDir(agentId), 'agent.json');
}

function mcpFile(agentId: string): string {
  return path.join(agentDir(agentId), 'mcp.json');
}

function skillsDir(agentId: string): string {
  return path.join(agentDir(agentId), 'skills');
}

export function chatSessionDir(chatId: string): string {
  return path.join(chatDir(), chatId);
}

export function chatWorkspaceDir(chatId: string): string {
  return path.join(chatSessionDir(chatId), 'workspaces');
}

function chatWorkspaceSkillsDir(chatId: string): string {
  return path.join(chatWorkspaceDir(chatId), 'skills');
}

export function messageHistoryDir(agentId: string): string {
  return chatSessionDir(agentId);
}

function messagesFile(chatId: string): string {
  return path.join(chatSessionDir(chatId), 'messages.json');
}

// --- Agent functions ---

export function listAgents(): ChatAgent[] {
  ensureDir(chatTemplatesDir());
  return readdirSync(chatTemplatesDir(), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => {
      const agent = readJsonFile<ChatAgent>(agentFile(entry.name));
      return agent ? [agent] : [];
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function saveAgent(agent: ChatAgent, skillInputs?: Array<string | { name: string; content?: string }>): void {
  const dir = agentDir(agent.id);
  ensureDir(dir);
  ensureDir(skillsDir(agent.id));
  ensureDir(chatWorkspaceDir(agent.id));
  ensureDir(chatWorkspaceSkillsDir(agent.id));
  const storedAgent = toStoredChatAgent(agent);
  writeJsonFile(agentFile(agent.id), storedAgent);
  writeJsonFile(mcpFile(agent.id), storedAgent.mcps ?? {});
  writeSkills(agent.id, skillInputs, agent.skills ?? []);
}

export function findAgent(id: string): ChatAgent | undefined {
  return readJsonFile<ChatAgent>(agentFile(id)) ?? undefined;
}

function toStoredChatAgent(agent: ChatAgent): ChatAgent {
  const {
    apiKey: _apiKey,
    baseURL: _baseURL,
    apiBase: _apiBase,
    provider: _provider,
    ...stored
  } = agent;
  void _apiKey;
  void _baseURL;
  void _apiBase;
  void _provider;
  return stored as ChatAgent;
}

export function deleteAgent(id: string): void {
  rmSync(agentDir(id), { recursive: true, force: true });
  rmSync(chatSessionDir(id), { recursive: true, force: true });
}

// --- Message functions ---

export function listMessages(agentId: string, limit?: number, before?: string): ChatMessage[] {
  ensureDir(chatSessionDir(agentId));
  let messages = readJsonFile<ChatMessage[]>(messagesFile(agentId)) ?? [];
  messages = messages.filter(msg => msg.agentId === agentId);

  // Sort descending by timestamp
  messages.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Cursor pagination: skip messages at or after 'before' timestamp
  if (before) {
    const idx = messages.findIndex(m => m.timestamp <= before);
    if (idx === -1) {
      messages = [];
    } else {
      messages = messages.slice(idx);
    }
  }

  // Apply limit
  if (limit && limit > 0) {
    messages = messages.slice(0, limit);
  }

  // Return ascending order
  messages.reverse();
  return messages;
}

export function saveMessage(msg: ChatMessage): void {
  const messages = readJsonFile<ChatMessage[]>(messagesFile(msg.agentId)) ?? [];
  messages.push(msg);
  writeJsonFile(messagesFile(msg.agentId), messages);
}

export function deleteMessagesByAgent(agentId: string): void {
  deleteFile(messagesFile(agentId));
}

export function getRecentMessages(agentId: string, limit: number = 50): ChatMessage[] {
  return listMessages(agentId, limit);
}

function writeSkills(
  agentId: string,
  skillInputs: Array<string | { name: string; content?: string }> | undefined,
  skillNames: Array<string | { name: string; content?: string }>,
): void {
  const dir = skillsDir(agentId);
  if (skillInputs?.some(skill => typeof skill !== 'string')) {
    rmSync(dir, { recursive: true, force: true });
    ensureDir(dir);
    for (const skill of skillInputs) {
      if (typeof skill === 'string' || !skill.name.trim()) continue;
      const filename = sanitizeMarkdownFilename(skill.name);
      const content = skill.content ?? readSkillContent(skill.name) ?? '';
      writeJsonSkillFile(path.join(dir, filename), content);
      writeJsonSkillFile(path.join(chatWorkspaceSkillsDir(agentId), filename), content);
    }
    return;
  }

  for (const name of skillNames.map(skill => typeof skill === 'string' ? skill : skill.name)) {
    const filename = sanitizeMarkdownFilename(name);
    const content = readSkillContent(name) ?? '';
    const filePath = path.join(dir, filename);
    if (content || !existsSync(filePath)) writeJsonSkillFile(filePath, content);
    const workspaceSkillPath = path.join(chatWorkspaceSkillsDir(agentId), filename);
    if (content || !existsSync(workspaceSkillPath)) writeJsonSkillFile(workspaceSkillPath, content);
  }
}

function writeJsonSkillFile(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, 'utf-8');
}

function sanitizeMarkdownFilename(name: string): string {
  const base = name.trim().replace(/[/\\:*?"<>|]+/g, '-');
  return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
}

function readSkillContent(name: string): string | undefined {
  const skillName = name.trim().replace(/\.md$/i, '');
  if (!skillName) return undefined;

  const candidates = [
    path.join(getDataDir(), 'skills', skillName, 'SKILL.md'),
    path.join(getDataDir(), 'skills', `${skillName}.md`),
    path.join(process.cwd(), 'skills', skillName, 'SKILL.md'),
    path.join(process.cwd(), 'skills', `${skillName}.md`),
  ];
  const source = candidates.find(file => existsSync(file));
  if (!source) return undefined;

  const content = readFileSync(source, 'utf-8');
  return content.trim() ? content : undefined;
}

// --- Workspace functions ---

function workspacesFile(): string {
  return path.join(chatDir(), 'workspaces.json');
}

export function workspaceDir(wsId: string): string {
  return path.join(chatDir(), 'workspaces', wsId);
}

function workspaceStateFile(wsId: string): string {
  return path.join(workspaceDir(wsId), 'state.json');
}

function sessionsFile(wsId: string): string {
  return path.join(workspaceDir(wsId), 'sessions.json');
}

function sessionDir(wsId: string, sessionId: string): string {
  return path.join(workspaceDir(wsId), 'sessions', sessionId);
}

function sessionMessagesFile(wsId: string, sessionId: string): string {
  return path.join(sessionDir(wsId, sessionId), 'messages.json');
}

export function listWorkspaces(): ChatWorkspace[] {
  ensureDir(chatDir());
  return readJsonFile<ChatWorkspace[]>(workspacesFile()) ?? [];
}

function saveWorkspaces(workspaces: ChatWorkspace[]): void {
  writeJsonFile(workspacesFile(), workspaces);
}

export function findWorkspace(id: string): ChatWorkspace | undefined {
  return listWorkspaces().find(ws => ws.id === id);
}

export function createWorkspace(data: { name: string; agentIds?: string[] }): ChatWorkspace {
  const workspaces = listWorkspaces();
  const ws: ChatWorkspace = {
    id: randomUUID(),
    name: data.name,
    agentIds: data.agentIds ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  workspaces.push(ws);
  saveWorkspaces(workspaces);
  ensureDir(workspaceDir(ws.id));
  return ws;
}

export function updateWorkspace(id: string, data: { name?: string; agentIds?: string[] }): ChatWorkspace | null {
  const workspaces = listWorkspaces();
  const idx = workspaces.findIndex(ws => ws.id === id);
  if (idx === -1) return null;
  workspaces[idx] = {
    ...workspaces[idx],
    ...(data.name !== undefined && { name: data.name }),
    ...(data.agentIds !== undefined && { agentIds: data.agentIds }),
    updatedAt: new Date().toISOString(),
  };
  saveWorkspaces(workspaces);
  return workspaces[idx];
}

export function deleteWorkspace(id: string): boolean {
  const workspaces = listWorkspaces();
  const idx = workspaces.findIndex(ws => ws.id === id);
  if (idx === -1) return false;
  workspaces.splice(idx, 1);
  saveWorkspaces(workspaces);
  rmSync(workspaceDir(id), { recursive: true, force: true });
  return true;
}

// --- Session functions ---

export function listSessions(workspaceId: string): ChatSession[] {
  const sessions = readJsonFile<ChatSession[]>(sessionsFile(workspaceId)) ?? [];
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findSession(workspaceId: string, sessionId: string): ChatSession | undefined {
  return listSessions(workspaceId).find(s => s.id === sessionId);
}

export function createSession(workspaceId: string, agentId: string): ChatSession | null {
  if (!findWorkspace(workspaceId)) return null;
  if (!findAgent(agentId)) return null;
  const sessions = readJsonFile<ChatSession[]>(sessionsFile(workspaceId)) ?? [];
  const session: ChatSession = {
    id: randomUUID(),
    workspaceId,
    agentId,
    title: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sessions.push(session);
  writeJsonFile(sessionsFile(workspaceId), sessions);
  ensureDir(sessionDir(workspaceId, session.id));
  return session;
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
  const sessions = readJsonFile<ChatSession[]>(sessionsFile(workspaceId)) ?? [];
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return null;
  sessions[idx] = {
    ...sessions[idx],
    ...(data.title !== undefined && { title: data.title }),
    ...(data.archived !== undefined && { archived: data.archived }),
    ...(data.editorDirectoryTabs !== undefined && { editorDirectoryTabs: data.editorDirectoryTabs }),
    ...(data.activeEditorDirectoryTabId !== undefined && { activeEditorDirectoryTabId: data.activeEditorDirectoryTabId }),
    updatedAt: new Date().toISOString(),
  };
  writeJsonFile(sessionsFile(workspaceId), sessions);
  return sessions[idx];
}

export function deleteSession(workspaceId: string, sessionId: string): boolean {
  const sessions = readJsonFile<ChatSession[]>(sessionsFile(workspaceId)) ?? [];
  const idx = sessions.findIndex(s => s.id === sessionId);
  if (idx === -1) return false;
  sessions.splice(idx, 1);
  writeJsonFile(sessionsFile(workspaceId), sessions);
  rmSync(sessionDir(workspaceId, sessionId), { recursive: true, force: true });
  return true;
}

// --- Session Message functions ---

export function listSessionMessages(workspaceId: string, sessionId: string): ChatMessage[] {
  const messages = readJsonFile<ChatMessage[]>(sessionMessagesFile(workspaceId, sessionId)) ?? [];
  messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return messages;
}

export function saveSessionMessage(workspaceId: string, sessionId: string, msg: ChatMessage): void {
  const messages = readJsonFile<ChatMessage[]>(sessionMessagesFile(workspaceId, sessionId)) ?? [];
  messages.push(msg);
  writeJsonFile(sessionMessagesFile(workspaceId, sessionId), messages);
}

export function clearSessionMessages(workspaceId: string, sessionId: string): void {
  deleteFile(sessionMessagesFile(workspaceId, sessionId));
}

export function getRecentSessionMessages(workspaceId: string, sessionId: string, limit: number = 50): ChatMessage[] {
  const messages = listSessionMessages(workspaceId, sessionId);
  return messages.slice(-limit);
}

// --- Workspace State ---

export interface WorkspaceTabState {
  openSessionTabIds: string[];
  openFileTabs: Array<{ path: string; agentId: string }>;
  activeTab: { type: 'session'; id: string } | { type: 'file'; id: string } | null;
}

export function getWorkspaceState(wsId: string): WorkspaceTabState {
  const state = readJsonFile<WorkspaceTabState>(workspaceStateFile(wsId));
  return state ?? { openSessionTabIds: [], openFileTabs: [], activeTab: null };
}

export function saveWorkspaceState(wsId: string, state: WorkspaceTabState): void {
  ensureDir(workspaceDir(wsId));
  writeJsonFile(workspaceStateFile(wsId), state);
}

// --- Migration ---

export function migrateToWorkspaces(): void {
  ensureDir(chatDir());
  const existing = readJsonFile<ChatWorkspace[]>(workspacesFile());
  if (existing && existing.length > 0) return;

  const agents = listAgents();
  const ws: ChatWorkspace = {
    id: randomUUID(),
    name: 'Default',
    agentIds: agents.map(a => a.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveWorkspaces([ws]);
  ensureDir(workspaceDir(ws.id));

  for (const agent of agents) {
    const oldMessages = readJsonFile<ChatMessage[]>(messagesFile(agent.id)) ?? [];
    if (oldMessages.length === 0) continue;

    const session: ChatSession = {
      id: randomUUID(),
      workspaceId: ws.id,
      agentId: agent.id,
      title: undefined,
      createdAt: oldMessages[0].timestamp,
      updatedAt: oldMessages[oldMessages.length - 1].timestamp,
    };

    const sessions = readJsonFile<ChatSession[]>(sessionsFile(ws.id)) ?? [];
    sessions.push(session);
    writeJsonFile(sessionsFile(ws.id), sessions);
    ensureDir(sessionDir(ws.id, session.id));
    writeJsonFile(sessionMessagesFile(ws.id, session.id), oldMessages);
  }
}
