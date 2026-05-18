import type { WebSocket } from 'ws';
import type { Channel, Message, MessageAgentOutputItem } from '@agent-spaces/shared';
import { broadcastToWorkspace } from './connection-manager.js';
import { createMessage, updateMessage, listMessages } from '../services/message.js';
import { getChannel, updateChannel } from '../services/channel.js';
import * as issueService from '../services/issue.js';
import { createIssueFunctionTools, createCommandFunctionTools } from '../services/builtin-tools.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import * as wsService from '../services/workspace.js';
import type { AgentContext } from '../agents/agent-context.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime } from '../adapters/agent-runtime-types.js';
import { saveToolDetails } from '../services/tool-detail.js';
import type { ToolDetail } from '../services/tool-detail.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { buildAgentMessageParts, normalizeOutputLines, mergeRuntimeOutput, buildToolDetailId, summarizeToolLine, findToolDetailForResult } from './message-parts.js';
import type { PendingAskUserQuestion } from './message-parts.js';
import { buildAgentPrompt, buildBuiltInTools } from './agent-prompt.js';
import type { BuiltInToolContext } from './agent-prompt.js';

interface ActiveChannelRun {
  agentId: string;
  agentConfigId: string;
  messageId: string;
  runtime: AgentRuntime;
  stopped?: boolean;
}

interface PendingQuestionRun {
  agentConfigId: string;
  question: string;
}

interface RunMentionedAgentOptions {
  messageId?: string;
  seedOutput?: string[];
  seedQuestions?: PendingAskUserQuestion[];
  appendUserMessage?: string;
  excludeHistoryMessageIds?: string[];
  excludeHistoryReplyIds?: string[];
}

// --- State ---

const activeSchedulers = new Set<string>();
const activeChannelRuns = new Map<string, Map<string, ActiveChannelRun>>();
const pendingQuestionRuns = new Map<string, PendingQuestionRun>();

// --- Public API ---

export function ensureScheduler(workspaceId: string, ctx: AgentContext) {
  if (!activeSchedulers.has(workspaceId)) {
    activeSchedulers.add(workspaceId);
    setTimeout(() => {
      startScheduler(workspaceId, ctx);
      console.log(`[ws] scheduler started for workspace ${workspaceId}`);
    }, 10_000);
    console.log(`[ws] scheduler scheduled for workspace ${workspaceId} in 10000ms`);
  }
}

export function makeContext(workspaceId: string): AgentContext {
  return {
    workspaceId,
    broadcast: (event, data) => broadcastToWorkspace(workspaceId, event, data),
    getSession: (sessionId) => agentService.getById(workspaceId, sessionId),
    updateSessionStatus: (sessionId, status, extra) =>
      agentService.updateStatus(workspaceId, sessionId, status, extra),
  };
}

