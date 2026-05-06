import { v4 as uuid } from 'uuid';
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, normalize, relative } from 'node:path';
import type { AgentConfig, AgentSession, AgentSessionStatus, AgentUsageDashboard, MessageTokenUsage } from '@agent-spaces/shared';
import { BUILT_IN_AGENT_TOOLS } from '@agent-spaces/shared';
import {
  listAgentSessions,
  getAgentSession,
  createAgentSession,
  updateAgentSession,
  deleteAgentSession,
  getAgentUsageDashboard,
  recordAgentUsage,
} from '../storage/agent-store.js';
import { getWorkspace, updateWorkspace } from '../storage/workspace-store.js';
import { listIssues, updateIssue } from '../storage/issue-store.js';
import { listChannels, updateChannel } from './channel.js';
import { ensureDir, getDataDir } from '../storage/json-store.js';
import { extractUsageFromOutput } from '../storage/usage.js';

const VALID_ROLES: AgentConfig['role'][] = ['scheduler', 'planner', 'executor', 'reviewer', 'commit', 'custom', 'bot'];
const VALID_RUNTIME_KINDS: NonNullable<AgentConfig['runtimeKind']>[] = ['open-agent-sdk', 'claude-code', 'codex'];
const VALID_TOOL_NAMES = new Set(BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
const ANTHROPIC_BRIDGE_PROVIDERS: Array<NonNullable<AgentConfig['modelProvider']>> = [
  'openai-responses-to-anthropic-messages',
  'openai-chat-completions-to-anthropic-messages',
];

type SkillInput = string | { name?: string; content?: string };
type McpConfig = Record<string, unknown>;

export interface AgentCompletionDetails {
  runtime?: string;
  model?: string;
  summary?: string;
  output?: string[];
  durationMs?: number;
  usage?: MessageTokenUsage;
  costUsd?: number;
}

export interface AgentConnectionTestResult {
  success: boolean;
  message: string;
  status?: number;
  debug: {
    provider?: string;
    apiBase?: string;
    requestUrl?: string;
    model?: string;
    hasApiKey: boolean;
    apiKeyPreview?: string;
    responseBody?: string;
  };
}

export function listPresets(workspaceId: string): AgentConfig[] | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;
  return ws.agents || [];
}

export function findEnabledPresetByRoleInMembers(
  workspaceId: string,
  memberIds: string[],
  role: AgentConfig['role'],
): AgentConfig | null {
  const members = new Set(memberIds);
  return (listPresets(workspaceId) ?? []).find(
    (agent) => members.has(agent.id) && agent.role === role && agent.enabled !== false,
  ) ?? null;
}

export function listTemplates(): AgentConfig[] {
  const root = getGlobalAgentTemplatesDir();
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readAgentTemplate(entry.name))
    .filter((template): template is AgentConfig => Boolean(template));
}

export function addTemplatesToWorkspace(workspaceId: string, templateIds: string[]): AgentConfig[] | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const existingIds = new Set((ws.agents || []).map((agent) => agent.id));
  const added: AgentConfig[] = [];

  for (const templateId of templateIds) {
    if (existingIds.has(templateId)) continue;
    const template = readAgentTemplate(templateId);
    if (!template) continue;

    const workspaceAgentDir = getWorkspaceAgentDir(ws.agentspaceDir, templateId);
    const preset: AgentConfig = {
      ...template,
      id: templateId,
      workingDir: workspaceAgentDir,
    };
    writeWorkspaceAgentCopy(preset, ws.agentspaceDir);
    ws.agents = [...(ws.agents || []), preset];
    existingIds.add(templateId);
    added.push(preset);
  }

  if (added.length > 0) {
    ws.updatedAt = new Date().toISOString();
    updateWorkspace(ws);
  }

  return added;
}

