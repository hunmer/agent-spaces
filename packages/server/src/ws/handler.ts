import type { WebSocket } from 'ws';
import type { WSEvent, ClientEventName } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace } from './connection-manager.js';
import { handleTerminalEvent } from './terminal-handler.js';
import { createMessage, updateMessage } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import { runPlanner } from '../agents/planner-agent.js';
import type { AgentContext } from '../agents/agent-context.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

const handlers = new Map<string, EventHandler>();

// Track which workspaces have schedulers running
const activeSchedulers = new Set<string>();

function ensureScheduler(workspaceId: string, ctx: AgentContext) {
  if (!activeSchedulers.has(workspaceId)) {
    activeSchedulers.add(workspaceId);
    startScheduler(workspaceId, ctx);
    console.log(`[ws] scheduler started for workspace ${workspaceId}`);
  }
}

function makeContext(workspaceId: string): AgentContext {
  return {
    workspaceId,
    broadcast: (event, data) => broadcastToWorkspace(workspaceId, event, data),
    getSession: (sessionId) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId, status, extra) =>
      agentService.updateStatus(workspaceId, sessionId, status, extra),
  };
}

export function registerHandler(event: string, handler: EventHandler) {
  handlers.set(event, handler);
}

export function handleConnection(ws: WebSocket, workspaceId: string) {
  addConnection(ws, workspaceId);

  const ctx = makeContext(workspaceId);
  ensureScheduler(workspaceId, ctx);

  ws.send(JSON.stringify({
    event: 'connected',
    workspaceId,
    timestamp: new Date().toISOString(),
    data: { workspaceId },
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as WSEvent;
      const handler = handlers.get(msg.event);
      if (handler) {
        handler(ws, workspaceId, msg.data);
      } else {
        console.warn(`[WS] unhandled event: ${msg.event}`);
      }
    } catch (err) {
      console.error('[WS] invalid message:', err instanceof Error ? err.message : String(err));
    }
  });
}

// Register terminal handlers
const terminalEvents: ClientEventName[] = [
  'terminal.create',
  'terminal.input',
  'terminal.resize',
  'terminal.close',
];

for (const evt of terminalEvents) {
  registerHandler(evt, (ws, workspaceId, data) => {
    handleTerminalEvent(ws, workspaceId, evt, data);
  });
}

// Register channel handler
registerHandler('channel.message', (_ws, workspaceId, data) => {
  const { channelId, content, type, mentions } = data as {
    channelId: string;
    content: string;
    type?: string;
    mentions?: string[];
  };
  if (!channelId || !content) return;
  if (!getChannel(workspaceId, channelId)) return;
  const message = createMessage(workspaceId, channelId, { senderId: 'user', content, type: type as any });
  broadcastToWorkspace(workspaceId, 'channel.message', message);

  const agentIds = [...new Set([...(mentions || []), ...extractMentionIds(content)].filter(Boolean))];
  for (const agentId of agentIds) {
    void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(content));
  }
});

async function runMentionedAgent(
  workspaceId: string,
  channelId: string,
  agentConfigId: string,
  prompt: string,
) {
  const preset = agentService.listPresets(workspaceId)?.find((agent) => agent.id === agentConfigId);
  if (!preset || preset.enabled === false) return;

  const session = agentService.create(workspaceId, preset.role, preset.id);
  broadcastToWorkspace(workspaceId, 'agent.started', session);
  agentService.updateStatus(workspaceId, session.id, 'active');
  broadcastToWorkspace(workspaceId, 'agent.status_changed', {
    agentId: session.id,
    from: 'idle',
    to: 'active',
  });

  const pending = createMessage(workspaceId, channelId, {
    senderId: preset.name || preset.role,
    senderRole: preset.role,
    content: 'Agent is processing...',
    type: 'text',
    status: 'pending',
  });
  broadcastToWorkspace(workspaceId, 'channel.message', pending);

  try {
    const runtime = createAgentRuntime({
      provider: preset.modelProvider,
      model: preset.modelId,
      apiKey: preset.apiKey,
      baseURL: preset.apiBase,
    });
    const result = await runtime.execute(buildAgentPrompt(preset.systemPrompt, prompt), preset.workingDir || process.cwd(), {
      maxTurns: 6,
      tools: preset.mcps,
      sandboxDirs: preset.sandboxDirs,
    });

    for (const line of result.output) {
      broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: line });
    }

    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error);
    broadcastToWorkspace(workspaceId, 'agent.completed', {
      agentId: session.id,
      result: {
        success: result.success,
        summary: result.summary,
        artifacts: result.artifacts,
        error: result.error,
      },
      error: result.error,
    });

    const reply = updateMessage(workspaceId, channelId, pending.id, {
      content: result.success ? result.output.join('\n') : result.error || result.output.join('\n'),
      type: 'text',
      status: result.success ? 'completed' : 'error',
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    agentService.complete(workspaceId, session.id, error);
    broadcastToWorkspace(workspaceId, 'agent.error', { agentId: session.id, error });
    const reply = updateMessage(workspaceId, channelId, pending.id, {
      content: error,
      type: 'text',
      status: 'error',
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  }
}

function buildAgentPrompt(systemPrompt: string | undefined, userPrompt: string): string {
  const trimmedSystemPrompt = systemPrompt?.trim();
  if (!trimmedSystemPrompt) return userPrompt;
  return `${trimmedSystemPrompt}\n\nUser message:\n${userPrompt}`;
}

function stripHtml(content: string): string {
  return content
    .replace(/<span[^>]*data-type=["']mention["'][^>]*data-label=["']([^"']+)["'][^>]*><\/span>/gi, '@$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMentionIds(content: string): string[] {
  const ids = new Set<string>();
  const mentionPattern = /<span[^>]*data-type=["']mention["'][^>]*>/gi;
  for (const match of content.matchAll(mentionPattern)) {
    const id = match[0].match(/\sdata-id=["']([^"']+)["']/i)?.[1];
    if (id) ids.add(decodeHtml(id));
  }
  return [...ids];
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Register agent handlers
registerHandler('agent.start', (_ws, workspaceId, data) => {
  const { role, issueId } = data as { role: string; issueId?: string };
  const ctx = makeContext(workspaceId);

  if (role === 'planner' && issueId) {
    runPlanner(workspaceId, issueId, ctx).catch((err) => {
      console.error(`[ws] planner error:`, err);
    });
  }
});

registerHandler('agent.stop', (_ws, workspaceId, data) => {
  const { agentId } = data as { agentId: string };
  agentService.complete(workspaceId, agentId);
  broadcastToWorkspace(workspaceId, 'agent.status_changed', {
    agentId,
    from: 'active',
    to: 'completed',
  });
});

export { broadcastToWorkspace };
