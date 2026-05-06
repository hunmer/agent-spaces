import type { WebSocket } from 'ws';
import type { Channel, MessageChain, WSEvent, ClientEventName, Message, MessagePart, MessageTokenUsage } from '@agent-spaces/shared';
import { addConnection, broadcastToWorkspace } from './connection-manager.js';
import { handleTerminalEvent } from './terminal-handler.js';
import { createMessage, updateMessage, listMessages } from '../services/message.js';
import { getChannel, updateChannel } from '../services/channel.js';
import * as issueService from '../services/issue.js';
import { createIssueFunctionTools } from '../services/builtin-tools.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import * as wsService from '../services/workspace.js';
import { runPlanner } from '../agents/planner-agent.js';
import type { AgentContext } from '../agents/agent-context.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime } from '../adapters/agent-runtime-types.js';
import { saveToolDetails } from '../services/tool-detail.js';
import type { ToolDetail } from '../services/tool-detail.js';
import { readWorkspacePrompt } from '../services/workspace-prompt.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';

type EventHandler = (ws: WebSocket, workspaceId: string, data: unknown) => void;

const handlers = new Map<string, EventHandler>();

// Track which workspaces have schedulers running
const activeSchedulers = new Set<string>();
const activeChannelRuns = new Map<string, Map<string, ActiveChannelRun>>();
const pendingQuestionRuns = new Map<string, PendingQuestionRun>();

interface ActiveChannelRun {
  agentId: string;
  agentConfigId: string;
  messageId: string;
  runtime: AgentRuntime;
  stopped?: boolean;
}

interface PendingAskUserQuestion {
  id: string;
  toolUseId?: string;
  question: string;
  choices: string[];
  answer?: string;
}

interface PendingQuestionRun {
  agentConfigId: string;
  question: string;
}

interface RunMentionedAgentOptions {
  messageId?: string;
  seedOutput?: string[];
  seedQuestions?: PendingAskUserQuestion[];
}