export async function testConnection(
  workspaceId: string,
  data: Partial<AgentConfig>,
): Promise<AgentConnectionTestResult | null> {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const apiBase = data.apiBase?.trim();
  const apiKey = data.apiKey?.trim();
  const model = data.modelId?.trim();
  const provider = data.modelProvider || inferProvider(apiBase);
  const debug: AgentConnectionTestResult['debug'] = {
    provider,
    apiBase,
    model,
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskApiKey(apiKey),
  };

  if (!apiBase) return { success: false, message: 'apiBase is required', debug };
  if (!apiKey) return { success: false, message: 'apiKey is required', debug };
  if (!model) return { success: false, message: 'modelId is required', debug };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const requestUrl = getConnectionTestUrl(provider, apiBase, model);
    debug.requestUrl = requestUrl;

    console.info('[agent:test-connection] request', debug);

    const response = await testProviderConnection(provider, requestUrl, apiKey, model, controller.signal);

    if (!response.ok) {
      const { message, body } = await readErrorMessage(response);
      debug.responseBody = body;
      console.warn('[agent:test-connection] failed', {
        ...debug,
        status: response.status,
        message,
      });
      return {
        success: false,
        status: response.status,
        message,
        debug,
      };
    }

    console.info('[agent:test-connection] succeeded', {
      ...debug,
      status: response.status,
    });

    return {
      success: true,
      status: response.status,
      message: 'Connection test succeeded',
      debug,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const resultMessage = message === 'This operation was aborted' ? 'Connection test timed out' : message;
    console.error('[agent:test-connection] error', {
      ...debug,
      message: resultMessage,
    });
    return {
      success: false,
      message: resultMessage,
      debug,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function testProviderConnection(
  provider: NonNullable<AgentConfig['modelProvider']>,
  requestUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  switch (provider) {
    case 'anthropic-messages':
      return testAnthropicMessagesConnection(requestUrl, apiKey, model, signal);
    case 'openai-responses':
    case 'openai-responses-to-anthropic-messages':
      return testOpenAIResponsesConnection(requestUrl, apiKey, model, signal);
    case 'openai-chat-completions-to-anthropic-messages':
      return testOpenAIChatCompletionsConnection(requestUrl, apiKey, model, signal);
    case 'gemini-generate-content':
      return testGeminiGenerateContentConnection(requestUrl, apiKey, signal);
    case 'openai-chat-completions':
      return testOpenAIChatCompletionsConnection(requestUrl, apiKey, model, signal);
  }
}

async function testOpenAIChatCompletionsConnection(
  requestUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 8,
      temperature: 0,
    }),
    signal,
  });
}

async function testOpenAIResponsesConnection(
  requestUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: 'Reply with OK.',
      max_output_tokens: 8,
      temperature: 0,
    }),
    signal,
  });
}

async function testAnthropicMessagesConnection(
  requestUrl: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(requestUrl, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 8,
      temperature: 0,
    }),
    signal,
  });
}

async function testGeminiGenerateContentConnection(
  requestUrl: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(requestUrl, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: 'Reply with OK.' }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 8,
      },
    }),
    signal,
  });
}

function inferProvider(apiBase?: string): NonNullable<AgentConfig['modelProvider']> {
  if (apiBase?.includes('anthropic.com')) return 'anthropic-messages';
  if (apiBase?.includes('generativelanguage.googleapis.com')) return 'gemini-generate-content';
  return 'openai-chat-completions';
}