export function stopChannelRuns(workspaceId: string, channelId: string): void {
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
    if (message.status !== 'pending' && message.status !== 'streaming' && message.status !== 'waiting_for_user') continue;
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

export function handleAnswerQuestion(_ws: WebSocket, workspaceId: string, data: unknown) {
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
}

export async function runMentionedAgent(
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
  const functionTools = [
    ...createIssueFunctionTools(workspaceId, channel, {
      senderId: preset.id,
      senderRole: preset.role,
    }, preset.tools),
    ...createCommandFunctionTools(workspaceId),
  ];
  const workingDir = agentService.resolveWorkingDir(workspaceId, preset);
  const startTime = Date.now();
  const runtimePromptConfig = {
    mcpServers: Object.keys(mcpServers ?? {}),
    skills,
    boundDirs: workspace?.boundDirs,
    workingDir,
    excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
    builtInTools: buildBuiltInTools(functionTools, channel, issue),
  };
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
  let agentPrompt = '';
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
    const history = filterPromptHistory(listMessages(workspaceId, channelId, { limit: 20 }), {
      excludeMessageIds: [
        ...(!existingMessage ? [pending.id] : []),
        ...(options.excludeHistoryMessageIds ?? []),
      ],
      excludeReplyIds: options.excludeHistoryReplyIds,
    });
    agentPrompt = buildAgentPrompt(workspaceId, preset.systemPrompt, prompt, history, runtimePromptConfig);
    const liveOutput: string[] = [...(options.seedOutput ?? [])];
    const liveOutputItems: MessageAgentOutputItem[] = liveOutput.map((line, index) => buildOutputItem({
      id: `seed-${index}`,
      type: 'output',
      text: line,
    }));
    const askUserQuestions: PendingAskUserQuestion[] = [...(options.seedQuestions ?? [])];
    const toolDetails = new Map<string, ToolDetail>();
    const toolUseDetailIds = new Map<string, string>();
    let lastLiveUpdate = 0;
    const broadcastLiveParts = (force = false) => {
      if (activeRun?.stopped) return;
      const now = Date.now();
      if (!force && now - lastLiveUpdate < 120) return;
      lastLiveUpdate = now;
      const parts = buildAgentMessageParts({
        sessionId: session.id,
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        agentConfigId: preset.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        userPrompt: prompt,
        fullPrompt: agentPrompt,
        mcpServers: runtimePromptConfig.mcpServers,
        skills: runtimePromptConfig.skills,
        builtInTools: runtimePromptConfig.builtInTools,
        output: liveOutput,
        outputItems: liveOutputItems,
        reasoning: liveReasoning,
        toolDetails,
        askUserQuestions,
        success: true,
      });
      const displayParts = buildContinuationParts(existingMessage?.parts, session.id, options.appendUserMessage, parts);
      if (displayParts.length === 0) return;

      const status = askUserQuestions.some((question) => !question.answer) ? 'waiting_for_user' : 'streaming';
      const live = updateMessage(workspaceId, channelId, pending.id, {
        content: liveOutput.join('\n') || pending.content,
        status,
        parts: displayParts,
        metadata: {
          ...pending.metadata,
          duration: Date.now() - startTime,
        },
      });
      if (live) broadcastToWorkspace(workspaceId, 'channel.message.updated', live);
    };
    const result = await runtime.execute(agentPrompt, workingDir, {
      maxTurns: 100,
      functionTools,
      mcpServers,
      skills,
      configDir,
      sandboxDirs: preset.sandboxDirs,
      onEvent: (event) => {
        if (activeRun?.stopped) return;
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
          liveOutputItems.push(buildOutputItem({
            id: event.id,
            type: 'tool_use',
            title: summarizeToolLine(event.line, workspace?.boundDirs?.[0]).title,
            toolUseId: event.id,
            toolName: event.name,
            text: event.line,
          }));
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
          liveOutputItems.push(buildOutputItem({
            id: `result-${event.toolUseId ?? liveOutputItems.length}`,
            type: 'tool_result',
            title: detail?.title || detail?.raw || 'Tool result',
            toolUseId: event.toolUseId,
            text: serializeToolResult(event.result),
          }));
          broadcastLiveParts();
          return;
        }
        if (event.type !== 'output') return;
        liveOutput.push(event.line);
        liveOutputItems.push(buildOutputItem({
          id: `output-${liveOutputItems.length}`,
          type: 'output',
          text: event.line,
        }));
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: session.id, data: event.line });
        broadcastLiveParts();
      },
    });
    if (activeRun.stopped) return;
    broadcastLiveParts(true);

    const displayOutput = mergeRuntimeOutput(liveOutput, result.output);
    if (shouldWaitForUserAnswer(askUserQuestions, result.summary, result.error, displayOutput)) {
      const waitingOutput = stripAskUserQuestionErrorLines(liveOutput);
      const waitingParts = buildContinuationParts(existingMessage?.parts, session.id, options.appendUserMessage, buildAgentMessageParts({
        sessionId: session.id,
        workspaceRoot: workspace?.boundDirs?.[0],
        presetName: preset.name || preset.role,
        role: preset.role,
        agentConfigId: preset.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        userPrompt: prompt,
        fullPrompt: agentPrompt,
        mcpServers: runtimePromptConfig.mcpServers,
        skills: runtimePromptConfig.skills,
        output: waitingOutput,
        outputItems: liveOutputItems,
        reasoning: liveReasoning,
        toolDetails,
        askUserQuestions,
        success: true,
      }));
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
        parts: waitingParts,
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
      channelId,
      result: {
        success: result.success,
        summary: result.summary,
        artifacts: result.artifacts,
        error: result.error,
      },
      error: result.error,
    });

    const replyParts = buildContinuationParts(existingMessage?.parts, session.id, options.appendUserMessage, buildAgentMessageParts({
      sessionId: session.id,
      workspaceRoot: workspace?.boundDirs?.[0],
      presetName: preset.name || preset.role,
      role: preset.role,
      agentConfigId: preset.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
      usage: result.usage,
      systemPrompt: preset.systemPrompt,
      userPrompt: prompt,
      fullPrompt: agentPrompt,
      mcpServers: runtimePromptConfig.mcpServers,
      skills: runtimePromptConfig.skills,
      builtInTools: runtimePromptConfig.builtInTools,
      output: displayOutput,
      outputItems: liveOutputItems.length ? liveOutputItems : displayOutput.map((line, index) => buildOutputItem({
        id: `result-output-${index}`,
        type: 'output',
        text: line,
      })),
      reasoning: liveReasoning,
      toolDetails,
      askUserQuestions,
      success: result.success,
      error: result.error,
    }));
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
      parts: replyParts,
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
    const errorParts = buildContinuationParts(existingMessage?.parts, session.id, options.appendUserMessage, buildAgentMessageParts({
      sessionId: session.id,
      workspaceRoot: workspace?.boundDirs?.[0],
      presetName: preset.name || preset.role,
      role: preset.role,
      agentConfigId: preset.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
      systemPrompt: preset.systemPrompt,
      userPrompt: prompt,
      fullPrompt: agentPrompt,
      mcpServers: runtimePromptConfig.mcpServers,
      skills: runtimePromptConfig.skills,
      builtInTools: runtimePromptConfig.builtInTools,
      output: [error],
      outputItems: [buildOutputItem({
        id: 'error',
        type: 'output',
        text: error,
      })],
      reasoning: liveReasoning,
      toolDetails: new Map(),
      askUserQuestions: [],
      success: false,
      error,
    }));
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
      parts: errorParts,
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } finally {
    untrackChannelRun(workspaceId, channelId, session.id);
  }
}

