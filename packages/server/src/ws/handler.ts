import type { WebSocket } from 'ws';
import type { WSEvent, ClientEventName, Message, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace } from './connection-manager.js';
import { handleTerminalEvent } from './terminal-handler.js';
import { createMessage, updateMessage, listMessages } from '../services/message.js';
import { getChannel } from '../services/channel.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import * as wsService from '../services/workspace.js';
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
  const { channelId, content, type, mentions, attachments } = data as {
    channelId: string;
    content: string;
    type?: string;
    mentions?: string[];
    attachments?: Message['attachments'];
  };
  if (!channelId || (!content && !attachments?.length)) return;
  if (!getChannel(workspaceId, channelId)) return;
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

  const configDir = agentService.getAgentConfigDir(workspaceId, preset);
  const mcpServers = agentService.getMcpServers(preset.mcps);
  const skills = agentService.getAvailableSkillNames(configDir, preset.skills);
  const pending = createMessage(workspaceId, channelId, {
    senderId: preset.name || preset.role,
    senderRole: preset.role,
    content: 'Agent is processing...',
    type: 'text',
    status: 'pending',
    metadata: {
      agentSessionId: session.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
    },
    parts: [
      {
        id: `subagent-${session.id}`,
        type: 'subagent',
        name: preset.name || preset.role,
        model: preset.modelId,
        instructions: preset.systemPrompt,
        tools: [
          ...Object.keys(mcpServers ?? {}).map((name) => ({
            name,
            description: `MCP server: ${name}`,
          })),
          ...skills.map((name) => ({
            name,
            description: `Skill: ${name}`,
          })),
        ],
      },
      {
        id: `reasoning-${session.id}`,
        type: 'reasoning',
        text: 'Preparing agent runtime and loading conversation context...',
        status: 'streaming',
      },
    ],
  });
  broadcastToWorkspace(workspaceId, 'channel.message', pending);

  try {
    const runtime = createAgentRuntime({
      kind: preset.runtimeKind,
      provider: preset.modelProvider,
      model: preset.modelId,
      apiKey: preset.apiKey,
      baseURL: preset.apiBase,
    });
    const history = listMessages(workspaceId, channelId, { limit: 20 });
    const workspace = wsService.getById(workspaceId);
    const result = await runtime.execute(buildAgentPrompt(preset.systemPrompt, prompt, history, {
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      boundDirs: workspace?.boundDirs,
    }), agentService.resolveWorkingDir(workspaceId, preset), {
      maxTurns: 6,
      mcpServers,
      skills,
      configDir,
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
      metadata: {
        agentSessionId: session.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        summary: result.summary,
      },
      parts: buildAgentMessageParts({
        sessionId: session.id,
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        output: result.output,
        success: result.success,
        error: result.error,
      }),
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
      parts: buildAgentMessageParts({
        sessionId: session.id,
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        output: [error],
        success: false,
        error,
      }),
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  }
}

function buildAgentMessageParts(input: {
  sessionId: string;
  presetName: string;
  role: string;
  model?: string;
  systemPrompt?: string;
  mcpServers: string[];
  skills: string[];
  output: string[];
  success: boolean;
  error?: string;
}): MessagePart[] {
  const lines = input.output.filter((line) => line.trim());
  const toolLines = lines.filter(isToolLikeLine);
  const reasoningLines = lines.filter((line) => !isToolLikeLine(line) && !isFinalAnswerLine(line));
  const finalText = lines.filter(isFinalAnswerLine).join('\n') || lines.at(-1) || '';
  const usage = extractUsage(lines);
  const parts: MessagePart[] = [
    {
      id: `subagent-${input.sessionId}`,
      type: 'subagent',
      name: input.presetName,
      model: input.model,
      instructions: input.systemPrompt,
      tools: [
        ...input.mcpServers.map((name) => ({ name, description: `MCP server: ${name}` })),
        ...input.skills.map((name) => ({ name, description: `Skill: ${name}` })),
      ],
    },
  ];

  if (reasoningLines.length > 0) {
    parts.push({
      id: `reasoning-${input.sessionId}`,
      type: 'reasoning',
      text: reasoningLines.join('\n'),
      status: 'completed',
    });
  }

  if (toolLines.length > 0) {
    parts.push({
      id: `tools-${input.sessionId}`,
      type: 'todo',
      todos: toolLines.slice(0, 20).map((line, index) => ({
        id: `tool-${index}`,
        title: line,
        status: 'completed',
      })),
    });
  }

  for (const terminal of extractTerminalBlocks(lines, input.sessionId)) {
    parts.push(terminal);
  }

  if (usage.totalTokens || usage.inputTokens || usage.outputTokens || usage.reasoningTokens) {
    parts.push({
      id: `context-${input.sessionId}`,
      type: 'context',
      usedTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      maxTokens: 128_000,
      modelId: input.model,
      usage,
    });
  }

  if (input.error) {
    parts.push({
      id: `terminal-error-${input.sessionId}`,
      type: 'terminal',
      output: input.error,
      status: 'error',
    });
  }

  if (finalText && finalText !== input.error) {
    parts.push({
      id: `text-${input.sessionId}`,
      type: 'text',
      text: finalText,
    });
  }

  return parts;
}

function isToolLikeLine(line: string): boolean {
  return /^(Using|Read|Write|Edit|Bash|Search|Grep|Glob|Todo|Task|Web|Fetch|Claude Code initialized|.+ running \(\d+s\))/i.test(line.trim());
}

function isFinalAnswerLine(line: string): boolean {
  return !isToolLikeLine(line) && !/^(\[.*\]|Agent runtime configuration:|Conversation history:)/.test(line.trim());
}

function extractUsage(lines: string[]): MessageTokenUsage {
  const usage: MessageTokenUsage = {};
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!lower.includes('token')) continue;
    const input = line.match(/\bin(?:put)?[=:\s]+([\d,]+)/i)?.[1];
    const output = line.match(/\bout(?:put)?[=:\s]+([\d,]+)/i)?.[1];
    const total = line.match(/\btokens?[=:\s]+([\d,]+)/i)?.[1];
    if (input) usage.inputTokens = Number(input.replace(/,/g, ''));
    if (output) usage.outputTokens = Number(output.replace(/,/g, ''));
    if (total) usage.totalTokens = Number(total.replace(/,/g, ''));
  }
  return usage;
}

