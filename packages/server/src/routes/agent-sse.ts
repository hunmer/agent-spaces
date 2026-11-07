import { Router, type Request, type Response } from 'express';
import type { AgentConfig, Message } from '@agent-spaces/shared';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { verifyToken } from '../middleware/auth.js';
import * as agentService from '../services/agent.js';
import * as workspaceService from '../services/workspace.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';
import { wrapOnEventWithHooks } from '../services/hook-engine.js';

const router = Router();
const MAX_LANGCHAIN_STALL_RETRIES = 5;
const LANGCHAIN_STALL_ERROR = 'LangChain stream stalled after tool results';

type AgentSseMessage = Pick<Message, 'senderId' | 'senderRole' | 'content' | 'status' | 'parts'>;

interface AgentSseRequestBody {
  key?: string;
  workspaceId?: string;
  agentid?: string;
  agentId?: string;
  messages?: AgentSseMessage[];
  message?: string;
  prompt?: string;
  mcp?: AgentConfig['mcps'];
  mcps?: AgentConfig['mcps'];
  skill?: string | string[];
  skills?: string[];
  systemPrompt?: string;
  outputStyle?: string;
  maxTurns?: number;
}

export async function runAgentSseText(
  agentId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTurns = 100,
  maxTokens?: number,
): Promise<string> {
  const workspaceId = resolveWorkspaceId(undefined);
  const workspace = workspaceService.getById(workspaceId);
  const preset = agentService.listPresets(workspaceId).find((agent) => agent.id === agentId);
  if (!preset || preset.enabled === false) throw new Error('agent preset not found');

  const mcpServers = agentService.getMcpServers(preset.mcps);
  const configDir = agentService.getAgentConfigDir(workspaceId, preset);
  const skills = agentService.getAvailableSkillNames(configDir, preset.skills);
  const workingDir = agentService.resolveWorkingDir(workspaceId, preset);
  const prompt = buildAgentPrompt(workspaceId, systemPrompt, userPrompt, [], {
    runtimeKind: preset.runtimeKind,
    mcpServers: Object.keys(mcpServers ?? {}),
    skills,
    boundDirs: workspace?.boundDirs ?? [],
    workingDir,
    excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
  });
  const output: string[] = [];
  const runtime = createAgentRuntime({
    kind: preset.runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
    adapterBaseURL: preset.apiBase,
    maxTokens: maxTokens ?? preset.maxTokens,
    ...getThinkingRuntimeConfig(preset),
  });
  const result = await runtime.execute(prompt, workingDir, {
    maxTurns,
    mcpServers,
    skills,
    configDir,
    sandboxDirs: preset.sandboxDirs,
    userPrompt,
    outputStyle: preset.outputStyle,
    onEvent: (event) => {
      if (event.type === 'output') output.push(event.line);
    },
  });
  if (!result.success) throw new Error(result.error || 'Agent run failed');
  return output.length ? output.join('') : result.output.join('\n');
}

