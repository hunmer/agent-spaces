import { v4 as uuid } from 'uuid';
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, normalize, relative } from 'node:path';
import type {
  AgentConfig,
  AgentSession,
  AgentSessionStatus,
  AgentUsageDashboard,
  AgentUsageSessionDetail,
  AgentUsageSessionMessage,
  LLMProvider,
  Message,
  MessagePart,
  MessageTokenUsage,
  WorkflowAgentTimelineItem,
} from '@agent-spaces/shared';
import { BUILT_IN_AGENT_TOOLS } from '@agent-spaces/shared';
import {
  listAgentSessions,
  getAgentSession,
  getAgentSessionById,
  createAgentSession,
  updateAgentSession,
  deleteAgentSession,
  getAgentUsageDashboard,
  getLatestAgentUsageBySessionId,
  recordAgentUsage,
} from '../storage/agent-store.js';
import { getWorkspace, listWorkspaces } from '../storage/workspace-store.js';
import { listIssues, updateIssue } from '../storage/issue-store.js';
import { listChannels, updateChannel } from './channel.js';
import { ensureDir, getDataDir, readJsonFile, writeJsonFile } from '../storage/json-store.js';
import { listModels, listProviders } from '../storage/llm-store.js';
import { extractUsageFromOutput } from '../storage/usage.js';
import { getToolDetail } from './tool-detail.js';

const DEFAULT_AGENT_ROLE: AgentConfig['role'] = 'agent';
export const AGENT_GENERATOR_PRESET_ID = 'agent-generator';
export const AGENT_COMMIT_PRESET_ID = 'commit-agent';
export const AGENT_TITLE_GENERATOR_PRESET_ID = 'title-generator';
const BUILT_IN_AGENT_IDS = [
  AGENT_GENERATOR_PRESET_ID,
  AGENT_COMMIT_PRESET_ID,
  AGENT_TITLE_GENERATOR_PRESET_ID,
];
const VALID_RUNTIME_KINDS: NonNullable<AgentConfig['runtimeKind']>[] = ['open-agent-sdk', 'claude-code', 'codex', 'langchain', 'hermes', 'oh-my-pi'];
const VALID_TOOL_NAMES = new Set(BUILT_IN_AGENT_TOOLS.map((tool) => tool.name));
const CLAUDE_BUILT_IN_DIRS = ['agents', 'commands'] as const;
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
  forceRecord?: boolean;
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

export function listPresets(_workspaceId: string): AgentConfig[] {
  return listTemplates();
}

export function isValidRole(role: unknown): role is AgentConfig['role'] {
  return typeof role === 'string' && role.trim().length > 0;
}

export function listTemplates(): AgentConfig[] {
  const root = getGlobalAgentTemplatesDir();
  if (!existsSync(root)) return getDefaultBuiltInAgentPresets();

  const templates = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readAgentTemplate(entry.name))
    .filter((template): template is AgentConfig => Boolean(template));
  return withBuiltInTemplatesFirst(templates);
}

export async function testConnection(
  workspaceId: string,
  data: Partial<AgentConfig>,
): Promise<AgentConnectionTestResult | null> {
  if (workspaceId) {
    const ws = getWorkspace(workspaceId);
    if (!ws) return null;
  }

  const providerConfig = resolveProviderConfig(data);
  const apiBase = (providerConfig?.apiBase ?? data.apiBase)?.trim();
  const apiKey = (providerConfig?.apiKey ?? data.apiKey)?.trim();
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
  _workspaceId: string,
  data: Omit<Partial<AgentConfig>, 'id'>,
): AgentConfig | null {
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
    role: isValidRole(data.role) ? data.role.trim() : DEFAULT_AGENT_ROLE,
    description: data.description || '',
    runtimeKind: presetRuntimeKind,
    modelProvider: requestedModelProvider,
    providerId: resolveProviderId(data),
    modelId: data.modelId || 'claude-sonnet-4-6',
    workingDir: workingDir || '',
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name)),
    systemPrompt: data.systemPrompt || '',
    outputStyle: data.outputStyle,
    suggestions: data.suggestions,
    temperature: data.temperature ?? 0.3,
    maxTokens: data.maxTokens ?? 4096,
    avatarUrl: data.avatarUrl,
    icon: data.icon,
    sandboxDirs: data.sandboxDirs,
    maxRetries: data.maxRetries,
    templateId: data.templateId,
    enabled: data.enabled ?? true,
  };

  writeAgentTemplate(preset, data.skills as SkillInput[] | undefined);

  return hydrateAgentProvider(preset);
}

