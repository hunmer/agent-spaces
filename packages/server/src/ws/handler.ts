import type { WebSocket } from 'ws';
import type { WSEvent, ClientEventName } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace } from './connection-manager.js';
import { handleTerminalEvent } from './terminal-handler.js';
import { createMessage } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import { runPlanner } from '../agents/planner-agent.js';
import type { AgentContext } from '../agents/agent-context.js';

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
  const { channelId, content, type } = data as { channelId: string; content: string; type?: string };
  if (!channelId || !content) return;
  if (!getChannel(workspaceId, channelId)) return;
  const message = createMessage(workspaceId, channelId, { senderId: 'user', content, type: type as any });
  broadcastToWorkspace(workspaceId, 'channel.message', message);
});

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