router.post('/run', async (req: Request, res: Response) => {
  const body = req.body as AgentSseRequestBody;
  if (!verifyRequestKey(req, body)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const workspaceId = resolveWorkspaceId(body.workspaceId);
  const workspace = workspaceService.getById(workspaceId);

  const agentConfigId = (body.agentId ?? body.agentid)?.trim();
  if (!agentConfigId) {
    res.status(400).json({ error: 'agentid is required' });
    return;
  }

  const preset = agentService.listPresets(workspaceId).find((agent) => agent.id === agentConfigId);
  if (!preset || preset.enabled === false) {
    res.status(404).json({ error: 'agent preset not found' });
    return;
  }

  const userPrompt = resolveUserPrompt(body);
  if (!userPrompt) {
    res.status(400).json({ error: 'message, prompt, or messages is required' });
    return;
  }

  const session = agentService.create(workspaceId, preset.role, preset.id);
  const startTime = Date.now();
  const mcpConfig = body.mcps ?? body.mcp ?? preset.mcps;
  const mcpServers = agentService.getMcpServers(mcpConfig);
  const requestedSkills = normalizeSkills(body.skills ?? body.skill) ?? preset.skills;
  const configDir = agentService.getAgentConfigDir(workspaceId, { ...preset, skills: requestedSkills });
  const skills = agentService.getAvailableSkillNames(configDir, requestedSkills);
  const runtimeKind = preset.runtimeKind;
  const systemPrompt = body.systemPrompt ?? preset.systemPrompt;
  const history = normalizeMessages(body.messages);
  const output: string[] = [];
  const workingDir = agentService.resolveWorkingDir(workspaceId, preset);
  let completed = false;

  prepareSse(res);
  writeSse(res, 'session', { session, workspaceId });

  const createRuntime = () => createAgentRuntime({
    kind: runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
    adapterBaseURL: preset.apiBase,
    maxTokens: preset.maxTokens,
    ...getThinkingRuntimeConfig(preset),
  });
  let currentRuntime: ReturnType<typeof createAgentRuntime> | null = null;

  res.on('close', () => {
    if (!completed && !res.writableEnded) currentRuntime?.stop();
  });

  try {
    agentService.updateStatus(workspaceId, session.id, 'active');
    writeSse(res, 'status', { agentId: session.id, status: 'active' });

    const agentPrompt = buildAgentPrompt(
      workspaceId,
      systemPrompt,
      userPrompt,
      history,
      {
        runtimeKind,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        boundDirs: workspace?.boundDirs ?? [],
        workingDir,
        excludeNativeClaudeMd: runtimeKind === 'claude-code',
        builtInTools: [],
      },
    );
    let result: Awaited<ReturnType<ReturnType<typeof createAgentRuntime>['execute']>>;
    let retryCount = 0;
    while (true) {
      currentRuntime = createRuntime();
      result = await currentRuntime.execute(
        agentPrompt,
        workingDir,
        {
          maxTurns: normalizeMaxTurns(body.maxTurns),
          mcpServers,
          skills,
          configDir,
          sandboxDirs: preset.sandboxDirs,
          userPrompt,
          outputStyle: body.outputStyle ?? preset.outputStyle,
          onEvent: wrapOnEventWithHooks((event) => {
            if (event.type === 'output') output.push(event.line);
            writeSse(res, event.type, serializeRuntimeEvent(event));
          }, workspaceId, workspace?.hooksEnabled),
        },
      );
      currentRuntime = null;

      if (!isRetryableLangChainStall(result.error) || retryCount >= MAX_LANGCHAIN_STALL_RETRIES) break;
      retryCount += 1;
      writeSse(res, 'retry', {
        agentId: session.id,
        attempt: retryCount + 1,
        maxRetries: MAX_LANGCHAIN_STALL_RETRIES,
        error: result.error,
      });
    }

    completed = true;
    const displayOutput = output.length ? output : result.output;
    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
      runtime: runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: displayOutput,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
      forceRecord: true,
    });
    agentService.persistSessionCliHistory(session.id);

    writeSse(res, 'done', {
      agentId: session.id,
      success: result.success,
      summary: result.summary,
      artifacts: result.artifacts,
      error: result.error,
      output: displayOutput,
      usage: result.usage,
      costUsd: result.costUsd,
      durationMs: Date.now() - startTime,
    });
    res.end();
  } catch (err) {
    completed = true;
    const error = err instanceof Error ? err.message : String(err);
    agentService.complete(workspaceId, session.id, error, {
      runtime: runtimeKind,
      model: preset.modelId,
      summary: error,
      output: output.length ? output : [error],
      durationMs: Date.now() - startTime,
      forceRecord: true,
    });
    agentService.persistSessionCliHistory(session.id);
    writeSse(res, 'error', { agentId: session.id, error });
    res.end();
  }
});

function verifyRequestKey(req: Request, body: AgentSseRequestBody): boolean {
  const auth = req.headers.authorization;
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const headerKey = typeof req.headers['x-agent-spaces-key'] === 'string'
    ? req.headers['x-agent-spaces-key']
    : undefined;
  return verifyToken(body.key ?? bearer ?? headerKey ?? null);
}

function resolveWorkspaceId(workspaceId: string | undefined): string {
  const explicit = workspaceId?.trim();
  if (explicit) return explicit;
  return workspaceService.getAll()[0]?.id ?? 'default';
}

function prepareSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Force flush — compression middleware and some proxies buffer small writes
  const flushable = res as Response & { flush?: () => void };
  if (typeof flushable.flush === 'function') flushable.flush();
}

function resolveUserPrompt(body: AgentSseRequestBody): string {
  const direct = body.prompt ?? body.message;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const messages = normalizeMessages(body.messages);
  const lastUserMessage = [...messages].reverse().find((message) => message.senderId === 'user');
  return lastUserMessage?.content?.trim() ?? '';
}

function normalizeMessages(messages: AgentSseRequestBody['messages']): Message[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message.content === 'string')
    .map((message, index) => ({
      id: `sse-message-${index}`,
      channelId: 'sse',
      senderId: message.senderId ?? 'user',
      senderRole: message.senderRole,
      content: message.content,
      type: 'text',
      status: message.status ?? 'completed',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      parts: message.parts,
    })) as Message[];
}

function normalizeSkills(input: AgentSseRequestBody['skills'] | AgentSseRequestBody['skill']): string[] | undefined {
  if (!input) return undefined;
  const values = Array.isArray(input) ? input : [input];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMaxTurns(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 100;
}

function isRetryableLangChainStall(error: string | undefined): boolean {
  return typeof error === 'string' && error.includes(LANGCHAIN_STALL_ERROR);
}

function serializeRuntimeEvent(event: AgentRuntimeEvent): unknown {
  if (event.type === 'tool_use') {
    return {
      type: event.type,
      id: event.id,
      name: event.name,
      input: event.input,
      line: event.line,
    };
  }
  return event;
}

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
}

export default router;