function ensureScheduler(workspaceId: string, ctx: AgentContext) {
  if (!activeSchedulers.has(workspaceId)) {
    activeSchedulers.add(workspaceId);
    setTimeout(() => {
      startScheduler(workspaceId, ctx);
      console.log(`[ws] scheduler started for workspace ${workspaceId}`);
    }, 10_000);
    console.log(`[ws] scheduler scheduled for workspace ${workspaceId} in 10000ms`);
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

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
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

registerHandler('channel.answer_question', (_ws, workspaceId, data) => {
  const { channelId, messageId, questionId, answer } = data as {
    channelId?: string;
    messageId?: string;
    questionId?: string;
    answer?: string;
  };
  const trimmed = answer?.trim();
  if (!channelId || !messageId || !questionId || !trimmed) return;

  const message = listMessages(workspaceId, channelId).find((item) => item.id === messageId);
  if (!message) return;

  const updatedParts = message.parts?.map((part) => {
    if (part.type !== 'ask_user_question' || part.id !== questionId) return part;
    return { ...part, status: 'answered' as const, answer: trimmed };
  });
  const updated = updateMessage(workspaceId, channelId, messageId, {
    status: 'streaming',
    parts: updatedParts,
  });
  if (updated) broadcastToWorkspace(workspaceId, 'channel.message.updated', updated);

  const key = questionRunKey(workspaceId, channelId, messageId, questionId);
  const pending = pendingQuestionRuns.get(key);
  pendingQuestionRuns.delete(key);
  if (!pending) return;

  const seedQuestion = questionFromAnsweredPart(updatedParts, questionId);
  void runMentionedAgent(
    workspaceId,
    channelId,
    pending.agentConfigId,
    [
      'The user answered your previous question.',
      `Question: ${pending.question}`,
      `Answer: ${trimmed}`,
      'Continue from this answer and complete the original task.',
    ].join('\n'),
    {
      messageId,
      seedOutput: normalizeOutputLines([message.content]),
      seedQuestions: seedQuestion ? [seedQuestion] : [],
    },
  );
});

async function runMentionedAgent(
  workspaceId: string,
  channelId: string,
  agentConfigId: string,
  prompt: string,
  options: RunMentionedAgentOptions = {},
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
  const { channel, issue } = resolveIssueChannelContext(workspaceId, channelId);
  const functionTools = createIssueFunctionTools(workspaceId, channel, {
    senderId: preset.id,
    senderRole: preset.role,
  }, preset.tools);
  const startTime = Date.now();
  const existingMessage = options.messageId
    ? listMessages(workspaceId, channelId).find((message) => message.id === options.messageId)
    : undefined;
  const pending = existingMessage
    ? updateMessage(workspaceId, channelId, existingMessage.id, {
      status: 'streaming',
      metadata: {
        ...existingMessage.metadata,
        agentSessionId: session.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        duration: 0,
      },
    }) ?? existingMessage
    : createMessage(workspaceId, channelId, {
      senderId: preset.id,
      senderRole: preset.role,
      content: 'Agent is processing...',
      type: 'text',
      status: 'streaming',
      metadata: {
        agentSessionId: session.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        duration: 0,
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
  broadcastToWorkspace(workspaceId, existingMessage ? 'channel.message.updated' : 'channel.message', pending);

  let activeRun: ActiveChannelRun | undefined;
  const liveReasoning: Array<{ text: string; status?: 'streaming' | 'completed' }> = [];
  try {
    const runtime = createAgentRuntime({
      kind: preset.runtimeKind,
      provider: preset.modelProvider,
      model: preset.modelId,
      apiKey: preset.apiKey,
      baseURL: getRuntimeBaseURL(preset.modelProvider, preset.apiBase),
      adapterBaseURL: preset.apiBase,
      ...getThinkingRuntimeConfig(preset),
    });
    activeRun = {
      agentId: session.id,
      agentConfigId,
      messageId: pending.id,
      runtime,
    };
    trackChannelRun(workspaceId, channelId, activeRun);
    const history = listMessages(workspaceId, channelId, { limit: 20 });
    const liveOutput: string[] = [...(options.seedOutput ?? [])];
    const askUserQuestions: PendingAskUserQuestion[] = [...(options.seedQuestions ?? [])];
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
        builtInTools: buildBuiltInTools(functionTools, channel, issue),
        output: liveOutput,
        reasoning: liveReasoning,
        toolDetails,
        askUserQuestions,
        success: true,
      });
      if (parts.length === 0) return;

      const status = askUserQuestions.some((question) => !question.answer) ? 'waiting_for_user' : 'streaming';
      const live = updateMessage(workspaceId, channelId, pending.id, {
        content: liveOutput.join('\n') || pending.content,
        status,
        parts,
        metadata: {
          ...pending.metadata,
          duration: Date.now() - startTime,
        },
      });
      if (live) broadcastToWorkspace(workspaceId, 'channel.message.updated', live);
    };
    const result = await runtime.execute(buildAgentPrompt(workspaceId, preset.systemPrompt, prompt, history, {
      mcpServers: Object.keys(mcpServers ?? {}),
      skills,
      boundDirs: workspace?.boundDirs,
      builtInTools: buildBuiltInTools(functionTools, channel, issue),
    }), agentService.resolveWorkingDir(workspaceId, preset), {
      maxTurns: 100,
      functionTools,
      mcpServers,
      skills,
      configDir,
      sandboxDirs: preset.sandboxDirs,
      onEvent: (event) => {
        if (event.type === 'reasoning') {
          liveReasoning.push({ text: event.text, status: event.status });
          broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: event.text });
          broadcastLiveParts();
          return;
        }
        if (event.type === 'tool_use') {
          if (event.name === 'AskUserQuestion') {
            const question = parseAskUserQuestion(event.id, event.input);
            askUserQuestions.push(question);
            pendingQuestionRuns.set(questionRunKey(workspaceId, channelId, pending.id, question.id), {
              agentConfigId,
              question: question.question,
            });
            broadcastLiveParts(true);
            return;
          }
          // Intercept TodoWrite to persist todos to channel
          if (event.name === 'TodoWrite' && event.input && typeof event.input === 'object') {
            const input = event.input as { todos?: unknown[] };
            if (Array.isArray(input.todos)) {
              const todos = input.todos.map((t: any, index) => ({
                id: String(t.id ?? t.activeForm ?? t.subject ?? t.title ?? t.content ?? index),
                subject: String(t.subject ?? t.title ?? t.activeForm ?? t.content ?? ''),
                description: t.description || t.content ? String(t.description ?? t.content) : undefined,
                status: (['pending', 'in_progress', 'completed'].includes(t.status) ? t.status : 'pending') as 'pending' | 'in_progress' | 'completed',
                activeForm: t.activeForm ? String(t.activeForm) : undefined,
              }));
              const updated = updateChannel(workspaceId, channelId, { todos });
              if (updated) broadcastToWorkspace(workspaceId, 'channel.updated', updated);
            }
          }
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
          liveOutput.push(event.line);
          broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: event.line });
          broadcastLiveParts();
          return;
        }
        if (event.type === 'tool_result') {
          const askedQuestion = event.toolUseId
            ? askUserQuestions.find((question) => question.toolUseId === event.toolUseId)
            : undefined;
          if (askedQuestion) return;
          const detail = findToolDetailForResult(event.toolUseId, event.result, toolUseDetailIds, toolDetails, workspace?.boundDirs?.[0]);
          if (detail && isAgentSpacesIssueTool(detail.raw || detail.title)) {
            const updatedChannel = getChannel(workspaceId, channelId);
            if (updatedChannel) broadcastToWorkspace(workspaceId, 'channel.updated', updatedChannel);
            const updatedIssue = updatedChannel?.issueId ? issueService.getById(workspaceId, updatedChannel.issueId) : null;
            if (updatedIssue) {
              broadcastToWorkspace(
                workspaceId,
                isCreateCurrentChannelIssueTool(detail.raw || detail.title) ? 'issue.created' : 'issue.updated',
                updatedIssue,
              );
            }
          }
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

    const displayOutput = mergeRuntimeOutput(liveOutput, result.output);
    if (shouldWaitForUserAnswer(askUserQuestions, result.summary, result.error, displayOutput)) {
      const waitingOutput = stripAskUserQuestionErrorLines(liveOutput);
      const waiting = updateMessage(workspaceId, channelId, pending.id, {
        content: waitingOutput.join('\n') || pending.content,
        type: 'text',
        status: 'waiting_for_user',
        metadata: {
          agentSessionId: session.id,
          runtime: preset.runtimeKind,
          model: preset.modelId,
          summary: 'Waiting for user answer',
          duration: Date.now() - startTime,
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
          output: waitingOutput,
          reasoning: liveReasoning,
          toolDetails,
          askUserQuestions,
          success: true,
        }),
      });
      if (waiting) broadcastToWorkspace(workspaceId, 'channel.message.updated', waiting);
      agentService.updateStatus(workspaceId, session.id, 'blocked');
      broadcastToWorkspace(workspaceId, 'agent.status_changed', {
        agentId: session.id,
        from: 'active',
        to: 'blocked',
      });
      return;
    }

    if (liveOutput.length === 0) {
      for (const line of result.output) {
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: line });
      }
    }

    agentService.complete(workspaceId, session.id, result.success ? undefined : result.error, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: displayOutput,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
    });
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
      content: result.success ? displayOutput.join('\n') : result.error || displayOutput.join('\n'),
      type: 'text',
      status: result.success ? 'completed' : 'error',
      metadata: {
        agentSessionId: session.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        summary: result.summary,
        duration: Date.now() - startTime,
      },
      parts: buildAgentMessageParts({
        sessionId: session.id,
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        model: preset.modelId,
        usage: result.usage,
        systemPrompt: preset.systemPrompt,
        mcpServers: Object.keys(mcpServers ?? {}),
        skills,
        builtInTools: buildBuiltInTools(functionTools, channel, issue),
        output: displayOutput,
        reasoning: liveReasoning,
        toolDetails,
        askUserQuestions,
        success: result.success,
        error: result.error,
      }),
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } catch (err) {
    if (activeRun?.stopped) return;
    const error = err instanceof Error ? err.message : String(err);
    agentService.complete(workspaceId, session.id, error, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: error,
      output: [error],
      durationMs: Date.now() - startTime,
    });
    broadcastToWorkspace(workspaceId, 'agent.error', { agentId: session.id, error });
    const reply = updateMessage(workspaceId, channelId, pending.id, {
      content: error,
      type: 'text',
      status: 'error',
      metadata: {
        agentSessionId: session.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        duration: Date.now() - startTime,
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
        builtInTools: buildBuiltInTools(functionTools, channel, issue),
        output: [error],
        reasoning: liveReasoning,
        toolDetails: new Map(),
        askUserQuestions: [],
        success: false,
        error,
      }),
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } finally {
    untrackChannelRun(workspaceId, channelId, session.id);
  }
}

