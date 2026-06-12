import type { WebSocket } from 'ws';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Channel, Message, MessageAgentOutputItem } from '@agent-spaces/shared';
import { broadcastToWorkspace } from './connection-manager.js';
import { createMessage, updateMessage, listMessages } from '../services/message.js';
import { getChannel, updateChannel } from '../services/channel.js';
import * as issueService from '../services/issue.js';
import { createIssueFunctionTools, createCommandFunctionTools, createDatabaseFunctionTools, createKanbanFunctionTools, createWorkflowExecutionFunctionTools, createMiniAppFunctionTools } from '../services/builtin-tools/index.js';
import { startScheduler } from '../agents/scheduler-agent.js';
import * as agentService from '../services/agent.js';
import * as wsService from '../services/workspace.js';
import * as miniAppService from '../services/mini-apps.js';
import type { AgentContext } from '../agents/agent-context.js';
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntime } from '../adapters/agent-runtime-types.js';
import { saveToolDetails } from '../services/tool-detail.js';
import type { ToolDetail } from '../services/tool-detail.js';
import { getThinkingRuntimeConfig } from '../services/llm-model-config.js';
import { buildAgentMessageParts, normalizeOutputLines, mergeRuntimeOutput, buildToolDetailId, summarizeToolLine, findToolDetailForResult } from './message-parts.js';
import { buildPersistentAgentContextDetails } from '../services/persistent-agent-context.js';
import type { PendingAskUserQuestion } from './message-parts.js';
import { buildAgentPrompt, buildBuiltInTools } from './agent-prompt.js';
import type { BuiltInToolContext } from './agent-prompt.js';
import { wrapOnEventWithHooks } from '../services/hook-engine.js';
import { getDataDir } from '../storage/json-store.js';

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

interface MiniAppMessageContext {
  projectId: string;
  activeFilePath?: string;
  projectType?: 'react' | 'html';
  fileContent?: string;
}

interface RunMentionedAgentOptions {
  agentSessionId?: string;
  messageId?: string;
  seedOutput?: string[];
  seedQuestions?: PendingAskUserQuestion[];
  appendUserMessage?: string;
  resumeSessionId?: string;
  contextLength?: number;
  excludeHistoryMessageIds?: string[];
  excludeHistoryReplyIds?: string[];
  miniAppContext?: MiniAppMessageContext;
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

