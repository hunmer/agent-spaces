import { v4 as uuid } from 'uuid';
import type { AgentConfig, AgentSession, AgentSessionStatus } from '@agent-spaces/shared';
import {
  listAgentSessions,
  getAgentSession,
  createAgentSession,
  updateAgentSession,
  deleteAgentSession,
} from '../storage/agent-store.js';
import { getWorkspace, updateWorkspace } from '../storage/workspace-store.js';

const VALID_ROLES: AgentConfig['role'][] = ['scheduler', 'planner', 'executor', 'reviewer'];

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
    const requestUrl =
      provider === 'anthropic-messages'
        ? joinUrl(apiBase, '/messages')
        : joinUrl(apiBase, '/chat/completions');
    debug.requestUrl = requestUrl;

    console.info('[agent:test-connection] request', debug);

    const response = await (
      provider === 'anthropic-messages'
        ? testAnthropicConnection(requestUrl, apiKey, model, controller.signal)
        : testOpenAIConnection(requestUrl, apiKey, model, controller.signal)
    );

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

async function testOpenAIConnection(
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

async function testAnthropicConnection(
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

function inferProvider(apiBase?: string): 'anthropic-messages' | 'openai-completions' {
  return apiBase?.includes('anthropic.com') ? 'anthropic-messages' : 'openai-completions';
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
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
  const preset: AgentConfig = {
    id: uuid(),
    name: data.name?.trim() || 'New Agent',
    role: data.role && VALID_ROLES.includes(data.role) ? data.role : 'executor',
    description: data.description || '',
    modelProvider: data.modelProvider,
    modelId: data.modelId || 'claude-sonnet-4-6',
    apiBase: data.apiBase || '',
    apiKey: data.apiKey || '',
    workingDir: data.workingDir || '/workspace',
    mcps: data.mcps || [],
    skills: data.skills || [],
    systemPrompt: data.systemPrompt || '',
    temperature: data.temperature ?? 0.3,
    maxTokens: data.maxTokens ?? 4096,
    sandboxDirs: data.sandboxDirs,
    maxRetries: data.maxRetries,
    enabled: data.enabled ?? true,
  };

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
  const updated: AgentConfig = {
    ...existing,
    ...data,
    id: existing.id,
    role,
    name: data.name?.trim() || existing.name || 'New Agent',
    mcps: data.mcps || [],
    skills: data.skills || [],
    enabled: data.enabled ?? existing.enabled ?? true,
  };

  ws.agents[index] = updated;
  ws.updatedAt = new Date().toISOString();
  updateWorkspace(ws);
  return updated;
}

export function deletePreset(workspaceId: string, presetId: string): boolean | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;

  const before = (ws.agents || []).length;
  ws.agents = (ws.agents || []).filter((preset) => preset.id !== presetId);
  if (ws.agents.length === before) return false;

  ws.updatedAt = new Date().toISOString();
  updateWorkspace(ws);
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
): AgentSession | null {
  return updateStatus(workspaceId, sessionId, error ? 'crashed' : 'completed', {
    currentTaskId: undefined,
    error,
  });
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
