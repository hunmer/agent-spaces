import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import type { WSEvent, ClientEventName, Message, AgentConfig } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace, getClientId, onClientConnected, getConnectionByClientId, sendToClient } from './connection-manager.js';
import { handleTerminalEvent, sendTerminalSessions } from './terminal-handler.js';
import { registerChatHandlers } from './chat-handler.js';
import { appendMessageReply, createMessage, updateMessage } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import { scheduleChannelTitleGeneration } from '../services/generated-title.js';
import * as agentService from '../services/agent.js';
import { runMentionedAgent, stopChannelRuns, handleAnswerQuestion, ensureScheduler, makeContext } from './agent-runner.js';
import { stripHtml, extractMentionIds, stripMentionIds } from './html-utils.js';
import { postTeamRuntimeMessage } from '../services/team-runtime.js';
import { loadTeam } from '../services/team-internal.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

interface AgentModelOverride {
  apiBase: string;
  apiKey: string;
  model: string;
  modelProvider: NonNullable<AgentConfig['modelProvider']>;
}

const handlers = new Map<string, EventHandler>();

export function registerHandler(event: string, handler: EventHandler) {
  handlers.set(event, handler);
}

export function handleConnection(ws: WebSocket, workspaceId: string) {
  const clientId = addConnection(ws, workspaceId);

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
  const { channelId, content, type, mentions, attachments, replyToMessageId, contextLength, agentOverride } = data as {
    channelId: string;
    content: string;
    type?: string;
    mentions?: string[];
    attachments?: Message['attachments'];
    replyToMessageId?: string;
    contextLength?: number;
    agentOverride?: AgentModelOverride;
  };
  const normalizedContextLength = normalizeContextLength(contextLength);
  if (!channelId || (!content && !attachments?.length)) return;
  const channel = getChannel(workspaceId, channelId);
  if (!channel) return;
  const mentionIds = [...new Set([...(mentions || []), ...extractMentionIds(content)].filter(Boolean))];
  const teamMentionIds = mentionIds.filter((id) => id.startsWith('team:') && channel.teamIds?.includes(id.slice('team:'.length)));
  const messageContent = stripMentionIds(content, teamMentionIds);
  if (replyToMessageId) {
    const updated = appendMessageReply(workspaceId, channelId, replyToMessageId, {
      senderId: 'user',
      content: messageContent,
      attachments,
    });
    if (!updated) return;
    broadcastToWorkspace(workspaceId, 'channel.message.updated', updated);

    const agentId = updated.senderId !== 'user' ? updated.senderId : undefined;
    if (agentId) {
      const latestReplyId = updated.replies?.at(-1)?.id;
      void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(messageContent), {
        messageId: updated.id,
        appendUserMessage: stripHtml(messageContent),
        userAttachments: attachments,
        resumeSessionId: normalizedContextLength > 0 ? updated.metadata?.runtimeSessionId : undefined,
        excludeHistoryReplyIds: latestReplyId ? [latestReplyId] : undefined,
        contextLength: normalizedContextLength,
        agentOverride,
      });
    }
    return;
  }
  const message = createMessage(workspaceId, channelId, {
    senderId: 'user',
    content: messageContent,
    type: attachments?.length ? 'attachment' : type as any,
    attachments,
  });
  broadcastToWorkspace(workspaceId, 'channel.message', message);
  if (!channel.name.trim()) {
    scheduleChannelTitleGeneration({
      workspaceId,
      channelId,
      requirement: stripHtml(messageContent),
      broadcast: (event, payload) => broadcastToWorkspace(workspaceId, event, payload),
    });
  }

  const teamIds = mentionIds
    .filter((id) => id.startsWith('team:'))
    .map((id) => id.slice('team:'.length))
    .filter((id) => channel.teamIds?.includes(id));
  const agentIds = mentionIds.filter((id) => !id.startsWith('team:'));
  for (const agentId of agentIds) {
    void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(messageContent), {
      userAttachments: attachments,
      excludeHistoryMessageIds: [message.id],
      contextLength: normalizedContextLength,
      agentOverride,
    });
  }
  for (const teamId of teamIds) {
    const team = loadTeam(teamId);
    if (!team) continue;
    const sessionId = randomUUID();
    const card = createMessage(workspaceId, channelId, {
      senderId: `team:${teamId}`,
      senderRole: 'team',
      content: stripHtml(messageContent) || team.name,
      status: 'completed',
      metadata: { teamId, teamName: team.name, sessionId },
    });
    broadcastToWorkspace(workspaceId, 'channel.message', card);
    const result = postTeamRuntimeMessage({
      team_id: teamId,
      session_id: sessionId,
      actor_agent_id: 'admin',
      content: stripHtml(messageContent) || team.name,
      context_length: normalizedContextLength,
    });
    if (!result.success) {
      const failed = updateMessage(workspaceId, channelId, card.id, {
        status: 'error',
        content: result.message,
      });
      if (failed) broadcastToWorkspace(workspaceId, 'channel.message.updated', failed);
    }
  }
});

function normalizeContextLength(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 20;
  return Math.min(20, Math.max(0, Math.trunc(value)));
}

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


// Register chat handlers
registerChatHandlers();



export { broadcastToWorkspace } from './connection-manager.js';
export { stopChannelRuns, hasActiveChannelRuns, markInactiveChannelRunsStopped } from './agent-runner.js';
