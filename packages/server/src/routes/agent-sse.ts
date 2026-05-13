import { Router, type Request, type Response } from 'express';
import type { AgentConfig, Message } from '@agent-spaces/shared';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { verifyToken } from '../middleware/auth.js';
import * as agentService from '../services/agent.js';
import * as workspaceService from '../services/workspace.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { buildAgentPrompt } from '../ws/agent-prompt.js';

const router = Router();

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
  maxTurns?: number;
}

router.post('/run', async (req: Request, res: Response) => {
  const body = req.body as AgentSseRequestBody;
  if (!verifyRequestKey(req, body)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const workspaceId = body.workspaceId?.trim();
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }

  const workspace = workspaceService.getById(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'workspace not found' });
    return;
  }

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
  const output: string[] = [];
  let completed = false;

  prepareSse(res);
  writeSse(res, 'session', { session });

  const runtime = createAgentRuntime({
    kind: preset.runtimeKind,
    provider: preset.modelProvider,
    model: preset.modelId,
    apiKey: preset.apiKey,
    baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
    adapterBaseURL: preset.apiBase,
    ...getThinkingRuntimeConfig(preset),
  });

  req.on('close', () => {
    if (!completed) runtime.stop();
  });

  try {
    agentService.updateStatus(workspaceId, session.id, 'active');
    writeSse(res, 'status', { agentId: session.id, status: 'active' });

    const result = await runtime.execute(
      buildAgentPrompt(
        workspaceId,
        body.systemPrompt ?? preset.systemPrompt,
        userPrompt,
        normalizeMessages(body.messages),
        {
          mcpServers: Object.keys(mcpServers ?? {}),
          skills,
          boundDirs: workspace.boundDirs,
          builtInTools: [],
        },
      ),
      agentService.resolveWorkingDir(workspaceId, preset),
      {
        maxTurns: normalizeMaxTurns(body.maxTurns),
        mcpServers,
        skills,
        configDir,
        sandboxDirs: preset.sandboxDirs,
        onEvent: (event) => {
          if (event.type === 'output') output.push(event.line);
          writeSse(res, event.type, serializeRuntimeEvent(event));
        },
      },
    );

    completed = true;
    const displayOutput = output.length ? output : result.output;
    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: displayOutput,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
    });

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
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: error,
      output: output.length ? output : [error],
      durationMs: Date.now() - startTime,
    });
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

function prepareSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
