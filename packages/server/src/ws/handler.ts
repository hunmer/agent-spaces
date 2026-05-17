import type { WebSocket } from 'ws';
import type { WSEvent, ClientEventName, Message } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace } from './connection-manager.js';
import { handleTerminalEvent, sendTerminalSessions } from './terminal-handler.js';
import { appendMessageReply, createMessage } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import * as agentService from '../services/agent.js';
import { runMentionedAgent, stopChannelRuns, handleAnswerQuestion, ensureScheduler, makeContext } from './agent-runner.js';
import { stripHtml, extractMentionIds } from './html-utils.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

const handlers = new Map<string, EventHandler>();

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

  // Send existing terminal sessions for reconnection
  sendTerminalSessions(ws, workspaceId);

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
const terminalEvents = [
  'terminal.list',
  'terminal.create',
  'terminal.input',
  'terminal.resize',
  'terminal.close',
] as const;

for (const evt of terminalEvents) {
  registerHandler(evt, (ws, workspaceId, data) => {
    handleTerminalEvent(ws, workspaceId, evt, data);
  });
}

// Register channel handlers
registerHandler('channel.message', (_ws, workspaceId, data) => {
  const { channelId, content, type, mentions, attachments, replyToMessageId } = data as {
    channelId: string;
    content: string;
    type?: string;
    mentions?: string[];
    attachments?: Message['attachments'];
    replyToMessageId?: string;
  };
  if (!channelId || (!content && !attachments?.length)) return;
  if (!getChannel(workspaceId, channelId)) return;
  if (replyToMessageId) {
    const updated = appendMessageReply(workspaceId, channelId, replyToMessageId, {
      senderId: 'user',
      content,
      attachments,
    });
    if (!updated) return;
    broadcastToWorkspace(workspaceId, 'channel.message.updated', updated);

    const agentId = updated.senderId !== 'user' ? updated.senderId : undefined;
    if (agentId) {
      void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(content), {
        messageId: updated.id,
        appendUserMessage: stripHtml(content),
      });
    }
    return;
  }
  const message = createMessage(workspaceId, channelId, {
    senderId: 'user',
    content,
    type: attachments?.length ? 'attachment' : type as any,
    attachments,
  });
  broadcastToWorkspace(workspaceId, 'channel.message', message);

  const agentIds = [...new Set([...(mentions || []), ...extractMentionIds(content)].filter(Boolean))];
  for (const agentId of agentIds) {
    void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(content));
  }
});

registerHandler('channel.stop', (_ws, workspaceId, data) => {
  const { channelId } = data as { channelId?: string };
  if (!channelId) return;
  stopChannelRuns(workspaceId, channelId);
});

registerHandler('channel.answer_question', handleAnswerQuestion);

// Register agent handlers
registerHandler('agent.start', (_ws, workspaceId, data) => {
  const { role, issueId } = data as { role: string; issueId?: string };

  if (role === 'planner' && issueId) {
    console.warn(`[ws] planner start ignored; issue automation is workflow-driven workspaceId=${workspaceId} issueId=${issueId}`);
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

export { broadcastToWorkspace } from './connection-manager.js';
export { stopChannelRuns, hasActiveChannelRuns, markInactiveChannelRunsStopped } from './agent-runner.js';
