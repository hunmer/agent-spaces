import type { WebSocket } from 'ws';
import type { MessageChain, WSEvent, ClientEventName, Message, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
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
import type { AgentRuntime } from '../adapters/agent-runtime-types.js';
import { saveToolDetails } from '../services/tool-detail.js';
import type { ToolDetail } from '../services/tool-detail.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

const handlers = new Map<string, EventHandler>();

// Track which workspaces have schedulers running
const activeSchedulers = new Set<string>();
const activeChannelRuns = new Map<string, Map<string, ActiveChannelRun>>();

interface ActiveChannelRun {
  agentId: string;
  messageId: string;
  runtime: AgentRuntime;
  stopped?: boolean;
}

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

registerHandler('channel.stop', (_ws, workspaceId, data) => {
  const { channelId } = data as { channelId?: string };
  if (!channelId) return;
  stopChannelRuns(workspaceId, channelId);
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
  const workspace = wsService.getById(workspaceId);
  const pending = createMessage(workspaceId, channelId, {
    senderId: preset.name || preset.role,
    senderRole: preset.role,
    content: 'Agent is processing...',
    type: 'text',
    status: 'streaming',
    metadata: {
      agentSessionId: session.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
    },
    parts: [
      {
        id: `reasoning-${session.id}`,
        type: 'reasoning',
        text: 'Preparing agent runtime and loading conversation context...',
        status: 'streaming',
      },
    ],
  });
  broadcastToWorkspace(workspaceId, 'channel.message', pending);

  let activeRun: ActiveChannelRun | undefined;
  try {
    const runtime = createAgentRuntime({
      kind: preset.runtimeKind,
      provider: preset.modelProvider,
      model: preset.modelId,
      apiKey: preset.apiKey,
      baseURL: preset.apiBase,
    });
    activeRun = {
      agentId: session.id,
      messageId: pending.id,
      runtime,
    };
    trackChannelRun(workspaceId, channelId, activeRun);
    const history = listMessages(workspaceId, channelId, { limit: 20 });
    const liveOutput: string[] = [];
    const toolDetails = new Map<string, ToolDetail>();
    const toolUseDetailIds = new Map<string, string>();
    let lastLiveUpdate = 0;
    const broadcastLiveParts = (force = false) => {
      const now = Date.now();
      if (!force && now - lastLiveUpdate < 120) return;
      lastLiveUpdate = now;
      const parts = buildAgentMessageParts({
        sessionId: session.id,
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        output: liveOutput,
        toolDetails,
        success: true,
      });
      if (parts.length === 0) return;

      const live = updateMessage(workspaceId, channelId, pending.id, {
        content: liveOutput.join('\n') || pending.content,
        status: 'streaming',
        parts,
      });
      if (live) broadcastToWorkspace(workspaceId, 'channel.message.updated', live);
    };
    const result = await runtime.execute(buildAgentPrompt(preset.systemPrompt, prompt, history, {
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      boundDirs: workspace?.boundDirs,
    }), agentService.resolveWorkingDir(workspaceId, preset), {
      maxTurns: 100,
      mcpServers,
      skills,
      configDir,
      sandboxDirs: preset.sandboxDirs,
      onEvent: (event) => {
        if (event.type === 'tool_use') {
          const detailId = buildToolDetailId(event.id, event.line);
          toolUseDetailIds.set(event.id, detailId);
          toolDetails.set(detailId, {
            id: detailId,
            workspaceId,
            channelId,
            messageId: pending.id,
            title: summarizeToolLine(event.line, workspace?.boundDirs?.[0]).title,
            raw: event.line,
            input: event.input,
            createdAt: new Date().toISOString(),
          });
          saveToolDetails(workspaceId, channelId, Array.from(toolDetails.values()));
          return;
        }
        if (event.type === 'tool_result') {
          const detail = findToolDetailForResult(event.toolUseId, event.result, toolUseDetailIds, toolDetails, workspace?.boundDirs?.[0]);
          if (detail) {
            detail.output = event.result;
            detail.updatedAt = new Date().toISOString();
            saveToolDetails(workspaceId, channelId, [detail]);
          }
          return;
        }
        if (event.type !== 'output') return;
        liveOutput.push(event.line);
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: event.line });
        broadcastLiveParts();
      },
    });
    broadcastLiveParts(true);
    if (activeRun.stopped) return;

    if (liveOutput.length === 0) {
      for (const line of result.output) {
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: line });
      }
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

    const displayOutput = liveOutput.length > 0 ? liveOutput : result.output;
    const reply = updateMessage(workspaceId, channelId, pending.id, {
      content: result.success ? displayOutput.join('\n') : result.error || displayOutput.join('\n'),
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
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        output: displayOutput,
        toolDetails,
        success: result.success,
        error: result.error,
      }),
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } catch (err) {
    if (activeRun?.stopped) return;
    const error = err instanceof Error ? err.message : String(err);
    agentService.complete(workspaceId, session.id, error);
    broadcastToWorkspace(workspaceId, 'agent.error', { agentId: session.id, error });
    const reply = updateMessage(workspaceId, channelId, pending.id, {
      content: error,
      type: 'text',
      status: 'error',
      parts: buildAgentMessageParts({
        sessionId: session.id,
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        output: [error],
        toolDetails: new Map(),
        success: false,
        error,
      }),
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } finally {
    untrackChannelRun(workspaceId, channelId, session.id);
  }
}

function channelRunKey(workspaceId: string, channelId: string): string {
  return `${workspaceId}:${channelId}`;
}

function trackChannelRun(workspaceId: string, channelId: string, run: ActiveChannelRun): void {
  const key = channelRunKey(workspaceId, channelId);
  const runs = activeChannelRuns.get(key) ?? new Map<string, ActiveChannelRun>();
  runs.set(run.agentId, run);
  activeChannelRuns.set(key, runs);
}

function untrackChannelRun(workspaceId: string, channelId: string, agentId: string): void {
  const key = channelRunKey(workspaceId, channelId);
  const runs = activeChannelRuns.get(key);
  if (!runs) return;
  runs.delete(agentId);
  if (runs.size === 0) activeChannelRuns.delete(key);
}

function stopChannelRuns(workspaceId: string, channelId: string): void {
  const runs = activeChannelRuns.get(channelRunKey(workspaceId, channelId));
  if (!runs || runs.size === 0) {
    markInactiveChannelRunsStopped(workspaceId, channelId);
    return;
  }

  for (const run of runs.values()) {
    run.stopped = true;
    run.runtime.stop();
    agentService.complete(workspaceId, run.agentId, 'Stopped by user');
    broadcastToWorkspace(workspaceId, 'agent.status_changed', {
      agentId: run.agentId,
      from: 'active',
      to: 'crashed',
    });
    broadcastToWorkspace(workspaceId, 'agent.error', {
      agentId: run.agentId,
      error: 'Stopped by user',
    });

    const message = updateMessage(workspaceId, channelId, run.messageId, {
      content: 'Stopped by user',
      status: 'error',
      parts: [
        {
          id: `terminal-stopped-${run.agentId}`,
          type: 'terminal',
          output: 'Stopped by user',
          status: 'error',
        },
      ],
    });
    if (message) broadcastToWorkspace(workspaceId, 'channel.message.updated', message);
  }
}

export function hasActiveChannelRuns(workspaceId: string, channelId: string): boolean {
  return Boolean(activeChannelRuns.get(channelRunKey(workspaceId, channelId))?.size);
}

export function markInactiveChannelRunsStopped(workspaceId: string, channelId: string): Message[] {
  if (hasActiveChannelRuns(workspaceId, channelId)) return [];

  const stopped: Message[] = [];
  for (const message of listMessages(workspaceId, channelId)) {
    if (message.status !== 'pending' && message.status !== 'streaming') continue;
    const updated = updateMessage(workspaceId, channelId, message.id, {
      content: message.content || 'Stopped by user',
      status: 'error',
      parts: message.parts?.map((part) => {
        if ('status' in part && part.status === 'streaming') {
          return { ...part, status: 'completed' as const };
        }
        return part;
      }),
    });
    if (updated) {
      stopped.push(updated);
      broadcastToWorkspace(workspaceId, 'channel.message.updated', updated);
    }
  }
  return stopped;
}

function buildAgentMessageParts(input: {
  sessionId: string;
  workspaceRoot?: string;
  presetName: string;
  role: string;
  model?: string;
  systemPrompt?: string;
  mcpServers: string[];
  skills: string[];
  output: string[];
  toolDetails?: Map<string, ToolDetail>;
  success: boolean;
  error?: string;
}): MessagePart[] {
  const lines = input.output.filter((line) => line.trim());
  const finalTextIndex = findFinalTextIndex(lines);
  const finalText = finalTextIndex >= 0 ? lines[finalTextIndex] : '';
  const usage = extractUsage(lines);
  const parts: MessagePart[] = [];

  const chainItems = buildChainItems(lines, finalTextIndex, finalText, input.workspaceRoot, input.toolDetails);

  if (chainItems.length > 0) {
    parts.push({
      id: `chain-${input.sessionId}`,
      type: 'chain',
      chains: chainItems,
    });
  }

  for (const subagent of extractSubagentBlocks(lines, input.sessionId)) {
    parts.push(subagent);
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

function findFinalTextIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (isFinalAnswerLine(line)) return index;
  }
  return -1;
}

function buildChainItems(
  lines: string[],
  finalTextIndex: number,
  finalText: string,
  workspaceRoot?: string,
  toolDetails?: Map<string, ToolDetail>,
): MessageChain[] {
  let toolIndex = 0;
  let messageIndex = 0;
  const items: MessageChain[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (index === finalTextIndex) continue;
    const line = lines[index];
    if (finalText && isSameMessageText(line, finalText)) continue;
    if (isSubagentToolLine(line)) continue;
    if (isToolLikeLine(line)) {
      items.push(buildToolTodo(line, toolIndex, workspaceRoot, toolDetails));
      toolIndex += 1;
      continue;
    }
    if (isFinalAnswerLine(line)) {
      items.push({
        id: `message-${messageIndex}`,
        title: summarizeMessageTitle(line),
        text: line,
        kind: 'message',
        status: 'completed',
      });
      messageIndex += 1;
    }
  }

  return items.slice(0, 40);
}

function isSameMessageText(left: string, right: string): boolean {
  return normalizeMessageText(left) === normalizeMessageText(right);
}

function normalizeMessageText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function summarizeMessageTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'AI message';
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function isToolLikeLine(line: string): boolean {
  return /^(Using|Tool:|Read|Write|Edit|MultiEdit|Bash|Search|Grep|Glob|Todo|Task|Web|Fetch|Claude Code initialized|.+ running \(\d+s\))/i.test(line.trim());
}

function isFinalAnswerLine(line: string): boolean {
  return !isToolLikeLine(line) && !/^(\[.*\]|Agent runtime configuration:|Conversation history:)/.test(line.trim());
}

function isSubagentToolLine(line: string): boolean {
  return /^Tool:\s*Task\b/i.test(line.trim());
}

function buildToolTodo(line: string, index: number, workspaceRoot?: string, toolDetails?: Map<string, ToolDetail>): MessageChain {
  const summary = summarizeToolLine(line, workspaceRoot);
  const detailId = findToolDetailId(line, toolDetails);

  return {
    id: `tool-${index}`,
    title: summary.title,
    description: summary.description,
    status: 'completed',
    toolName: summary.toolName,
    filePath: summary.filePath,
    command: summary.command,
    detailId,
  };
}

function summarizeToolLine(line: string, workspaceRoot?: string): {
  title: string;
  description?: string;
  toolName?: string;
  filePath?: string;
  command?: string;
} {
  const trimmed = line.trim();
  const toolName = extractToolName(trimmed);
  const filePath = toWorkspaceRelativePath(
    extractQuotedField(trimmed, 'file_path') ?? extractQuotedField(trimmed, 'path'),
    workspaceRoot,
  );
  const command = extractQuotedField(trimmed, 'command') ?? extractCommand(trimmed, toolName);
  const baseName = filePath?.split(/[\\/]/).filter(Boolean).at(-1);

  if (toolName) {
    if (filePath) {
      return {
        title: `${humanizeToolName(toolName)} ${baseName ?? filePath}`,
        description: filePath,
        toolName,
        filePath,
      };
    }
    if (command) {
      return {
        title: `${humanizeToolName(toolName)} command`,
        description: command,
        toolName,
        command,
      };
    }
    const todoCount = extractTodoCount(trimmed);
    if (todoCount !== undefined) {
      return {
        title: `Update ${todoCount} ${todoCount === 1 ? 'todo' : 'todos'}`,
        toolName,
      };
    }
    return {
      title: humanizeToolName(toolName),
      toolName,
    };
  }

  return { title: trimmed };
}

function extractToolName(line: string): string | undefined {
  return line.match(/^Tool:\s*([A-Za-z][\w-]*)\b/)?.[1]
    ?? line.match(/^([A-Za-z][\w-]*)\s+running\s+\(\d+s\)/)?.[1]
    ?? line.match(/^([A-Za-z][\w-]*):?\s+/)?.[1];
}

function humanizeToolName(toolName: string): string {
  const labels: Record<string, string> = {
    Read: 'Read',
    Write: 'Write',
    Edit: 'Edit',
    MultiEdit: 'Edit',
    Bash: 'Run',
    TodoWrite: 'Update todos',
    Grep: 'Search',
    Glob: 'Find files',
    Task: 'Run subagent',
  };
  return labels[toolName] ?? toolName.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function extractQuotedField(line: string, key: string): string | undefined {
  const quoted = line.match(new RegExp(`\\b${key}=([\"'])(.*?)\\1`))?.[2];
  if (quoted) return quoted;

  const json = line.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1];
  return json;
}

function extractCommand(line: string, toolName?: string): string | undefined {
  if (!toolName || !/^(Bash|Shell|Command)$/i.test(toolName)) return undefined;
  const command = line.replace(/^Tool:\s*/i, '').replace(new RegExp(`^${toolName}:?\\s*`, 'i'), '').trim();
  return command || undefined;
}

function extractTodoCount(line: string): number | undefined {
  const matches = line.match(/"content"\s*:/g);
  return matches?.length;
}

function toWorkspaceRelativePath(path: string | undefined, workspaceRoot?: string): string | undefined {
  if (!path) return undefined;
  if (!workspaceRoot || !path.startsWith(workspaceRoot)) return path;
  return path.slice(workspaceRoot.length).replace(/^[/\\]/, '');
}

function findToolDetailId(line: string, toolDetails?: Map<string, ToolDetail>): string | undefined {
  if (!toolDetails) return undefined;
  for (const [id, detail] of toolDetails) {
    if (detail.raw === line) return id;
  }
  return undefined;
}

function findToolDetailForResult(
  toolUseId: string | undefined,
  result: unknown,
  toolUseDetailIds: Map<string, string>,
  toolDetails: Map<string, ToolDetail>,
  workspaceRoot?: string,
): ToolDetail | undefined {
  const detailId = toolUseId ? toolUseDetailIds.get(toolUseId) : undefined;
  const byId = detailId ? toolDetails.get(detailId) : undefined;
  if (byId) return byId;

  const resultFilePath = extractResultFilePath(result, workspaceRoot);
  if (resultFilePath) {
    const details = Array.from(toolDetails.values()).reverse();
    for (const detail of details) {
      if (detail.output !== undefined) continue;
      const inputFilePath = extractInputFilePath(detail.input, workspaceRoot);
      if (inputFilePath === resultFilePath) return detail;
    }
  }

  return Array.from(toolDetails.values()).reverse().find((detail) => detail.output === undefined);
}

function extractResultFilePath(result: unknown, workspaceRoot?: string): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const record = result as Record<string, unknown>;
  const file = record.file;
  if (file && typeof file === 'object') {
    const filePath = (file as Record<string, unknown>).filePath;
    if (typeof filePath === 'string') return toWorkspaceRelativePath(filePath, workspaceRoot);
  }
  const filePath = record.filePath;
  if (typeof filePath === 'string') return toWorkspaceRelativePath(filePath, workspaceRoot);
  return undefined;
}

function extractInputFilePath(input: unknown, workspaceRoot?: string): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const filePath = record.file_path ?? record.path;
  return typeof filePath === 'string' ? toWorkspaceRelativePath(filePath, workspaceRoot) : undefined;
}

function buildToolDetailId(id: string, line: string): string {
  const key = `${id}:${line}`;
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return `tool-${Math.abs(hash).toString(36)}`;
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

function extractSubagentBlocks(lines: string[], sessionId: string): MessagePart[] {
  return lines
    .map((line, index): MessagePart | null => {
      const match = line.match(/^Tool:\s*Task\b\s*(.*)$/i);
      if (!match) return null;
      const name = line.match(/\bdescription=(["'])(.*?)\1/i)?.[2] || `Subagent ${index + 1}`;
      const prompt = line.match(/\bprompt=(["'])(.*?)\1/i)?.[2];
      return {
        id: `subagent-${sessionId}-${index}`,
        type: 'subagent',
        name,
        instructions: prompt,
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