function getConnectionTestUrl(
  provider: NonNullable<AgentConfig['modelProvider']>,
  apiBase: string,
  model: string,
): string {
  switch (provider) {
    case 'anthropic-messages':
      return getAnthropicMessagesUrl(apiBase);
    case 'openai-chat-completions':
    case 'openai-chat-completions-to-anthropic-messages':
      return joinUrl(apiBase, '/chat/completions');
    case 'openai-responses':
    case 'openai-responses-to-anthropic-messages':
      return joinUrl(apiBase, '/responses');
    case 'gemini-generate-content':
      return joinUrl(apiBase, `/models/${encodeURIComponent(model)}:generateContent`);
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function getAnthropicMessagesUrl(apiBase: string): string {
  try {
    const url = new URL(apiBase);
    if (url.hostname === 'api.anthropic.com' && !url.pathname.endsWith('/messages')) {
      return joinUrl(apiBase, '/messages');
    }
  } catch {
    // Fall through to using the user-provided value so the debug output exposes the bad URL.
  }
  return apiBase;
}

function maskApiKey(apiKey?: string): string | undefined {
  if (!apiKey) return undefined;
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}***`;
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

async function readErrorMessage(response: Response): Promise<{ message: string; body: string }> {
  const body = await response.text();
  if (!body) {
    return {
      message: `Connection test failed with status ${response.status}`,
      body: '',
    };
  }

  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const message =
      typeof json.error === 'string'
        ? json.error
        : json.error?.message || json.message || body;
    return { message, body: body.slice(0, 2000) };
  } catch {
    return { message: body, body: body.slice(0, 2000) };
  }
}

export function createPreset(
  workspaceId: string,
  data: Omit<Partial<AgentConfig>, 'id'>,
): AgentConfig | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const now = new Date().toISOString();
  const id = uuid();
  const workingDir = data.workingDir?.trim();
  const runtimeKind = data.runtimeKind && VALID_RUNTIME_KINDS.includes(data.runtimeKind)
    ? data.runtimeKind
    : 'open-agent-sdk';
  const requestedModelProvider = normalizeModelProvider(data.modelProvider);
  const presetRuntimeKind = isAnthropicBridgeProvider(requestedModelProvider) ? 'claude-code' : runtimeKind;
  const preset: AgentConfig = {
    id,
    name: data.name?.trim() || 'New Agent',
    role: data.role && VALID_ROLES.includes(data.role) ? data.role : 'executor',
    description: data.description || '',
    runtimeKind: presetRuntimeKind,
    modelProvider: requestedModelProvider,
    modelId: data.modelId || 'claude-sonnet-4-6',
    apiBase: data.apiBase || '',
    apiKey: data.apiKey || '',
    workingDir: workingDir || '',
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name)),
    systemPrompt: data.systemPrompt || '',
    temperature: data.temperature ?? 0.3,
    maxTokens: data.maxTokens ?? 4096,
    sandboxDirs: data.sandboxDirs,
    maxRetries: data.maxRetries,
    enabled: data.enabled ?? true,
  };

  writeAgentTemplate(preset, data.skills as SkillInput[] | undefined);
  if (!workingDir) writeWorkspaceAgentCopy(preset, ws.agentspaceDir);

  ws.agents = [...(ws.agents || []), preset];
  ws.updatedAt = now;
  updateWorkspace(ws);
  return preset;
}

export function updatePreset(
  workspaceId: string,
  presetId: string,
  data: Partial<AgentConfig>,
): AgentConfig | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const index = (ws.agents || []).findIndex((preset) => preset.id === presetId);
  if (index === -1) return null;

  const existing = ws.agents[index];
  const role = data.role && VALID_ROLES.includes(data.role) ? data.role : existing.role;
  const runtimeKind = data.runtimeKind && VALID_RUNTIME_KINDS.includes(data.runtimeKind)
    ? data.runtimeKind
    : existing.runtimeKind || 'open-agent-sdk';
  const requestedModelProvider = normalizeModelProvider(data.modelProvider);
  const updatedRuntimeKind = isAnthropicBridgeProvider(requestedModelProvider) ? 'claude-code' : runtimeKind;
  const updated: AgentConfig = {
    ...existing,
    ...data,
    id: existing.id,
    role,
    runtimeKind: updatedRuntimeKind,
    name: data.name?.trim() || existing.name || 'New Agent',
    modelProvider: requestedModelProvider,
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? existing.tools),
    enabled: data.enabled ?? existing.enabled ?? true,
  };
  writeAgentTemplate(updated, data.skills as SkillInput[] | undefined);

  ws.agents[index] = updated;
  ws.updatedAt = new Date().toISOString();
  updateWorkspace(ws);
  return updated;
}

export function getAllowedTools(mcps?: AgentConfig['mcps']): string[] | undefined {
  if (!mcps) return undefined;
  const servers = (mcps as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return undefined;
  return Object.keys(servers);
}

export function getMcpServers(mcps?: AgentConfig['mcps']): Record<string, unknown> | undefined {
  if (!mcps) return undefined;
  const servers = (mcps as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return undefined;
  return servers as Record<string, unknown>;
}

export function getAgentConfigDir(workspaceId: string, preset: AgentConfig): string | undefined {
  const ws = getWorkspace(workspaceId);
  if (!ws) return undefined;
  const workspaceAgentDir = getWorkspaceAgentDir(ws.agentspaceDir, preset.id);
  ensureWorkspaceAgentCopy(preset, ws.agentspaceDir);
  return workspaceAgentDir;
}

export function getAvailableSkillNames(agentDir: string | undefined, skills?: string[]): string[] {
  if (!agentDir || !Array.isArray(skills)) return [];
  return skills
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter((skill) => {
      if (!skill) return false;
      const skillFile = join(agentDir, 'skills', `${skill}.md`);
      return existsSync(skillFile) && statSync(skillFile).size > 0;
    });
}

export function resolveWorkingDir(workspaceId: string, preset: AgentConfig): string {
  const ws = getWorkspace(workspaceId);
  const mappedWorkingDir = resolveWorkspacePath(ws?.boundDirs, preset.workingDir);
  if (mappedWorkingDir) return mappedWorkingDir;

  if (!ws) return process.cwd();
  return ws.boundDirs[0] || process.cwd();
}

function resolveWorkspacePath(boundDirs: string[] | undefined, workingDir?: string): string | undefined {
  const raw = workingDir?.trim();
  if (!raw) return undefined;

  if (raw === '/workspace' || raw.startsWith('/workspace/')) {
    const root = boundDirs?.[0];
    if (!root) return undefined;
    const suffix = raw.slice('/workspace'.length).replace(/^\/+/, '');
    const mapped = suffix ? join(root, suffix) : root;
    return existsSync(mapped) ? mapped : root;
  }

  if (!isAbsolute(raw)) {
    const root = boundDirs?.[0];
    if (!root) return undefined;
    const mapped = join(root, raw);
    return existsSync(mapped) ? mapped : undefined;
  }

  if (existsSync(raw)) return raw;

  const root = boundDirs?.[0];
  if (!root) return undefined;
  const rootRelative = relative(normalize(root), normalize(raw));
  if (!rootRelative.startsWith('..') && rootRelative !== '') return root;
  return undefined;
}

function getGlobalAgentTemplateDir(agentId: string): string {
  return join(getGlobalAgentTemplatesDir(), agentId);
}

function getGlobalAgentTemplatesDir(): string {
  return join(getDataDir(), 'agent-templates');
}

function getWorkspaceAgentDir(agentspaceDir: string, agentId: string): string {
  return join(agentspaceDir, 'agents', agentId);
}

function normalizeMcpConfig(mcps?: AgentConfig['mcps']): McpConfig {
  if (!mcps) return {};
  return mcps;
}

function normalizeModelProvider(provider: AgentConfig['modelProvider'] | ''): AgentConfig['modelProvider'] {
  return provider || undefined;
}

function isAnthropicBridgeProvider(provider: AgentConfig['modelProvider']): boolean {
  return Boolean(provider && ANTHROPIC_BRIDGE_PROVIDERS.includes(provider));
}

function normalizeSkillNames(skills?: AgentConfig['skills'] | SkillInput[]): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => typeof skill === 'string' ? skill : skill.name)
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());
}

function normalizeToolNames(tools?: AgentConfig['tools']): AgentConfig['tools'] {
  if (!Array.isArray(tools)) return [];
  return tools.filter((name): name is NonNullable<AgentConfig['tools']>[number] => VALID_TOOL_NAMES.has(name));
}

function writeAgentTemplate(preset: AgentConfig, skillInputs?: SkillInput[]): void {
  const dir = getGlobalAgentTemplateDir(preset.id);
  const skillsDir = join(dir, 'skills');
  ensureDir(skillsDir);

  writeFileSync(join(dir, 'agent.json'), JSON.stringify(preset, null, 2), 'utf-8');
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(preset.mcps ?? {}, null, 2), 'utf-8');

  if (skillInputs?.some((skill) => typeof skill !== 'string')) {
    rmSync(skillsDir, { recursive: true, force: true });
    ensureDir(skillsDir);
    for (const skill of skillInputs) {
      if (typeof skill === 'string' || !skill.name?.trim()) continue;
      const filename = sanitizeMarkdownFilename(skill.name);
      writeFileSync(join(skillsDir, filename), skill.content ?? '', 'utf-8');
    }
  }
}

function copyAgentTemplateToWorkspace(agentId: string, agentspaceDir: string): void {
  const sourceDir = getGlobalAgentTemplateDir(agentId);
  const targetDir = getWorkspaceAgentDir(agentspaceDir, agentId);
  ensureDir(targetDir);

  if (!existsSync(sourceDir)) return;
  cpSync(sourceDir, targetDir, { recursive: true, force: true });

  const skillsDir = join(targetDir, 'skills');
  if (existsSync(skillsDir)) {
    const workspaceSkillsDir = join(agentspaceDir, 'skills');
    ensureDir(workspaceSkillsDir);
    for (const file of readdirSync(skillsDir)) {
      if (extname(file).toLowerCase() === '.md') {
        copyFileSync(join(skillsDir, file), join(workspaceSkillsDir, file));
      }
    }
  }
}

function writeWorkspaceAgentCopy(preset: AgentConfig, agentspaceDir: string): void {
  copyAgentTemplateToWorkspace(preset.id, agentspaceDir);
  const workspaceAgentDir = getWorkspaceAgentDir(agentspaceDir, preset.id);
  const workspacePreset: AgentConfig = {
    ...preset,
    workingDir: workspaceAgentDir,
  };
  ensureDir(workspaceAgentDir);
  writeFileSync(join(workspaceAgentDir, 'agent.json'), JSON.stringify(workspacePreset, null, 2), 'utf-8');
}

function ensureWorkspaceAgentCopy(preset: AgentConfig, agentspaceDir: string): void {
  const workspaceAgentDir = getWorkspaceAgentDir(agentspaceDir, preset.id);
  const requiredFiles = ['agent.json', 'mcp.json'];
  if (requiredFiles.every((file) => existsSync(join(workspaceAgentDir, file)))) return;
  writeWorkspaceAgentCopy(preset, agentspaceDir);
}

function readAgentTemplate(agentId: string): AgentConfig | null {
  const filePath = join(getGlobalAgentTemplateDir(agentId), 'agent.json');
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as AgentConfig;
  } catch {
    return null;
  }
}

function sanitizeMarkdownFilename(name: string): string {
  const raw = basename(name).replace(/\.md$/i, '');
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
  return `${safe}.md`;
}

export function deletePreset(workspaceId: string, presetId: string): boolean | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const before = (ws.agents || []).length;
  ws.agents = (ws.agents || []).filter((preset) => preset.id !== presetId);
  if (ws.agents.length === before) return false;

  ws.updatedAt = new Date().toISOString();
  updateWorkspace(ws);

  // Remove agent from all channels' members
  for (const ch of listChannels(workspaceId)) {
    if (ch.members.includes(presetId)) {
      updateChannel(workspaceId, ch.id, { members: ch.members.filter((m) => m !== presetId) });
    }
  }

  // Remove agent from all issues' members and assignedAgents
  for (const issue of listIssues(workspaceId)) {
    const membersChanged = issue.members.includes(presetId);
    const assignedChanged = issue.assignedAgents.includes(presetId);
    if (membersChanged || assignedChanged) {
      updateIssue({
        ...issue,
        members: membersChanged ? issue.members.filter((m) => m !== presetId) : issue.members,
        assignedAgents: assignedChanged ? issue.assignedAgents.filter((a) => a !== presetId) : issue.assignedAgents,
      });
    }
  }

  return true;
}

export function list(workspaceId: string): AgentSession[] {
  return listAgentSessions(workspaceId);
}

export function getById(workspaceId: string, sessionId: string): AgentSession | null {
  return getAgentSession(workspaceId, sessionId);
}

export function create(
  workspaceId: string,
  role: AgentSession['role'],
  configId?: string,
): AgentSession {
  const now = new Date().toISOString();
  const session: AgentSession = {
    id: uuid(),
    workspaceId,
    agentConfigId: configId || uuid(),
    role,
    status: 'idle',
    startedAt: now,
    lastActivityAt: now,
  };
  createAgentSession(session);
  return session;
}

export function getOrCreateSessionForConfig(
  workspaceId: string,
  config: AgentConfig,
): AgentSession {
  const existing = listAgentSessions(workspaceId).find(
    (session) =>
      session.agentConfigId === config.id &&
      session.role === config.role &&
      (session.status === 'idle' || session.status === 'completed' || session.status === 'crashed'),
  );
  if (!existing) return create(workspaceId, config.role, config.id);

  return updateStatus(workspaceId, existing.id, 'idle', {
    currentTaskId: undefined,
    error: undefined,
  }) ?? existing;
}

export function updateStatus(
  workspaceId: string,
  sessionId: string,
  status: AgentSessionStatus,
  extra?: Partial<AgentSession>,
): AgentSession | null {
  const session = getAgentSession(workspaceId, sessionId);
  if (!session) return null;

  session.status = status;
  session.lastActivityAt = new Date().toISOString();
  if (extra) Object.assign(session, extra);
  updateAgentSession(session);
  return session;
}

export function assignTask(
  workspaceId: string,
  sessionId: string,
  taskId: string,
): AgentSession | null {
  return updateStatus(workspaceId, sessionId, 'active', { currentTaskId: taskId });
}

export function complete(
  workspaceId: string,
  sessionId: string,
  error?: string,
  details?: AgentCompletionDetails,
): AgentSession | null {
  const session = updateStatus(workspaceId, sessionId, error ? 'crashed' : 'completed', {
    currentTaskId: undefined,
    error,
  });
  if (!session) return null;

  const usage = details?.usage ?? extractUsageFromOutput(details?.output ?? []);
  if (usage.totalTokens || usage.inputTokens || usage.outputTokens || usage.cachedInputTokens || usage.reasoningTokens) {
    recordAgentUsage({
      session,
      runtime: details?.runtime,
      model: details?.model,
      summary: details?.summary,
      durationMs: details?.durationMs,
      usage,
      costUsd: details?.costUsd,
    });
  }
  return session;
}

export function remove(workspaceId: string, sessionId: string): boolean {
  const session = getAgentSession(workspaceId, sessionId);
  if (!session) return false;
  deleteAgentSession(workspaceId, sessionId);
  return true;
}

export function findActiveByRole(
  workspaceId: string,
  role: AgentSession['role'],
): AgentSession | undefined {
  return listAgentSessions(workspaceId).find(
    (s) => s.role === role && (s.status === 'active' || s.status === 'idle'),
  );
}

export function usageDashboard(days?: number): AgentUsageDashboard {
  return getAgentUsageDashboard(days);
}