export function updatePreset(
  _workspaceId: string,
  presetId: string,
  data: Partial<AgentConfig>,
): AgentConfig | null {
  const existing = readAgentTemplate(presetId);
  if (!existing) return null;

  const role = isValidRole(data.role) ? data.role.trim() : existing.role;
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
    providerId: resolveProviderId(data) || existing.providerId,
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? existing.tools),
    enabled: data.enabled ?? existing.enabled ?? true,
  };
  writeAgentTemplate(updated, data.skills as SkillInput[] | undefined);
  return hydrateAgentProvider(updated);
}

export function getAllowedTools(mcps?: AgentConfig['mcps']): string[] | undefined {
  const servers = getMcpServers(mcps);
  return servers ? Object.keys(servers) : undefined;
}

export function getMcpServers(mcps?: AgentConfig['mcps']): Record<string, unknown> | undefined {
  if (!mcps) return undefined;
  const servers = (mcps as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return undefined;
  const resolved = Object.fromEntries(
    Object.entries(servers).flatMap(([name, server]) => {
      const config = getRunnableMcpServerConfig(server) ?? readStoredMcpServerConfig(name);
      return config ? [[name, config]] : [];
    }),
  );
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

export function getAgentConfigDir(workspaceId: string, preset: AgentConfig): string | undefined {
  const ws = getWorkspace(workspaceId);
  if (!ws) return undefined;
  const workspaceAgentDir = getWorkspaceAgentDir(ws.agentspaceDir, preset.id);
  ensureWorkspaceAgentCopy(preset, ws.agentspaceDir);
  return workspaceAgentDir;
}

export function syncTemplatesToAllWorkspaces(): { workspaces: number; agents: number } {
  const templates = listTemplates().filter((template) => existsSync(getGlobalAgentTemplateDir(template.id)));
  const workspaces = listWorkspaces();
  let agents = 0;

  for (const workspace of workspaces) {
    if (!workspace.agentspaceDir) continue;
    for (const template of templates) {
      writeWorkspaceAgentCopy(template, workspace.agentspaceDir);
      agents++;
    }
  }

  return { workspaces: workspaces.length, agents };
}

export function getAvailableSkillNames(agentDir: string | undefined, skills?: unknown): string[] {
  if (!agentDir || !Array.isArray(skills)) return [];
  return normalizeSkillNames(skills)
    .map((skill) => skill.replace(/\.md$/i, ''))
    .filter((skill) => {
      if (!skill) return false;
      const skillsBase = join(agentDir, 'skills');
      if (hasReadableSkillSource(skillsBase, skill)) return true;

      const globalSkillFile = join(getDataDir(), 'skills', skill, 'SKILL.md');
      if (existsSync(globalSkillFile) && statSync(globalSkillFile).size > 0) return true;

      const globalLegacySkillFile = join(getDataDir(), 'skills', `${skill}.md`);
      return existsSync(globalLegacySkillFile) && statSync(globalLegacySkillFile).size > 0;
    });
}

export function resolveWorkingDir(workspaceId: string, preset: AgentConfig): string {
  const ws = getWorkspace(workspaceId);
  const mappedWorkingDir = resolveWorkspacePath(ws?.boundDirs, preset.workingDir);
  if (mappedWorkingDir) return mappedWorkingDir;

  const userDir = homedir();
  if (!ws) return userDir;
  return ws.boundDirs[0] || userDir;
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

function getRunnableMcpServerConfig(server: unknown): Record<string, unknown> | null {
  if (!server || typeof server !== 'object' || Array.isArray(server)) return null;
  const record = server as Record<string, unknown>;
  if (typeof record.command === 'string' && record.command.trim()) return record;
  if (typeof record.url === 'string' && record.url.trim()) return record;
  return null;
}

function readStoredMcpServerConfig(name: string): Record<string, unknown> | null {
  const filePath = join(getDataDir(), 'mcps', `${sanitizeMcpName(name)}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as { config?: unknown };
    return getRunnableMcpServerConfig(parsed.config);
  } catch {
    return null;
  }
}

function sanitizeMcpName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mcp-server';
}

function normalizeModelProvider(provider: AgentConfig['modelProvider'] | ''): AgentConfig['modelProvider'] {
  return provider || undefined;
}

function isAnthropicBridgeProvider(provider: AgentConfig['modelProvider']): boolean {
  return Boolean(provider && ANTHROPIC_BRIDGE_PROVIDERS.includes(provider));
}

function normalizeSkillNames(skills?: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => {
      if (typeof skill === 'string') return skill;
      if (skill && typeof skill === 'object' && 'name' in skill && typeof skill.name === 'string') return skill.name;
      return '';
    })
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());
}

function normalizeToolNames(tools?: AgentConfig['tools']): AgentConfig['tools'] {
  if (!Array.isArray(tools)) return [];
  return tools.filter((name): name is NonNullable<AgentConfig['tools']>[number] => VALID_TOOL_NAMES.has(name));
}

function resolveProviderConfig(data: Partial<AgentConfig>): LLMProvider | undefined {
  const providers = listProviders();
  if (data.providerId) {
    const byId = providers.find((provider) => provider.id === data.providerId);
    if (byId) return byId;
  }

  const apiBase = data.apiBase?.trim();
  const apiKey = data.apiKey?.trim();
  if (apiBase || apiKey) {
    return providers.find((provider) =>
      (!apiBase || provider.apiBase === apiBase)
      && (!apiKey || provider.apiKey === apiKey),
    );
  }

  return undefined;
}

function resolveProviderId(data: Partial<AgentConfig>): string | undefined {
  return data.providerId || resolveProviderConfig(data)?.id;
}

function hydrateAgentProvider(preset: AgentConfig): AgentConfig {
  const provider = resolveProviderConfig(preset);
  if (!provider) return preset;
  return {
    ...preset,
    providerId: provider.id,
    apiBase: provider.apiBase,
    apiKey: provider.apiKey,
  };
}

function toStoredAgentTemplate(preset: AgentConfig): AgentConfig {
  const {
    apiBase: _apiBase,
    apiKey: _apiKey,
    provider: _provider,
    baseURL: _baseURL,
    model: _model,
    ...stored
  } = preset as AgentConfig & { provider?: unknown; baseURL?: unknown; model?: unknown };
  void _apiBase;
  void _apiKey;
  void _provider;
  void _baseURL;
  void _model;
  return stored;
}

function writeAgentTemplate(preset: AgentConfig, skillInputs?: SkillInput[]): void {
  const dir = getGlobalAgentTemplateDir(preset.id);
  const skillsDir = join(dir, 'skills');
  ensureDir(skillsDir);

  const storedPreset = toStoredAgentTemplate(preset);
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(storedPreset, null, 2), 'utf-8');
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify(storedPreset.mcps ?? {}, null, 2), 'utf-8');

  const hasObjectSkills = skillInputs?.some((skill) => typeof skill !== 'string');
  console.log('[writeAgentTemplate]', {
    agentId: preset.id,
    skillsCount: preset.skills?.length ?? 0,
    skills: preset.skills,
    hasObjectSkills,
    skillInputTypes: skillInputs?.map((s) => typeof s),
  });

  if (hasObjectSkills) {
    rmSync(skillsDir, { recursive: true, force: true });
    ensureDir(skillsDir);
    for (const skill of skillInputs!) {
      if (typeof skill === 'string' || !skill.name?.trim()) continue;
      const filename = sanitizeMarkdownFilename(skill.name);
      writeFileSync(join(skillsDir, filename), skill.content ?? '', 'utf-8');
    }
  } else if (preset.skills?.length) {
    const skillNames = normalizeSkillNames(preset.skills);
    const globalSkillsDir = join(getDataDir(), 'skills');
    const keepFiles = new Set(skillNames.map((s) => s.endsWith('.md') ? s : `${s}.md`));
    const keepNames = new Set(skillNames.map((s) => s.replace(/\.md$/i, '')));
    // Remove skill entries no longer in the list (flat .md files and folders)
    if (existsSync(skillsDir)) {
      for (const existing of readdirSync(skillsDir)) {
        const name = existing.endsWith('.md') ? existing.replace(/\.md$/i, '') : existing;
        if (!keepNames.has(name)) {
          rmSync(join(skillsDir, existing), { recursive: true, force: true });
          console.log('[writeAgentTemplate] removed stale skill:', existing);
        }
      }
    }
    // Copy / ensure skill files (global skills are folders: skills/{name}/SKILL.md)
    for (const skillName of keepNames) {
      const globalFolder = join(globalSkillsDir, skillName);
      const flatTarget = join(skillsDir, `${skillName}.md`);
      const folderTarget = join(skillsDir, skillName);
      console.log('[writeAgentTemplate] skill:', skillName, 'globalFolder:', globalFolder, 'globalExists:', existsSync(globalFolder) && statSync(globalFolder).isDirectory());
      if (existsSync(globalFolder) && statSync(globalFolder).isDirectory()) {
        // Copy entire skill folder
        if (existsSync(folderTarget)) {
          rmSync(folderTarget, { recursive: true, force: true });
        }
        cpSync(globalFolder, folderTarget, { recursive: true, force: true });
        // Remove stale flat .md if it exists
        if (existsSync(flatTarget)) {
          rmSync(flatTarget, { force: true });
        }
      } else {
        // Fallback: single SKILL.md or legacy flat file
        const globalSkillFile = join(globalFolder, 'SKILL.md');
        if (existsSync(globalSkillFile)) {
          copyFileSync(globalSkillFile, flatTarget);
        } else if (!existsSync(flatTarget) && !existsSync(folderTarget)) {
          writeFileSync(flatTarget, '', 'utf-8');
        }
      }
    }
  } else {
    // No skills — clean skills dir
    if (existsSync(skillsDir)) {
      for (const existing of readdirSync(skillsDir)) {
        if (existing.endsWith('.md')) {
          rmSync(join(skillsDir, existing), { force: true });
        }
      }
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
    for (const entry of readdirSync(skillsDir)) {
      const source = join(skillsDir, entry);
      const sourceStat = statSync(source);
      if (sourceStat.isDirectory()) {
        cpSync(source, join(workspaceSkillsDir, entry), { recursive: true, force: true });
      } else if (sourceStat.isFile() && extname(entry).toLowerCase() === '.md') {
        copyFileSync(source, join(workspaceSkillsDir, entry));
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
  writeFileSync(join(workspaceAgentDir, 'agent.json'), JSON.stringify(toStoredAgentTemplate(workspacePreset), null, 2), 'utf-8');
}

function ensureWorkspaceAgentCopy(preset: AgentConfig, agentspaceDir: string): void {
  const workspaceAgentDir = getWorkspaceAgentDir(agentspaceDir, preset.id);
  const requiredFiles = ['agent.json', 'mcp.json'];
  const sourceDir = getGlobalAgentTemplateDir(preset.id);
  const missingRequiredFile = requiredFiles.some((file) => !existsSync(join(workspaceAgentDir, file)));
  const missingBuiltInDir = CLAUDE_BUILT_IN_DIRS.some((dir) => {
    const sourceBuiltInDir = join(sourceDir, dir);
    const targetBuiltInDir = join(workspaceAgentDir, dir);
    return existsSync(sourceBuiltInDir)
      && statSync(sourceBuiltInDir).isDirectory()
      && countFiles(sourceBuiltInDir) > countFiles(targetBuiltInDir);
  });
  const missingSkill = normalizeSkillNames(preset.skills).some((skill) => {
    const skillName = skill.replace(/\.md$/i, '');
    const targetSkillsDir = join(workspaceAgentDir, 'skills');
    return !hasReadableSkillSource(targetSkillsDir, skillName);
  });
  if (!missingRequiredFile && !missingBuiltInDir && !missingSkill) return;
  writeWorkspaceAgentCopy(preset, agentspaceDir);
}

function hasReadableSkillSource(skillsDir: string, skillName: string): boolean {
  const skillDir = join(skillsDir, skillName);
  const skillFile = join(skillDir, 'SKILL.md');
  if (existsSync(skillDir) && statSync(skillDir).isDirectory()) {
    return existsSync(skillFile) && statSync(skillFile).size > 0;
  }

  const legacySkillFile = join(skillsDir, `${skillName}.md`);
  return existsSync(legacySkillFile) && statSync(legacySkillFile).size > 0;
}

function countFiles(dir: string): number {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return 0;
  return readdirSync(dir, { withFileTypes: true }).reduce((count, entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return count + countFiles(fullPath);
    return entry.isFile() ? count + 1 : count;
  }, 0);
}

export function readAgentTemplate(agentId: string): AgentConfig | null {
  const filePath = join(getGlobalAgentTemplateDir(agentId), 'agent.json');
  if (!existsSync(filePath)) {
    return getDefaultBuiltInAgentPreset(agentId);
  }
  try {
    return hydrateAgentProvider(JSON.parse(readFileSync(filePath, 'utf-8')) as AgentConfig);
  } catch {
    return getDefaultBuiltInAgentPreset(agentId);
  }
}

function getDefaultBuiltInAgentPresets(): AgentConfig[] {
  return [
    getDefaultAgentGeneratorPreset(),
    getDefaultCommitAgentPreset(),
    getDefaultTitleGeneratorPreset(),
  ];
}

function getDefaultBuiltInAgentPreset(agentId: string): AgentConfig | null {
  if (agentId === AGENT_GENERATOR_PRESET_ID) return getDefaultAgentGeneratorPreset();
  if (agentId === AGENT_COMMIT_PRESET_ID) return getDefaultCommitAgentPreset();
  if (agentId === AGENT_TITLE_GENERATOR_PRESET_ID) return getDefaultTitleGeneratorPreset();
  return null;
}

function withBuiltInTemplatesFirst(templates: AgentConfig[]): AgentConfig[] {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const builtIns = getDefaultBuiltInAgentPresets().map((preset) => byId.get(preset.id) ?? preset);
  const custom = templates.filter((template) => !BUILT_IN_AGENT_IDS.includes(template.id));
  return [...builtIns, ...custom];
}

interface BuiltInDefaultModel {
  modelProvider?: AgentConfig['modelProvider'];
  providerId: string;
  modelId: string;
  apiBase: string;
  apiKey: string;
}

function resolveGlobalDefaultModel(): BuiltInDefaultModel | null {
  const providers = listProviders();
  if (providers.length === 0) return null;
  const models = listModels();
  for (const model of models) {
    const provider = providers.find((entry) => entry.name === model.provider);
    if (provider?.apiBase && provider?.apiKey && model.modelId) {
      return {
        modelProvider: inferBuiltInModelProvider(provider.apiBase),
        providerId: provider.id,
        modelId: model.modelId,
        apiBase: provider.apiBase,
        apiKey: provider.apiKey,
      };
    }
  }
  return null;
}

function inferBuiltInModelProvider(apiBase: string): NonNullable<AgentConfig['modelProvider']> {
  if (apiBase.includes('anthropic')) return 'anthropic-messages';
  if (apiBase.includes('generativelanguage.googleapis.com')) return 'gemini-generate-content';
  return 'openai-chat-completions';
}

// Seed built-in presets to disk on startup so agent-generator/commit-agent/title-generator are
// first-class members of the agents list. Presets missing model settings inherit the first
// fully-configured global provider+model, so agent generation works out of the box.
export function ensureBuiltInAgentTemplates(): { seeded: string[]; defaultModel: BuiltInDefaultModel | null } {
  const defaultModel = resolveGlobalDefaultModel();
  const seeded: string[] = [];

  for (const preset of getDefaultBuiltInAgentPresets()) {
    const dir = getGlobalAgentTemplateDir(preset.id);
    if (existsSync(join(dir, 'agent.json'))) continue;

    const resolved = defaultModel && !(preset.apiBase && preset.apiKey && preset.modelId)
      ? { ...preset, ...defaultModel }
      : preset;
    ensureDir(dir);
    writeFileSync(join(dir, 'agent.json'), JSON.stringify(toStoredAgentTemplate(resolved), null, 2), 'utf-8');
    if (!existsSync(join(dir, 'mcp.json'))) {
      writeFileSync(join(dir, 'mcp.json'), JSON.stringify(resolved.mcps ?? {}, null, 2), 'utf-8');
    }
    seeded.push(preset.id);
  }

  if (seeded.length > 0) {
    console.info('[agent] seeded built-in agent templates', {
      seeded,
      defaultModel: defaultModel ? { providerId: defaultModel.providerId, modelId: defaultModel.modelId, apiBase: defaultModel.apiBase } : null,
    });
  }
  return { seeded, defaultModel };
}

function getDefaultAgentGeneratorPreset(): AgentConfig {
  return {
    id: AGENT_GENERATOR_PRESET_ID,
    name: 'Agent Generator',
    role: 'agent',
    description: '根据提示词生成其他 Agent 的名称、描述和 Markdown 系统提示。',
    runtimeKind: 'claude-code',
    modelProvider: undefined,
    modelId: '',
    apiBase: '',
    apiKey: '',
    workingDir: '',
    mcps: {},
    skills: [],
    tools: [],
    systemPrompt: [
      '# Role',
      'You are an Agent Spaces agent designer.',
      '',
      '# Responsibilities',
      '- Convert user requirements into production-ready Agent preset metadata.',
      '- Return only valid JSON with name, description, and systemPrompt.',
      '- Write the systemPrompt in clear Markdown with role, responsibilities, workflow, constraints, and output expectations.',
      '',
      '# Constraints',
      '- Do not include Markdown code fences around JSON.',
      '- Keep names concise and descriptions practical.',
    ].join('\n'),
    temperature: 0.2,
    maxTokens: 4096,
    enabled: true,
  };
}

export function getDefaultCommitAgentPreset(): AgentConfig {
  return {
    id: AGENT_COMMIT_PRESET_ID,
    name: 'Commit Agent',
    role: 'commit',
    description: '根据 git diff 自动生成 conventional commit message。',
    runtimeKind: 'claude-code',
    modelProvider: undefined,
    modelId: '',
    apiBase: '',
    apiKey: '',
    workingDir: '',
    mcps: {},
    skills: [],
    tools: [],
    systemPrompt: [
      'You are a git commit message generator.',
      'Return exactly one concise commit message for the provided git diff.',
      'Use conventional format: type: description.',
      'Allowed types: feat, fix, docs, style, refactor, perf, test, chore.',
      'Keep the subject under 72 characters.',
      'If a body is needed, add one blank line and at most 3 short bullet lines.',
      'Do not greet, explain, ask questions, provide options, use markdown, or wrap in code fences.',
      'Output only the final commit message text.',
    ].join(' '),
    temperature: 0,
    maxTokens: 512,
    enabled: true,
  };
}

export function getDefaultTitleGeneratorPreset(): AgentConfig {
  return {
    id: AGENT_TITLE_GENERATOR_PRESET_ID,
    name: 'Title Generator',
    role: 'agent',
    description: 'Generate short titles for channels and issues from user requirements.',
    runtimeKind: 'claude-code',
    modelProvider: undefined,
    modelId: '',
    apiBase: '',
    apiKey: '',
    workingDir: '',
    mcps: {},
    skills: [],
    tools: [],
    systemPrompt: [
      'You generate objective scene titles for Agent Spaces channels and issues.',
      'Return exactly one title and nothing else.',
      'The title must describe the scenario, task, or intent objectively.',
      'Do not include a speaking subject, assistant identity, user identity, first-person wording, second-person wording, greetings, replies, questions, or conversational text.',
      'For Chinese, prefer a short noun phrase ending with 场景, 任务, 问题, 需求, 讨论, or 分析 when appropriate.',
      'Examples: user says "你好" -> "打招呼场景"; user says "帮我修复登录报错" -> "登录报错修复"; user says "分析这段代码" -> "代码分析任务".',
      'Use the same language as the user request when it is clear.',
      'Keep the title under 20 Chinese characters or under 8 English words.',
      'Do not use quotes, markdown, punctuation-only endings, prefixes, explanations, or multiple options.',
    ].join(' '),
    temperature: 0.2,
    maxTokens: 64,
    enabled: true,
  };
}

function sanitizeMarkdownFilename(name: string): string {
  const raw = basename(name).replace(/\.md$/i, '');
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'skill';
  return `${safe}.md`;
}

export function deletePreset(workspaceId: string, presetId: string): boolean | null {
  if (BUILT_IN_AGENT_IDS.includes(presetId)) return false;

  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const template = readAgentTemplate(presetId);
  if (!template) return false;

  // Delete global template
  const templateDir = getGlobalAgentTemplateDir(presetId);
  if (existsSync(templateDir)) rmSync(templateDir, { recursive: true, force: true });

  // Remove agent from all channels' members
  for (const ch of listChannels(workspaceId)) {
    if (ch.members.includes(presetId)) {
      updateChannel(workspaceId, ch.id, { members: ch.members.filter((m) => m !== presetId) });
    }
  }

  // Remove agent from all issues' members
  for (const issue of listIssues(workspaceId)) {
    const membersChanged = issue.members.includes(presetId);
    if (membersChanged) {
      updateIssue({
        ...issue,
        members: issue.members.filter((m) => m !== presetId),
      });
    }
  }

  return true;
}

export function createGlobalPreset(data: Omit<Partial<AgentConfig>, 'id'>): AgentConfig {
  const id = uuid();
  const runtimeKind = data.runtimeKind && VALID_RUNTIME_KINDS.includes(data.runtimeKind)
    ? data.runtimeKind
    : 'open-agent-sdk';
  const requestedModelProvider = normalizeModelProvider(data.modelProvider);
  const presetRuntimeKind = isAnthropicBridgeProvider(requestedModelProvider) ? 'claude-code' : runtimeKind;

  const preset: AgentConfig = {
    id,
    name: data.name?.trim() || 'New Agent',
    role: isValidRole(data.role) ? data.role.trim() : DEFAULT_AGENT_ROLE,
    description: data.description || '',
    runtimeKind: presetRuntimeKind,
    modelProvider: requestedModelProvider,
    providerId: resolveProviderId(data),
    modelId: data.modelId || 'claude-sonnet-4-6',
    workingDir: '',
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? BUILT_IN_AGENT_TOOLS.map((tool) => tool.name)),
    systemPrompt: data.systemPrompt || '',
    temperature: data.temperature ?? 0.3,
    maxTokens: data.maxTokens ?? 4096,
    sandboxDirs: data.sandboxDirs,
    maxRetries: data.maxRetries,
    templateId: data.templateId,
    enabled: data.enabled ?? true,
  };

  writeAgentTemplate(preset, data.skills as SkillInput[] | undefined);
  return hydrateAgentProvider(preset);
}

export function updateGlobalPreset(presetId: string, data: Partial<AgentConfig>): AgentConfig | null {
  const existing = readAgentTemplate(presetId);
  if (!existing) return null;

  const role = isValidRole(data.role) ? data.role.trim() : existing.role;
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
    providerId: resolveProviderId(data) || existing.providerId,
    mcps: normalizeMcpConfig(data.mcps),
    skills: normalizeSkillNames(data.skills),
    tools: normalizeToolNames(data.tools ?? existing.tools),
    enabled: data.enabled ?? existing.enabled ?? true,
  };

  writeAgentTemplate(updated, data.skills as SkillInput[] | undefined);
  return hydrateAgentProvider(updated);
}

export function deleteGlobalPreset(presetId: string): boolean {
  if (BUILT_IN_AGENT_IDS.includes(presetId)) return false;

  const templateDir = getGlobalAgentTemplateDir(presetId);
  if (!existsSync(templateDir)) return false;

  rmSync(templateDir, { recursive: true, force: true });
  return true;
}

export function listGlobalPresets(): AgentConfig[] {
  return listTemplates();
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
  if (
    details?.forceRecord
    || usage.totalTokens
    || usage.inputTokens
    || usage.outputTokens
    || usage.cachedInputTokens
    || usage.reasoningTokens
  ) {
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

export function getSessionDetail(agentSessionId: string): AgentUsageSessionDetail | null {
  const session = getAgentSessionById(agentSessionId);
  const usage = getLatestAgentUsageBySessionId(agentSessionId);
  const workspaceId = session?.workspaceId ?? usage?.workspaceId;
  const cliHistoryPath = join(getDataDir(), 'cli_history', `${agentSessionId}.json`);
  const rawSession = existsSync(cliHistoryPath)
    ? JSON.parse(readFileSync(cliHistoryPath, 'utf-8'))
    : undefined;
  if (!session && !usage && rawSession === undefined) return null;
  const messages = workspaceId ? listSessionDetailMessages(workspaceId, agentSessionId) : [];

  return {
    session,
    usage,
    messages,
    source: messages.length > 0 ? 'channel' : rawSession ? 'cli_history' : 'none',
    cliHistoryPath: rawSession ? cliHistoryPath : undefined,
    rawSession,
  };
}

export function persistSessionCliHistory(agentSessionId: string): void {
  const detail = getSessionDetail(agentSessionId);
  if (!detail) return;
  const cliHistoryDir = join(getDataDir(), 'cli_history');
  ensureDir(cliHistoryDir);
  writeJsonFile(join(cliHistoryDir, `${agentSessionId}.json`), {
    session: detail.session,
    usage: detail.usage,
    messages: detail.messages,
    generatedAt: new Date().toISOString(),
  });
}

function listSessionDetailMessages(workspaceId: string, agentSessionId: string): AgentUsageSessionMessage[] {
  const channels = listChannels(workspaceId);
  const items: AgentUsageSessionMessage[] = [];

  for (const channel of channels) {
    const path = join(getDataDir(), 'workspaces', workspaceId, 'channels', channel.id, 'messages.json');
    const messages = readJsonFile<Message[]>(path) ?? [];
    for (const message of messages) {
      const mapped = mapSessionDetailMessage(workspaceId, channel.id, channel.name, message, agentSessionId);
      if (mapped) items.push(mapped);
      for (const reply of message.replies ?? []) {
        const replyMessage: Message = {
          ...message,
          id: reply.id,
          senderId: reply.senderId,
          senderRole: reply.senderRole,
          content: reply.content,
          status: reply.status,
          attachments: reply.attachments,
          parts: reply.parts,
          metadata: reply.metadata,
          createdAt: reply.createdAt,
          replies: undefined,
        };
        const mappedReply = mapSessionDetailMessage(workspaceId, channel.id, channel.name, replyMessage, agentSessionId);
        if (mappedReply) items.push(mappedReply);
      }
    }
  }

  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mapSessionDetailMessage(
  workspaceId: string,
  channelId: string,
  channelName: string,
  message: Message,
  agentSessionId: string,
): AgentUsageSessionMessage | null {
  if (message.metadata?.agentSessionId !== agentSessionId) return null;
  const contextPart = message.parts?.find((part): part is Extract<MessagePart, { type: 'context' }> => part.type === 'context');
  return {
    id: message.id,
    role: message.senderId === 'user' ? 'user' : 'agent',
    content: message.content,
    createdAt: message.createdAt,
    senderId: message.senderId,
    senderRole: message.senderRole,
    metadata: message.metadata,
    parts: message.parts,
    contextPart,
    timeline: buildSessionMessageTimeline(workspaceId, channelId, message),
    sourceChannelId: channelId,
    sourceChannelName: channelName,
  };
}

function buildSessionMessageTimeline(
  workspaceId: string,
  channelId: string,
  message: Message,
): WorkflowAgentTimelineItem[] {
  const timeline: WorkflowAgentTimelineItem[] = [];

  for (const part of message.parts ?? []) {
    if (part.type === 'reasoning' && part.text.trim()) {
      timeline.push({ id: part.id, type: 'thinking', content: part.text });
      continue;
    }
    if (part.type === 'chain') {
      for (const chain of part.chains) {
        if (chain.kind === 'message' && chain.text?.trim()) {
          timeline.push({ id: chain.id, type: 'message', content: chain.text });
          continue;
        }
        if (chain.kind === 'tool') {
          const detail = chain.detailId
            ? getToolDetail(workspaceId, channelId, message.id, chain.detailId)
            : null;
          timeline.push({
            id: detail?.id ?? chain.id,
            type: 'tool',
            name: chain.toolName ?? chain.title,
            input: detail?.input,
            result: detail?.output,
            status: detail?.output === undefined ? 'running' : 'success',
          });
        }
      }
      continue;
    }
    if (part.type === 'terminal' && part.output.trim()) {
      timeline.push({ id: part.id, type: 'message', content: part.output });
      continue;
    }
    if (part.type === 'error' && part.message.trim()) {
      timeline.push({ id: part.id, type: 'message', content: part.message });
      continue;
    }
    if (part.type === 'subagent') {
      const lines = [
        part.instructions?.trim() ? `Instructions:\n${part.instructions}` : '',
        part.output?.trim() ? `Output:\n${part.output}` : '',
      ].filter(Boolean);
      if (lines.length > 0) {
        timeline.push({ id: part.id, type: 'message', content: `${part.name}\n\n${lines.join('\n\n')}` });
      }
    }
  }

  return timeline;
}