// --- Internal helpers ---

function getRuntimeBaseURL(provider?: string, apiBase?: string): string | undefined {
  if (
    provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages'
  ) return undefined;
  return apiBase;
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

function filterPromptHistory(
  messages: Message[],
  options: {
    excludeMessageIds?: string[];
    excludeReplyIds?: string[];
  },
): Message[] {
  const excludeMessageIds = new Set(options.excludeMessageIds ?? []);
  const excludeReplyIds = new Set(options.excludeReplyIds ?? []);

  return messages
    .filter((message) => !excludeMessageIds.has(message.id))
    .map((message) => {
      if (!message.replies?.length || excludeReplyIds.size === 0) return message;
      return {
        ...message,
        replies: message.replies.filter((reply) => !excludeReplyIds.has(reply.id)),
      };
    });
}

function buildContinuationParts(
  previousParts: Message['parts'] | undefined,
  sessionId: string,
  userMessage: string | undefined,
  nextParts: NonNullable<Message['parts']>,
): NonNullable<Message['parts']> {
  if (!userMessage) return nextParts;
  const appended: NonNullable<Message['parts']> = [{
    id: `user-message-${sessionId}`,
    type: 'user_message',
    text: userMessage,
    senderName: '用户',
  }, ...nextParts];
  return [...(previousParts ?? []), ...appended];
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

function buildOutputItem(input: {
  id: string;
  type: MessageAgentOutputItem['type'];
  text: string;
  title?: string;
  toolUseId?: string;
  toolName?: string;
}): MessageAgentOutputItem {
  const text = clipOutputText(input.text);
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    toolUseId: input.toolUseId,
    toolName: input.toolName,
    text,
    characters: countCharacters(text),
    tokens: estimateTextTokens(text),
  };
}

function serializeToolResult(result: unknown): string {
  const text = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);
  if (!text) return String(result);
  return clipOutputText(text);
}

function clipOutputText(text: string): string {
  const maxLength = 40_000;
  return text.length > maxLength
    ? `${text.slice(0, maxLength)}\n... truncated ${text.length - maxLength} chars`
    : text;
}

function countCharacters(text: string): number {
  return Array.from(text).length;
}

function estimateTextTokens(text: string): number {
  if (!text.trim()) return 0;
  const cjkChars = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const nonCjkText = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ');
  const words = nonCjkText.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g)?.length ?? 0;
  return Math.max(1, Math.ceil(cjkChars + words * 0.75));
}
