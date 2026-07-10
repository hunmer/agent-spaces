import type { WebSocket } from 'ws';
import type { WSEvent, ClientEventName, Message, AgentConfig } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace, getClientId, handleClientNodeResponse, handleInteractionResponse, onClientConnected, getConnectionByClientId, sendToClient } from './connection-manager.js';
import type { ClientNodeResponse, InteractionResponse } from '@agent-spaces/shared';
import { handleTerminalEvent, sendTerminalSessions } from './terminal-handler.js';
import { registerChatHandlers } from './chat-handler.js';
import { appendMessageReply, createMessage, updateMessage } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import { scheduleChannelTitleGeneration } from '../services/generated-title.js';
import * as agentService from '../services/agent.js';
import { runMentionedAgent, stopChannelRuns, handleAnswerQuestion, ensureScheduler, makeContext } from './agent-runner.js';
import { stripHtml, extractMentionIds } from './html-utils.js';
import { listTasks } from '../services/mini-app-tasks.js';
import { listConfigs } from '../services/mini-apps.js';
import { handleMiniAppClientResponse } from '../services/mini-app-client-rpc.js';
import { postTeamRuntimeMessage } from '../services/team-runtime.js';
import { loadTeam } from '../services/team-internal.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

interface MiniAppMessageContext {
  projectId: string;
  activeFilePath?: string;
  projectType?: 'react' | 'html';
  fileContent?: string;
}

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
  const { channelId, content, type, mentions, attachments, replyToMessageId, contextLength, agentOverride, miniAppContext } = data as {
    channelId: string;
    content: string;
    type?: string;
    mentions?: string[];
    attachments?: Message['attachments'];
    replyToMessageId?: string;
    contextLength?: number;
    agentOverride?: AgentModelOverride;
    miniAppContext?: MiniAppMessageContext;
  };
  const normalizedContextLength = normalizeContextLength(contextLength);
  if (!channelId || (!content && !attachments?.length)) return;
  const channel = getChannel(workspaceId, channelId);
  if (!channel) return;
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
      const latestReplyId = updated.replies?.at(-1)?.id;
      void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(content), {
        messageId: updated.id,
        appendUserMessage: stripHtml(content),
        userAttachments: attachments,
        resumeSessionId: normalizedContextLength > 0 ? updated.metadata?.runtimeSessionId : undefined,
        excludeHistoryReplyIds: latestReplyId ? [latestReplyId] : undefined,
        contextLength: normalizedContextLength,
        agentOverride,
        miniAppContext,
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
  if (!channel.name.trim()) {
    scheduleChannelTitleGeneration({
      workspaceId,
      channelId,
      requirement: stripHtml(content),
      broadcast: (event, payload) => broadcastToWorkspace(workspaceId, event, payload),
    });
  }

  const mentionIds = [...new Set([...(mentions || []), ...extractMentionIds(content)].filter(Boolean))];
  const teamIds = mentionIds
    .filter((id) => id.startsWith('team:'))
    .map((id) => id.slice('team:'.length))
    .filter((id) => channel.teamIds?.includes(id));
  const agentIds = mentionIds.filter((id) => !id.startsWith('team:'));
  for (const agentId of agentIds) {
    void runMentionedAgent(workspaceId, channelId, agentId, stripHtml(content), {
      userAttachments: attachments,
      excludeHistoryMessageIds: [message.id],
      contextLength: normalizedContextLength,
      agentOverride,
      miniAppContext,
    });
  }
  for (const teamId of teamIds) {
    const team = loadTeam(teamId);
    if (!team) continue;
    const card = createMessage(workspaceId, channelId, {
      senderId: `team:${teamId}`,
      senderRole: 'team',
      content: stripHtml(content) || team.name,
      status: 'completed',
      metadata: { teamId, teamName: team.name },
    });
    broadcastToWorkspace(workspaceId, 'channel.message', card);
    const result = postTeamRuntimeMessage({
      team_id: teamId,
      actor_agent_id: 'admin',
      content: stripHtml(content) || team.name,
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

// Workflow interaction response handler
registerHandler('workflow:interaction', (ws, _workspaceId, data) => {
  const clientId = getClientId(ws);
  if (clientId) handleInteractionResponse(data as InteractionResponse, clientId);
});

registerHandler('workflow:client-node', (ws, _workspaceId, data) => {
  const clientId = getClientId(ws);
  if (clientId) handleClientNodeResponse(data as ClientNodeResponse, clientId);
});

registerHandler('miniApp.clientResponse', (_ws, _workspaceId, data) => {
  handleMiniAppClientResponse(data);
});

// Register chat handlers
registerChatHandlers();

// Workflow UI: 客户端连入即推送当前任务快照（断线/刷新/新标签恢复视图）
onClientConnected((clientId) => {
  const conn = getConnectionByClientId(clientId);
  if (!conn) return;
  const tasks = listTasks(conn.workspaceId);
  sendToClient(clientId, { event: 'miniApp.taskSnapshot', data: { tasks } });
  // 配置全量快照：UI 据此建立内存缓存，不再直接 readConfig
  const configs = listConfigs(conn.workspaceId);
  sendToClient(clientId, { event: 'miniApp.configSnapshot', data: { configs } });
});

export { broadcastToWorkspace } from './connection-manager.js';
export { stopChannelRuns, hasActiveChannelRuns, markInactiveChannelRunsStopped } from './agent-runner.js';