function resolveIssueChannelContext(
  workspaceId: string,
  channelId: string,
): { channel: Channel | undefined; issue: ReturnType<typeof issueService.getById> } {
  let channel = getChannel(workspaceId, channelId);
  let issue = channel?.issueId ? issueService.getById(workspaceId, channel.issueId) : null;
  if (issue || channel?.type !== 'issue') return { channel, issue };

  issue = issueService.list(workspaceId).find((item) => item.channelId === channelId) ?? null;
  channel = getChannel(workspaceId, channelId);
  return { channel, issue };
}

function isAgentSpacesIssueTool(name: string | undefined): boolean {
  return Boolean(name && /(?:agent-spaces\.)?(?:CreateCurrentChannelIssue|ViewCurrentChannelIssue|AddCurrentChannelComment)/.test(name));
}

function isCreateCurrentChannelIssueTool(name: string | undefined): boolean {
  return Boolean(name && /(?:agent-spaces\.)?CreateCurrentChannelIssue/.test(name));
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
  usage?: MessageTokenUsage;
  systemPrompt?: string;
  mcpServers: string[];
  skills: string[];
  builtInTools?: BuiltInToolContext[];
  output: string[];
  reasoning?: Array<{ text: string; status?: 'streaming' | 'completed' }>;
  toolDetails?: Map<string, ToolDetail>;
  askUserQuestions?: PendingAskUserQuestion[];
  success: boolean;
  error?: string;
}): MessagePart[] {
  const lines = normalizeOutputLines(input.output);
  const finalTextRange = findFinalTextRange(lines);
  const finalText = finalTextRange
    ? collapseRepeatedTextBlock(lines.slice(finalTextRange.start, finalTextRange.end + 1)).join('\n').trim()
    : '';
  const usage = input.usage ?? extractUsage(lines);
  const parts: MessagePart[] = [];

  const chainItems = buildChainItems(lines, finalTextRange, finalText, input.workspaceRoot, input.toolDetails);

  const reasoningText = normalizeReasoningText(input.reasoning);
  if (reasoningText) {
    parts.push({
      id: `reasoning-${input.sessionId}`,
      type: 'reasoning',
      text: reasoningText,
      status: input.success ? 'completed' : 'streaming',
    });
  }

  if (chainItems.length > 0) {
    parts.push({
      id: `chain-${input.sessionId}`,
      type: 'chain',
      chains: chainItems,
    });
  }

  for (const subagent of extractSubagentBlocks(lines, input.sessionId, input.toolDetails)) {
    parts.push(subagent);
  }

  for (const question of input.askUserQuestions ?? []) {
    parts.push({
      id: question.id,
      type: 'ask_user_question',
      question: question.question,
      choices: question.choices,
      status: question.answer ? 'answered' : 'requested',
      answer: question.answer,
      toolUseId: question.toolUseId,
    });
  }

  if (hasTokenUsage(usage)) {
    parts.push({
      id: `context-${input.sessionId}`,
      type: 'context',
      usedTokens: getTotalTokens(usage),
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

function normalizeReasoningText(reasoning?: Array<{ text: string }>): string {
  if (!reasoning?.length) return '';
  return collapseRepeatedTextBlock(
    reasoning
      .map((item) => item.text.trim())
      .filter(Boolean),
  ).join('\n\n').trim();
}

function hasTokenUsage(usage: MessageTokenUsage): boolean {
  return Boolean(usage.totalTokens || usage.inputTokens || usage.outputTokens || usage.cachedInputTokens || usage.reasoningTokens);
}

function getTotalTokens(usage: MessageTokenUsage): number {
  return usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0) + (usage.cachedInputTokens ?? 0) + (usage.reasoningTokens ?? 0);
}

function normalizeOutputLines(output: string[]): string[] {
  const lines = output
    .flatMap((line) => line.split(/\r?\n/))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  const seenInitLines = new Set<string>();
  return lines.filter((line) => {
    if (!/^Claude Code initialized\b/i.test(line)) return true;
    if (seenInitLines.has(line)) return false;
    seenInitLines.add(line);
    return true;
  });
}

function mergeRuntimeOutput(liveOutput: string[], resultOutput: string[]): string[] {
  if (liveOutput.length === 0) return resultOutput;
  const finalResult = resultOutput.at(-1)?.trim();
  if (!finalResult) return liveOutput;
  if (liveOutput.some((line) => normalizeMessageText(line) === normalizeMessageText(finalResult))) {
    return liveOutput;
  }
  return [...liveOutput, finalResult];
}

function collapseRepeatedTextBlock(lines: string[]): string[] {
  let next = [...lines];

  while (next.length > 1 && next.length % 2 === 0) {
    const middle = next.length / 2;
    const first = next.slice(0, middle);
    const second = next.slice(middle);
    if (!sameTextBlock(first, second)) break;
    next = first;
  }

  return next;
}

function sameTextBlock(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return normalizeMessageText(left.join('\n')) === normalizeMessageText(right.join('\n'));
}

function findFinalTextRange(lines: string[]): { start: number; end: number } | null {
  let end = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (isFinalAnswerLine(lines[index])) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;

  let start = end;
  for (let index = end - 1; index >= 0; index -= 1) {
    if (!isFinalAnswerLine(lines[index])) break;
    start = index;
  }
  return { start, end };
}

function buildChainItems(
  lines: string[],
  finalTextRange: { start: number; end: number } | null,
  finalText: string,
  workspaceRoot?: string,
  toolDetails?: Map<string, ToolDetail>,
): MessageChain[] {
  let toolIndex = 0;
  let messageIndex = 0;
  const items: MessageChain[] = [];
  const toolDetailMatchCounts = new Map<string, number>();
  let messageBuffer: string[] = [];

  const flushMessageBuffer = () => {
    if (messageBuffer.length === 0) return;
    const text = messageBuffer.join('\n').trim();
    if (text) {
      items.push({
        id: `message-${messageIndex}`,
        title: summarizeMessageTitle(text),
        text,
        kind: 'message',
        status: 'completed',
      });
      messageIndex += 1;
    }
    messageBuffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (finalTextRange && index >= finalTextRange.start && index <= finalTextRange.end) continue;
    const line = lines[index];
    if (finalText && isSameMessageText(line, finalText)) continue;
    if (isSubagentToolLine(line)) continue;
    if (isToolLikeLine(line)) {
      flushMessageBuffer();
      items.push(buildToolTodo(line, toolIndex, workspaceRoot, toolDetails, toolDetailMatchCounts));
      toolIndex += 1;
      continue;
    }
    if (isFinalAnswerLine(line)) {
      messageBuffer.push(line);
    }
  }
  flushMessageBuffer();

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
  return /^(Using|Tool:|Read|Write|Edit|MultiEdit|Bash|Search|Grep|Glob|Todo|Task|Web|Fetch|Claude Code initialized|Codex initialized|.+ running \(\d+s\))/i.test(line.trim());
}

function isFinalAnswerLine(line: string): boolean {
  return !isToolLikeLine(line) && !/^(\[.*\]|Agent runtime configuration:|Conversation history:)/.test(line.trim());
}

function isSubagentToolLine(line: string): boolean {
  return /^Tool:\s*Task\b/i.test(line.trim());
}

function buildToolTodo(
  line: string,
  index: number,
  workspaceRoot?: string,
  toolDetails?: Map<string, ToolDetail>,
  toolDetailMatchCounts?: Map<string, number>,
): MessageChain {
  const summary = summarizeToolLine(line, workspaceRoot);
  const detailId = findToolDetailId(line, toolDetails, toolDetailMatchCounts);

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
  const inputDescription = extractQuotedField(trimmed, 'description');
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
        description: inputDescription ?? filePath,
        toolName,
        filePath,
      };
    }
    if (command) {
      return {
        title: `${humanizeToolName(toolName)} command`,
        description: inputDescription,
        toolName,
        command,
      };
    }
    // Glob/Grep/Search: extract path + pattern + glob for header
    const searchSummary = extractSearchParams(trimmed, toolName, workspaceRoot);
    if (searchSummary) {
      return { ...searchSummary, toolName };
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

function extractSearchParams(
  line: string,
  toolName: string,
  workspaceRoot?: string,
): { title: string; description?: string } | null {
  if (!/^(Glob|Grep|Search|SemanticSearch|WebSearch|WebFetch|Fetch)$/i.test(toolName)) return null;

  const pattern = extractQuotedField(line, 'pattern') ?? extractQuotedField(line, 'query');
  const glob = extractQuotedField(line, 'glob');
  const searchPath = toWorkspaceRelativePath(extractQuotedField(line, 'path'), workspaceRoot);
  const url = extractQuotedField(line, 'url');
  const label = humanizeToolName(toolName);

  // WebSearch/WebFetch/Fetch: show url or query
  if (/^(WebSearch|WebFetch|Fetch)$/i.test(toolName)) {
    if (url) return { title: `${label} ${truncate(url, 60)}` };
    if (pattern) return { title: `${label} ${truncate(pattern, 60)}` };
    return { title: label };
  }

  // Glob: "Find files **/*.ts in src/components"
  if (/^Glob$/i.test(toolName)) {
    const parts: string[] = [];
    if (pattern) parts.push(truncate(pattern, 50));
    else if (glob) parts.push(truncate(glob, 50));
    const title = parts.length ? `${label} ${parts.join(' ')}` : label;
    const descParts: string[] = [];
    if (pattern && glob) descParts.push(`glob: ${glob}`);
    if (searchPath) descParts.push(`in ${searchPath}`);
    return { title, description: descParts.length ? descParts.join(', ') : undefined };
  }

  // Grep/Search/SemanticSearch: "Search pomodoro|timer in src/"
  const parts: string[] = [];
  if (pattern) parts.push(truncate(pattern, 40));
  const title = parts.length ? `${label} ${parts.join(' ')}` : label;
  const descParts: string[] = [];
  if (glob) descParts.push(`glob: ${glob}`);
  if (searchPath) descParts.push(`in ${searchPath}`);
  return { title, description: descParts.length ? descParts.join(', ') : undefined };
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
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
    Search: 'Search',
    SemanticSearch: 'Semantic search',
    WebSearch: 'Web search',
    WebFetch: 'Fetch',
    Fetch: 'Fetch',
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

function findToolDetailId(
  line: string,
  toolDetails?: Map<string, ToolDetail>,
  matchCounts?: Map<string, number>,
): string | undefined {
  if (!toolDetails) return undefined;
  const targetMatchIndex = matchCounts?.get(line) ?? 0;
  let matchIndex = 0;
  for (const [id, detail] of toolDetails) {
    if (detail.raw !== line) continue;
    if (matchIndex === targetMatchIndex) {
      matchCounts?.set(line, targetMatchIndex + 1);
      return id;
    }
    matchIndex += 1;
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

  if (isSubagentToolResult(result)) {
    const detail = Array.from(toolDetails.values()).reverse().find((candidate) => {
      return candidate.output === undefined && /^Tool:\s*Task\b/i.test(candidate.raw);
    });
    if (detail) return detail;
  }

  return Array.from(toolDetails.values()).reverse().find((detail) => detail.output === undefined);
}

function isSubagentToolResult(result: unknown): boolean {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  return (
    typeof record.agentId === 'string'
    || typeof record.agentType === 'string'
    || (record.status === 'completed' && Array.isArray(record.content))
  );
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

function questionRunKey(workspaceId: string, channelId: string, messageId: string, questionId: string): string {
  return `${workspaceId}:${channelId}:${messageId}:${questionId}`;
}

function parseAskUserQuestion(toolUseId: string, input: unknown): PendingAskUserQuestion {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const first = rawQuestions.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
  const question = typeof first?.question === 'string' && first.question.trim()
    ? first.question.trim()
    : '请选择一个选项：';
  const options = Array.isArray(first?.options) ? first.options : [];
  const choices = options
    .map((option) => {
      if (typeof option === 'string') return option;
      if (!option || typeof option !== 'object') return '';
      const value = option as Record<string, unknown>;
      return typeof value.label === 'string' ? value.label : '';
    })
    .filter(Boolean);

  return {
    id: `ask-user-${toolUseId}`,
    toolUseId,
    question,
    choices,
  };
}

function questionFromAnsweredPart(parts: Message['parts'] | undefined, questionId: string): PendingAskUserQuestion | undefined {
  const part = parts?.find((item) => item.type === 'ask_user_question' && item.id === questionId);
  if (!part || part.type !== 'ask_user_question') return undefined;
  return {
    id: part.id,
    toolUseId: part.toolUseId,
    question: part.question,
    choices: part.choices ?? [],
    answer: part.answer,
  };
}

function shouldWaitForUserAnswer(
  questions: PendingAskUserQuestion[],
  summary: string | undefined,
  error: string | undefined,
  output: string[],
): boolean {
  if (!questions.some((question) => !question.answer)) return false;
  if (summary === 'Waiting for user answer') return true;
  const text = [error ?? '', ...output].join('\n');
  return !text.trim() || isAskUserQuestionError(text);
}

function stripAskUserQuestionErrorLines(output: string[]): string[] {
  return output.filter((line) => !isAskUserQuestionError(line));
}

function isAskUserQuestionError(error: string): boolean {
  return /Answer questions\?/i.test(error);
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

function extractSubagentBlocks(
  lines: string[],
  sessionId: string,
  toolDetails?: Map<string, ToolDetail>,
): MessagePart[] {
  const matchCounts = new Map<string, number>();
  return lines
    .map((line, index): MessagePart | null => {
      const match = line.match(/^Tool:\s*Task\b\s*(.*)$/i);
      if (!match) return null;
      const name = line.match(/\bdescription=(["'])(.*?)\1/i)?.[2] || `Subagent ${index + 1}`;
      const prompt = line.match(/\bprompt=(["'])(.*?)\1/i)?.[2];
      const detailId = findToolDetailId(line, toolDetails, matchCounts);
      const detail = detailId ? toolDetails?.get(detailId) : undefined;
      const output = stringifySubagentOutput(detail?.output);
      return {
        id: `subagent-${sessionId}-${index}`,
        type: 'subagent',
        name,
        instructions: prompt,
        output,
      };
    })
    .filter((part): part is MessagePart => Boolean(part));
}

function stringifySubagentOutput(output: unknown): string | undefined {
  if (output === undefined || output === null) return undefined;
  if (typeof output === 'string') return output.trim() || undefined;
  if (Array.isArray(output)) {
    const text = output.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      return typeof record.text === 'string' ? [record.text] : [];
    }).join('\n').trim();
    return text || undefined;
  }
  if (typeof output === 'object') {
    const record = output as Record<string, unknown>;
    if (typeof record.result === 'string' && record.result.trim()) return record.result.trim();
    if (typeof record.summary === 'string' && record.summary.trim()) return record.summary.trim();
    if (Array.isArray(record.content)) return stringifySubagentOutput(record.content);
  }
  return undefined;
}

function buildAgentPrompt(
  workspaceId: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  history: Message[] = [],
  runtimeConfig?: {
    mcpServers: string[];
    skills: string[];
    boundDirs?: string[];
    builtInTools?: BuiltInToolContext[];
  },
): string {
  const parts: string[] = [];
  const trimmedSystemPrompt = systemPrompt?.trim();
  if (trimmedSystemPrompt) parts.push(trimmedSystemPrompt);

  if (runtimeConfig) {
    const configLines = [
      'Agent runtime configuration:',
      `- MCP servers configured for this agent: ${runtimeConfig.mcpServers.length ? runtimeConfig.mcpServers.join(', ') : 'none'}`,
      `- Skills configured for this agent: ${runtimeConfig.skills.length ? runtimeConfig.skills.join(', ') : 'none'}`,
      '- Runtime tools available through Claude Code: Read, Write, Edit, MultiEdit, Bash, Grep, Glob, Task, TodoWrite, WebFetch, WebSearch',
      `- Agent Spaces channel tools configured for this channel: ${runtimeConfig.builtInTools?.length ? runtimeConfig.builtInTools.map((tool) => tool.name).join(', ') : 'none'}`,
    ];
    if (runtimeConfig.boundDirs?.length) {
      configLines.push(`- Code directories (boundDirs): ${runtimeConfig.boundDirs.join(', ')}`);
    }
    configLines.push('- For Bash commands that create or modify files under the current working directory, use relative paths such as `mkdir -p css js` instead of absolute paths.');
    if (runtimeConfig.builtInTools?.length) {
      configLines.push(...formatBuiltInToolContext(runtimeConfig.builtInTools));
    }
    if (isIssueContextLookup(userPrompt)) {
      configLines.push(
        'Current issue lookup rule:',
        '- The user is asking for the current channel issue.',
        '- If Agent Spaces channel tools include ViewCurrentChannelIssue, call that function tool first and answer from the tool result.',
        '- Do not use Bash, Glob, Grep, or project files to infer the current channel issue.',
        '- If ViewCurrentChannelIssue is not configured but CreateCurrentChannelIssue is configured, say this channel is not bound to an issue yet.',
        '- If no Agent Spaces channel issue tool is configured, say the issue tool is unavailable.',
      );
    }
    configLines.push('When asked what MCP servers, skills, runtime tools, or Agent Spaces channel tools you have, answer from this configuration only. Do not infer availability from provider-side function names or hidden runtime internals.');
    parts.push(configLines.join('\n'));
  }

  if (history.length > 0) {
    parts.push('Conversation history:');
    for (const msg of history) {
      const role = msg.senderId === 'user' ? 'User' : (msg.senderRole || 'Agent');
      parts.push(`[${role}]: ${stripHtml(msg.content)}`);
    }
  }

  parts.push(`User message:\n${userPrompt}`);
  return prependWorkspacePrompt(workspaceId, parts.join('\n\n'));
}

function prependWorkspacePrompt(workspaceId: string, prompt: string): string {
  const workspacePrompt = readWorkspacePrompt(workspaceId).trim();
  if (!workspacePrompt) return prompt;
  return `${workspacePrompt}\n\n${prompt}`;
}

function isIssueContextLookup(userPrompt: string): boolean {
  const text = stripHtml(userPrompt).toLowerCase();
  return /当前频道.*议题|议题内容|current channel.*issue|issue.*current channel/.test(text);
}

interface BuiltInToolContext {
  name: string;
  description: string;
  channelId?: string;
  issueId?: string;
  issueTitle?: string;
}

function buildBuiltInTools(
  functionTools: ReturnType<typeof createIssueFunctionTools>,
  channel: ReturnType<typeof getChannel>,
  issue: ReturnType<typeof issueService.getById>,
): BuiltInToolContext[] {
  if (!functionTools.length || !channel) return [];

  const issueTitle = issue?.title ?? channel.name;
  return functionTools.map((functionTool) => ({
    name: functionTool.name,
    description: functionTool.description,
    channelId: channel.id,
    issueId: channel.issueId,
    issueTitle,
  }));
}

function formatBuiltInToolContext(tools: BuiltInToolContext[]): string[] {
  const firstTool = tools[0];
  const firstIssueTool = tools.find((tool) => tool.issueId);
  const lines = [
    'Built-in issue tool rules:',
    '- These are real function-call tools exposed through the agent-spaces MCP server.',
    '- Tool calls must use the current channel id.',
  ];
  if (firstTool?.channelId) lines.push(`- Current channel id: ${firstTool.channelId}`);
  if (firstIssueTool?.issueId) {
    lines.push(`- Current channel issue id: ${firstIssueTool.issueId}`);
    lines.push(`- Current channel issue title: ${firstIssueTool.issueTitle || 'Untitled issue'}`);
  } else {
    lines.push('- Current channel is not bound to an issue yet. Use CreateCurrentChannelIssue before viewing or commenting.');
  }
  for (const tool of tools) {
    lines.push(`- ${tool.name}: ${tool.description}`);
  }
  return lines;
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