function extractTerminalBlocks(lines: string[], sessionId: string): MessagePart[] {
  return lines
    .map((line, index): MessagePart | null => {
      const match = line.match(/^(?:Bash|Shell|Command):?\s*(.*)$/i);
      if (!match) return null;
      return {
        id: `terminal-${sessionId}-${index}`,
        type: 'terminal',
        command: match[1],
        output: line,
        status: 'completed',
      };
    })
    .filter((part): part is MessagePart => Boolean(part));
}

function buildAgentPrompt(
  systemPrompt: string | undefined,
  userPrompt: string,
  history: Message[] = [],
  runtimeConfig?: { mcpServers: string[]; skills: string[]; boundDirs?: string[] },
): string {
  const parts: string[] = [];
  const trimmedSystemPrompt = systemPrompt?.trim();
  if (trimmedSystemPrompt) parts.push(trimmedSystemPrompt);

  if (runtimeConfig) {
    const configLines = [
      'Agent runtime configuration:',
      `- MCP servers configured for this agent: ${runtimeConfig.mcpServers.length ? runtimeConfig.mcpServers.join(', ') : 'none'}`,
      `- Skills configured for this agent: ${runtimeConfig.skills.length ? runtimeConfig.skills.join(', ') : 'none'}`,
    ];
    if (runtimeConfig.boundDirs?.length) {
      configLines.push(`- Code directories (boundDirs): ${runtimeConfig.boundDirs.join(', ')}`);
    }
    configLines.push('When asked what MCP servers or skills you have, answer from this configuration only. Do not infer availability from provider-side function names or hidden runtime internals.');
    parts.push(configLines.join('\n'));
  }

  if (history.length > 0) {
    parts.push('Conversation history:');
    for (const msg of history) {
      const role = msg.senderId === 'user' ? 'User' : (msg.senderRole || msg.senderId);
      parts.push(`[${role}]: ${stripHtml(msg.content)}`);
    }
  }

  parts.push(`User message:\n${userPrompt}`);
  return parts.join('\n\n');
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