    const existing = listMessages(workspaceId, channelId).find((m) => m.id === run.messageId);
    const preservedParts = (existing?.parts ?? []).map((part) =>
      'status' in part && part.status === 'streaming' ? { ...part, status: 'completed' as const } : part
    );
    const stoppedPart = {
      id: `error-stopped-${run.agentId}`,
      type: 'error' as const,
      title: 'Stopped by user',
      message: 'The agent run was stopped by user.',
    };
    const message = updateMessage(workspaceId, channelId, run.messageId, {
      status: 'error',
      parts: [...preservedParts, stoppedPart],
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
      agentSessionId: message.metadata?.agentSessionId,
      messageId,
      seedOutput: normalizeOutputLines([message.content]),
      seedQuestions: seedQuestion ? [seedQuestion] : [],
      resumeSessionId: message.metadata?.runtimeSessionId,
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

  const session = options.agentSessionId
    ? agentService.getById(workspaceId, options.agentSessionId)
    : null;
  const nextSession = session ?? agentService.create(workspaceId, preset.role, preset.id);
  const sessionChanged = !session;
  const previousStatus = nextSession.status;
  if (!sessionChanged) {
    broadcastToWorkspace(workspaceId, 'agent.started', nextSession);
  }
  agentService.updateStatus(workspaceId, nextSession.id, 'active');
  broadcastToWorkspace(workspaceId, 'agent.status_changed', {
    agentId: nextSession.id,
    from: previousStatus,
    to: 'active',
  });

  const configDir = agentService.getAgentConfigDir(workspaceId, preset);
  const mcpServers = agentService.getMcpServers(preset.mcps);
  const skills = agentService.getAvailableSkillNames(configDir, preset.skills);
  const workspace = wsService.getById(workspaceId);
  const { channel, issue } = resolveIssueChannelContext(workspaceId, channelId);
  const miniAppRuntimeContext = resolveMiniAppRuntimeContext(options.miniAppContext);
  const functionTools = [
    ...createIssueFunctionTools(workspaceId, channel, {
      senderId: preset.id,
      senderRole: preset.role,
    }, preset.tools),
    ...createCommandFunctionTools(workspaceId, preset.tools),
    ...createDatabaseFunctionTools(workspaceId, preset.tools),
    ...createKanbanFunctionTools(workspaceId, preset.tools),
    ...createWorkflowExecutionFunctionTools(preset.tools),
    ...(miniAppRuntimeContext ? createMiniAppFunctionTools({
      enabledPlugins: miniAppRuntimeContext.enabledPlugins,
    }) : []),
  ];
  const workingDir = miniAppRuntimeContext?.projectDir ?? agentService.resolveWorkingDir(workspaceId, preset);
  const boundDirs = miniAppRuntimeContext ? [miniAppRuntimeContext.projectDir] : workspace?.boundDirs;
  const sandboxDirs = miniAppRuntimeContext
    ? [miniAppRuntimeContext.projectDir]
    : preset.sandboxDirs;
  const workspaceRoot = boundDirs?.[0];
  const startTime = Date.now();
  const runtimePromptConfig = {
    runtimeKind: preset.runtimeKind,
    mcpServers: Object.keys(mcpServers ?? {}),
    skills,
    boundDirs,
    workingDir,
    excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
    builtInTools: buildBuiltInTools(functionTools, channel, issue),
    miniAppContext: miniAppRuntimeContext ? {
      projectId: miniAppRuntimeContext.projectId,
      activeFilePath: options.miniAppContext?.activeFilePath,
      projectType: miniAppRuntimeContext.projectType,
    } : undefined,
  };
  const existingMessage = options.messageId
    ? listMessages(workspaceId, channelId).find((message) => message.id === options.messageId)
    : undefined;
  const pending = existingMessage
    ? updateMessage(workspaceId, channelId, existingMessage.id, {
      status: 'streaming',
      metadata: {
        ...existingMessage.metadata,
        agentSessionId: nextSession.id,
        runtimeSessionId: options.resumeSessionId ?? existingMessage.metadata?.runtimeSessionId,
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
        agentSessionId: nextSession.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        duration: 0,
      },
      parts: [
        {
          id: `reasoning-${nextSession.id}`,
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
  let runtimeUserPrompt = prompt;
  const contextLength = normalizeContextLength(options.contextLength);
  let runtimeSessionId = contextLength === 0
    ? undefined
    : options.resumeSessionId ?? existingMessage?.metadata?.runtimeSessionId;
  const persistentContext = buildPersistentAgentContextDetails({
    workspaceId,
    workingDir: workspaceRoot || workingDir,
    boundDirs,
    excludeNativeClaudeMd: preset.runtimeKind === 'claude-code',
  }).summary;
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
      agentId: nextSession.id,
      agentConfigId,
      messageId: pending.id,
      runtime,
    };
    trackChannelRun(workspaceId, channelId, activeRun);
    const history = contextLength === 0
      ? []
      : filterPromptHistory(listMessages(workspaceId, channelId, { limit: contextLength }), {
        excludeMessageIds: [
          ...(!existingMessage ? [pending.id] : []),
          ...(options.excludeHistoryMessageIds ?? []),
        ],
        excludeReplyIds: options.excludeHistoryReplyIds,
      });
    const isRuntimeSessionResume = Boolean(options.resumeSessionId && (preset.runtimeKind === 'claude-code' || preset.runtimeKind === 'codex'));
    runtimeUserPrompt = expandAgentSlashCommandPrompt(prompt, configDir);
    agentPrompt = isRuntimeSessionResume
      ? runtimeUserPrompt
      : buildAgentPrompt(workspaceId, preset.systemPrompt, runtimeUserPrompt, history, runtimePromptConfig);
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
        sessionId: nextSession.id,
        workspaceRoot,
        presetName: preset.name || preset.role,
        role: preset.role,
        agentConfigId: preset.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        userPrompt: runtimeUserPrompt,
        fullPrompt: agentPrompt,
        persistentContext,
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
      const displayParts = buildContinuationParts(existingMessage?.parts, nextSession.id, options.appendUserMessage, parts);
      if (displayParts.length === 0) return;

      const status = askUserQuestions.some((question) => !question.answer) ? 'waiting_for_user' : 'streaming';
      const live = updateMessage(workspaceId, channelId, pending.id, {
        content: liveOutput.join('\n') || pending.content,
        status,
        parts: displayParts,
        metadata: {
          ...pending.metadata,
          runtimeSessionId,
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
      sandboxDirs,
      outputStyle: preset.outputStyle,
      resumeSessionId: isRuntimeSessionResume ? options.resumeSessionId : undefined,
      userPrompt: runtimeUserPrompt,
      onEvent: wrapOnEventWithHooks((event) => {
        if (activeRun?.stopped) return;
        if (event.type === 'session') {
          runtimeSessionId = event.sessionId;
          const live = updateMessage(workspaceId, channelId, pending.id, {
            metadata: {
              ...pending.metadata,
              runtimeSessionId,
              duration: Date.now() - startTime,
            },
          });
          if (live) broadcastToWorkspace(workspaceId, 'channel.message.updated', live);
          return;
        }
        if (event.type === 'reasoning') {
          liveReasoning.push({ text: event.text, status: event.status });
          broadcastToWorkspace(workspaceId, 'agent.output', { agentId: nextSession.id, data: event.text });
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
            title: summarizeToolLine(event.line, workspaceRoot).title,
            raw: event.line,
            input: event.input,
            createdAt: new Date().toISOString(),
          });
          saveToolDetails(workspaceId, channelId, Array.from(toolDetails.values()));
          liveOutput.push(event.line);
          liveOutputItems.push(buildOutputItem({
            id: event.id,
            type: 'tool_use',
            title: summarizeToolLine(event.line, workspaceRoot).title,
            toolUseId: event.id,
            toolName: event.name,
            text: event.line,
          }));
          broadcastToWorkspace(workspaceId, 'agent.output', { agentId: nextSession.id, data: event.line });
          broadcastLiveParts();
          return;
        }
        if (event.type === 'tool_result') {
          const askedQuestion = event.toolUseId
            ? askUserQuestions.find((question) => question.toolUseId === event.toolUseId)
            : undefined;
          if (askedQuestion) return;
          const detail = findToolDetailForResult(event.toolUseId, event.result, toolUseDetailIds, toolDetails, workspaceRoot);
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
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: nextSession.id, data: event.line });
        broadcastLiveParts();
      }, workspaceId, workspace?.hooksEnabled),
    });
    if (activeRun.stopped) return;
    broadcastLiveParts(true);

    const displayOutput = mergeRuntimeOutput(liveOutput, result.output);
    if (shouldWaitForUserAnswer(askUserQuestions, result.summary, result.error, displayOutput)) {
      const waitingOutput = stripAskUserQuestionErrorLines(liveOutput);
      const waitingParts = buildContinuationParts(existingMessage?.parts, nextSession.id, options.appendUserMessage, buildAgentMessageParts({
        sessionId: nextSession.id,
        workspaceRoot,
        presetName: preset.name || preset.role,
        role: preset.role,
        agentConfigId: preset.id,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        systemPrompt: preset.systemPrompt,
        userPrompt: runtimeUserPrompt,
        fullPrompt: agentPrompt,
        persistentContext,
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
          agentSessionId: nextSession.id,
          runtimeSessionId: result.sessionId ?? runtimeSessionId,
          runtime: preset.runtimeKind,
          model: preset.modelId,
          summary: 'Waiting for user answer',
          duration: Date.now() - startTime,
        },
        parts: waitingParts,
      });
      if (waiting) broadcastToWorkspace(workspaceId, 'channel.message.updated', waiting);
      agentService.updateStatus(workspaceId, nextSession.id, 'blocked');
      broadcastToWorkspace(workspaceId, 'agent.status_changed', {
        agentId: nextSession.id,
        from: 'active',
        to: 'blocked',
      });
      return;
    }

    if (liveOutput.length === 0) {
      for (const line of result.output) {
        broadcastToWorkspace(workspaceId, 'agent.output', { agentId: nextSession.id, data: line });
      }
    }

    agentService.complete(workspaceId, nextSession.id, result.success ? undefined : result.error, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: result.summary,
      output: displayOutput,
      durationMs: Date.now() - startTime,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    broadcastToWorkspace(workspaceId, 'agent.completed', {
      agentId: nextSession.id,
      channelId,
      result: {
        success: result.success,
        summary: result.summary,
        artifacts: result.artifacts,
        error: result.error,
      },
      error: result.error,
    });

    const replyParts = buildContinuationParts(existingMessage?.parts, nextSession.id, options.appendUserMessage, buildAgentMessageParts({
      sessionId: nextSession.id,
      workspaceRoot,
      presetName: preset.name || preset.role,
      role: preset.role,
      agentConfigId: preset.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
      usage: result.usage,
      systemPrompt: preset.systemPrompt,
      userPrompt: runtimeUserPrompt,
      fullPrompt: agentPrompt,
      persistentContext,
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
        agentSessionId: nextSession.id,
        runtimeSessionId: result.sessionId ?? runtimeSessionId,
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
    agentService.complete(workspaceId, nextSession.id, error, {
      runtime: preset.runtimeKind,
      model: preset.modelId,
      summary: error,
      output: [error],
      durationMs: Date.now() - startTime,
    });
    broadcastToWorkspace(workspaceId, 'agent.error', { agentId: nextSession.id, error });
    const errorParts = buildContinuationParts(existingMessage?.parts, nextSession.id, options.appendUserMessage, buildAgentMessageParts({
      sessionId: nextSession.id,
      workspaceRoot,
      presetName: preset.name || preset.role,
      role: preset.role,
      agentConfigId: preset.id,
      runtime: preset.runtimeKind,
      model: preset.modelId,
      systemPrompt: preset.systemPrompt,
      userPrompt: runtimeUserPrompt,
      fullPrompt: agentPrompt,
      persistentContext,
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
        agentSessionId: nextSession.id,
        runtimeSessionId,
        runtime: preset.runtimeKind,
        model: preset.modelId,
        duration: Date.now() - startTime,
      },
      parts: errorParts,
    });
    if (reply) broadcastToWorkspace(workspaceId, 'channel.message.updated', reply);
  } finally {
    untrackChannelRun(workspaceId, channelId, nextSession.id);
  }
}

// --- Internal helpers ---

function resolveMiniAppRuntimeContext(context: MiniAppMessageContext | undefined): {
  projectId: string;
  projectDir: string;
  projectType?: 'react' | 'html';
  enabledPlugins: string[];
} | null {
  const projectId = context?.projectId?.trim();
  if (!projectId) return null;

  try {
    const project = miniAppService.getProject(projectId);
    const projectDir = join(getDataDir(), 'mini-apps', project.id);
    if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) return null;
    return {
      projectId: project.id,
      projectDir,
      projectType: project.type,
      enabledPlugins: project.enabledPlugins ?? [],
    };
  } catch {
    return null;
  }
}

function expandAgentSlashCommandPrompt(prompt: string, agentDir: string | undefined): string {
  if (!agentDir) return prompt;

  const commandMatch = matchLeadingSlashCommand(prompt);
  if (!commandMatch) return prompt;

  const { commandName, args, rest } = commandMatch;
  if (!commandName || commandName.includes('..')) return prompt;

  const commandFile = findAgentCommandFile(agentDir, commandName);
  if (!commandFile) return prompt;

  const commandContent = readFileSync(commandFile, 'utf-8').replace(/\$ARGUMENTS/g, args);
  return [
    `User selected Agent slash command: /${commandName}`,
    args ? `Command arguments: ${args}` : 'Command arguments: none',
    '',
    'Command instructions:',
    commandContent.trim(),
    rest ? ['', 'Additional user message:', rest].join('\n') : '',
  ].filter(Boolean).join('\n');
}

function matchLeadingSlashCommand(prompt: string): { commandName: string; args: string; rest: string } | null {
  const slashIndex = prompt.indexOf('/');
  if (slashIndex < 0) return null;

  const prefix = prompt.slice(0, slashIndex).trim();
  if (prefix && !prefix.startsWith('@')) return null;

  const match = prompt.slice(slashIndex).match(/^\/([A-Za-z0-9._/-]+)(?:\s+([^\r\n]*))?([\s\S]*)$/);
  if (!match) return null;

  return {
    commandName: match[1]?.trim() ?? '',
    args: match[2]?.trim() ?? '',
    rest: match[3]?.trim() ?? '',
  };
}

function findAgentCommandFile(agentDir: string, commandName: string): string | undefined {
  const commandsDir = join(agentDir, 'commands');
  if (!existsSync(commandsDir) || !statSync(commandsDir).isDirectory()) return undefined;

  const directParts = commandName.split('/').filter(Boolean);
  if (directParts.length > 0 && directParts.every(isSafeCommandPathPart)) {
    const directPath = join(commandsDir, ...directParts.slice(0, -1), `${directParts.at(-1)}.md`);
    if (existsSync(directPath) && statSync(directPath).isFile()) return directPath;
  }

  const targetName = commandName.split('/').filter(Boolean).at(-1);
  if (!targetName || !isSafeCommandPathPart(targetName)) return undefined;
  return findCommandFileByName(commandsDir, targetName);
}

function findCommandFileByName(dir: string, commandName: string): string | undefined {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findCommandFileByName(fullPath, commandName);
      if (nested) return nested;
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase() === `${commandName}.md`.toLowerCase()) {
      return fullPath;
    }
  }
  return undefined;
}

function isSafeCommandPathPart(part: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..';
}

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
  return Boolean(name && /(?:agent-spaces\.|mcp__agent-spaces__)?(?:CreateCurrentChannelIssue|ViewCurrentChannelIssue|AddCurrentChannelComment)/.test(name));
}

function isCreateCurrentChannelIssueTool(name: string | undefined): boolean {
  return Boolean(name && /(?:agent-spaces\.|mcp__agent-spaces__)?CreateCurrentChannelIssue/.test(name));
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

function normalizeContextLength(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 20;
  return Math.min(20, Math.max(0, Math.trunc(value)));
}
