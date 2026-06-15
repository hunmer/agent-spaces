import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { Connection } from '@langchain/mcp-adapters';
import { createAgent, initChatModel, tool } from 'langchain';
import type { CreateAgentParams } from 'langchain';
import type {
  AgentFunctionTool,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
  AgentRuntimeEvent,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';
import { getDataDir } from '../storage/json-store.js';

const MAX_DEBUG_LOG_CHARS = 500;
const STREAM_EVENT_THROTTLE_MS = 100;
const STREAM_NO_PROGRESS_TIMEOUT_MS = 30_000;
const EMPTY_AI_CHUNK_LOG_INTERVAL = 20;

/**
 * Runtime backed by LangChain.js.
 * Uses LangChain's provider-neutral createAgent API and adapts Agent Spaces tools.
 */
export class LangChainRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;
  private static nextRunId = 1;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const runId = LangChainRuntime.nextRunId++;
    const d = (msg: string) => console.log(`[langchain:${runId}] ${msg}`);
    const modelSettings = resolveLangChainModelSettings(this.config);
    const model = modelSettings.modelIdentifier;
    const eventSink = createThrottledRuntimeEventSink(options?.onEvent);
    const runtimeOptions = options ? { ...options, onEvent: eventSink.emit } : undefined;
    let mcpClient: MultiServerMCPClient | undefined;
    const progress = createLangChainRunProgress();

    const skillPrompts = loadConfiguredSkillPrompts(runtimeOptions?.configDir, runtimeOptions?.skills);
    d(`starting | cwd=${cwd} provider=${this.config.provider ?? 'auto'} langchainProvider=${modelSettings.provider ?? 'auto'} model=${model} baseURL=${this.config.baseURL ?? 'default'} apiKey=${this.config.apiKey ? 'set' : 'unset'} maxTurns=${runtimeOptions?.maxTurns ?? '∞'} tools=${runtimeOptions?.functionTools?.map((runtimeTool) => runtimeTool.name).join(',') || '-'} mcpServers=${Object.keys(runtimeOptions?.mcpServers ?? {}).join(',') || '-'} skills=${skillPrompts.map((skill) => skill.name).join(',') || '-'} sandboxDirs=${runtimeOptions?.sandboxDirs?.join(',') ?? '-'}`);
    d(`options | ${summarizeOptionsForLog(runtimeOptions)}`);
    d(`model config | ${summarizeForLog(maskSensitiveConfig(buildModelConfig(this.config)), 1000)}`);
    d(`provider env | ${summarizeEnvForLog(buildProviderEnv(this.config, modelSettings.provider))}`);
    if (modelSettings.providerCorrectionReason) d(`provider adjusted | ${modelSettings.providerCorrectionReason}`);
    d(`prompt | chars=${prompt.length} preview=${truncateForLog(prompt, 1000)}`);
    if (skillPrompts.length) {
      d(`skills loaded | ${skillPrompts.map((skill) => `${skill.name}:${skill.content.length}chars`).join(',')}`);
    } else if (runtimeOptions?.skills?.length) {
      d(`skills requested but not loaded | requested=${runtimeOptions.skills.join(',')}`);
    }

    try {
      d('initializing chat model');
      const chatModel = await withTemporaryEnv(
        buildProviderEnv(this.config, modelSettings.provider),
        () => initChatModel(model, buildModelConfig(this.config)),
      );
      d(`chat model initialized | type=${getObjectTypeName(chatModel)}`);
      mcpClient = createLangChainMcpClient(runtimeOptions?.mcpServers, output, runtimeOptions, d, progress);
      d(`MCP client ${mcpClient ? 'created' : 'not created'}`);
      const mcpTools = mcpClient ? await mcpClient.getTools() : [];
      if (mcpClient) d(`resolved MCP tools | servers=${Object.keys(runtimeOptions?.mcpServers ?? {}).join(',') || '-'} count=${mcpTools.length} tools=${mcpTools.map((mcpTool) => mcpTool.name).join(',') || '-'}`);
      const runtimeTools = buildLangChainTools(runtimeOptions?.functionTools, output, runtimeOptions, d, progress);
      d(`creating agent | runtimeTools=${runtimeTools.length} mcpTools=${mcpTools.length} systemPrompt=${runtimeOptions?.systemPrompt ? `${runtimeOptions.systemPrompt.length}chars` : '-'} outputStyle=${runtimeOptions?.outputStyle ?? '-'}`);
      const agent = createAgent({
        model: chatModel,
        tools: [
          ...runtimeTools,
          ...mcpTools,
        ],
        systemPrompt: runtimeOptions?.systemPrompt,
      });
      d(`agent created | type=${getObjectTypeName(agent)}`);

      const finalPrompt = appendOutputStyleToPrompt(
        injectSkillPrompts(prompt, skillPrompts),
        runtimeOptions?.outputStyle,
      );
      d(`final prompt | chars=${finalPrompt.length} skillCount=${skillPrompts.length} outputStyle=${runtimeOptions?.outputStyle ?? '-'} preview=${truncateForLog(finalPrompt, 1200)}`);

      const recursionLimit = runtimeOptions?.maxTurns ? Math.max(2, runtimeOptions.maxTurns * 2 + 1) : undefined;
      d(`streaming agent | recursionLimit=${recursionLimit ?? '-'} aborted=${this.abortController?.signal.aborted ? 'yes' : 'no'}`);
      const stream = await agent.stream(
        { messages: [{ role: 'user', content: finalPrompt }] },
        {
          signal: this.abortController?.signal,
          recursionLimit,
          streamMode: ['messages', 'values', 'updates'],
        },
      );

      const textParts: string[] = [];
      let finalStateMessages: unknown[] = [];
      let seenStateMessageCount = 0;
      let usage: AgentRunResult['usage'];
      let emptyAiChunkCount = 0;
      let emptyAiChunkStart = 0;
      let emptyAiChunkLastId = '';
      const appendOutputText = (text: string) => {
        if (!text) return;
        progress.recordAiText();
        textParts.push(text);
        runtimeOptions?.onEvent?.({ type: 'output', line: text });
      };
      const appendStateOutputText = (text: string) => {
        if (!text) return;
        const currentText = textParts.join('');
        if (currentText.endsWith(text)) return;
        appendOutputText(text.startsWith(currentText) ? text.slice(currentText.length) : text);
      };
      for await (const chunk of stream) {
        const streamChunk = splitLangChainStreamChunk(chunk);
        if (streamChunk.mode === 'values' || streamChunk.mode === 'updates') {
          const stateMessages = streamChunk.mode === 'values'
            ? extractStateMessages(streamChunk.payload)
            : extractUpdateMessages(streamChunk.payload);
          if (streamChunk.mode === 'values') finalStateMessages = stateMessages;
          const newMessages = streamChunk.mode === 'values'
            ? stateMessages.slice(seenStateMessageCount)
            : stateMessages;
          if (streamChunk.mode === 'values') seenStateMessageCount = Math.max(seenStateMessageCount, stateMessages.length);
          for (const message of newMessages) {
            if (!isRecord(message)) continue;
            const tokenUsage = extractUsageFromMessage(message);
            if (tokenUsage) usage = tokenUsage;
            if (!isAiStreamToken(message) || countToolCalls(message) > 0) continue;
            appendStateOutputText(extractTextFromToken(message));
          }
          continue;
        }

        const token = Array.isArray(streamChunk.payload) ? streamChunk.payload[0] : streamChunk.payload;
        if (!isRecord(token)) {
          // d(`stream token skipped | type=${typeof token}`);
          continue;
        }

        const tokenUsage = extractUsageFromMessage(token);
        if (tokenUsage) usage = tokenUsage;
        const text = extractTextFromToken(token);
        const reasoning = extractReasoningFromToken(token);
        const toolCallCount = countToolCalls(token);
        const messageMeta = Array.isArray(streamChunk.payload) && isRecord(streamChunk.payload[1])
          ? streamChunk.payload[1]
          : undefined;
        const isAiToken = isAiStreamToken(token);
        const hasMeaningfulChunk = Boolean(text || reasoning || toolCallCount > 0);
        if (isAiToken && !hasMeaningfulChunk) {
          const tokenId = typeof token.id === 'string' ? token.id : '';
          if (tokenId !== emptyAiChunkLastId) {
            emptyAiChunkLastId = tokenId;
            emptyAiChunkCount = 0;
            emptyAiChunkStart = Date.now();
          }
          emptyAiChunkCount += 1;
          const stalledMs = Date.now() - emptyAiChunkStart;
          if (emptyAiChunkCount === 1 || emptyAiChunkCount % EMPTY_AI_CHUNK_LOG_INTERVAL === 0) {
            d(`stream ai empty | count=${emptyAiChunkCount} stalledMs=${stalledMs} id=${tokenId || '-'} step=${messageMeta?.langgraph_step ?? '-'} node=${messageMeta?.langgraph_node ?? '-'}`);
          }
          if (progress.hasSeenToolResult() && stalledMs >= STREAM_NO_PROGRESS_TIMEOUT_MS) {
            this.abortController?.abort();
            throw new Error(`LangChain stream stalled after tool results: no assistant text/reasoning/tool calls for ${stalledMs}ms while receiving empty AI chunks.`);
          }
          continue;
        }
        if (hasMeaningfulChunk) {
          emptyAiChunkCount = 0;
          emptyAiChunkStart = 0;
          emptyAiChunkLastId = '';
        }
        // if (isAiToken || toolCallCount > 0) {
        //   d(`stream ai | ${summarizeStreamTokenForLog(token, text, reasoning, tokenUsage)} step=${messageMeta?.langgraph_step ?? '-'} node=${messageMeta?.langgraph_node ?? '-'}`);
        // }
        if (!isAiToken) {
          // d(`stream token skipped | ${summarizeStreamTokenForLog(token, '', '', tokenUsage)}`);
          continue;
        }

        if (reasoning) {
          runtimeOptions?.onEvent?.({ type: 'reasoning', text: reasoning, status: 'streaming' });
        }
        if (text) {
          appendOutputText(text);
        }
      }
      eventSink.flush();

      const stateSummary = summarizeStateMessagesForLog(finalStateMessages);
      if (stateSummary) d(`final state | ${stateSummary}`);
      const fallbackText = extractFinalAssistantTextFromState(finalStateMessages);
      if (fallbackText && !textParts.join('').endsWith(fallbackText)) {
        d(`final state fallback text | chars=${fallbackText.length} preview=${truncateForLog(fallbackText, 1200)}`);
        appendStateOutputText(fallbackText);
        eventSink.flush();
      }
      const incompleteBeforeToolFallback = progress.getIncompleteReason();
      const toolResultFallbackText = incompleteBeforeToolFallback?.includes('without a final assistant response')
        ? progress.getToolResultFallbackText()
        : undefined;
      if (toolResultFallbackText) {
        d(`tool result fallback text | chars=${toolResultFallbackText.length} preview=${truncateForLog(toolResultFallbackText, 1200)}`);
        appendStateOutputText(toolResultFallbackText);
        eventSink.flush();
      }

      const text = textParts.join('');
      d(`final text | chars=${text.length} preview=${truncateForLog(text, 1200) || '-'}`);
      d(`usage | ${usage ? summarizeForLog(usage, 500) : '-'}`);
      if (text) {
        output.push(text);
      }

      const incompleteReason = progress.getIncompleteReason();
      if (incompleteReason) {
        d(`incomplete | ${incompleteReason}`);
        return {
          success: false,
          summary: 'LangChain execution ended before final response',
          artifacts: [],
          error: incompleteReason,
          output,
          usage,
        };
      }

      const elapsed = Date.now() - startTime;
      d(`done ${elapsed}ms | outputLines=${output.length} tokens=${usage?.totalTokens ?? 'unknown'}`);

      return {
        success: true,
        summary: summarizeResult(text),
        artifacts: [],
        output,
        usage,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | name=${err instanceof Error ? err.name : typeof err} message=${truncateForLog(message, 1000)} outputLines=${output.length}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'LangChain execution failed', artifacts: [], error: message, output };
    } finally {
      eventSink.flush();
      if (mcpClient) {
        d('closing MCP client');
        try {
          await mcpClient.close();
          d('MCP client closed');
        } catch (err) {
          d(`MCP client close failed | ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      this.abortController = null;
      d('runtime reset');
    }
  }

  stop(): void {
    this.abortController?.abort();
  }
}

interface SkillPrompt {
  name: string;
  content: string;
}

interface LangChainRunProgress {
  recordToolUse: () => void;
  recordToolResult: (result?: unknown) => void;
  recordAiText: () => void;
  hasSeenToolResult: () => boolean;
  getToolResultFallbackText: () => string | undefined;
  getIncompleteReason: () => string | undefined;
}

export function createLangChainRunProgress(): LangChainRunProgress {
  let toolUseCount = 0;
  let toolResultCount = 0;
  let aiTextAfterLastToolResult = true;
  let toolResultFallbackText: string | undefined;

  return {
    recordToolUse() {
      toolUseCount += 1;
      aiTextAfterLastToolResult = false;
    },
    recordToolResult(result?: unknown) {
      toolResultCount += 1;
      aiTextAfterLastToolResult = false;
      toolResultFallbackText = summarizeToolResultForAssistant(result);
    },
    recordAiText() {
      aiTextAfterLastToolResult = true;
    },
    hasSeenToolResult() {
      return toolResultCount > 0;
    },
    getToolResultFallbackText() {
      return toolResultFallbackText;
    },
    getIncompleteReason() {
      if (toolUseCount === 0) return undefined;
      if (toolResultCount < toolUseCount) {
        return `LangChain stream ended with pending tool calls: used=${toolUseCount} results=${toolResultCount}.`;
      }
      if (!aiTextAfterLastToolResult) {
        return `LangChain stream ended after tool results without a final assistant response: tools=${toolUseCount}.`;
      }
      return undefined;
    },
  };
}

export function summarizeToolResultForAssistant(result: unknown): string | undefined {
  if (typeof result === 'string') {
    const text = result.trim();
    return text && text.length <= 500 ? text : undefined;
  }
  if (!isRecord(result)) return undefined;

  const ok = typeof result.ok === 'boolean' ? result.ok : undefined;
  const success = typeof result.success === 'boolean' ? result.success : undefined;
  if (ok === false || success === false) return undefined;

  for (const key of ['message', 'summary', 'text', 'output']) {
    const value = result[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text && text.length <= 500) return text;
  }

  return undefined;
}

export function buildLangChainPromptWithSkills(
  prompt: string,
  agentDir: string | undefined,
  skills: string[] | undefined,
  outputStyle?: string,
): string {
  return appendOutputStyleToPrompt(
    injectSkillPrompts(prompt, loadConfiguredSkillPrompts(agentDir, skills)),
    outputStyle,
  );
}

function injectSkillPrompts(prompt: string, skills: SkillPrompt[]): string {
  if (!skills.length) return prompt;
  return [
    prompt.trimEnd(),
    '',
    'Configured skill instructions:',
    `Enabled skill names: ${skills.map((skill) => skill.name).join(', ')}`,
    'These are configured skills for this run, even if a skill body looks like a design note, plan, or reference document.',
    'If the user asks what skills are available, answer from the enabled skill names above. Do not say that no skills are available when this list is non-empty.',
    'Follow the skill contents below when they are relevant to the user request.',
    '',
    ...skills.flatMap((skill) => [
      `## Skill: ${skill.name}`,
      '',
      skill.content,
      '',
    ]),
  ].join('\n').trimEnd();
}

function loadConfiguredSkillPrompts(agentDir: string | undefined, skills: string[] | undefined): SkillPrompt[] {
  if (!Array.isArray(skills)) return [];

  return skills.flatMap((rawSkill) => {
    const skillName = sanitizeSkillName(rawSkill);
    if (!skillName) return [];

    const skillFile = resolveSkillFile(agentDir, skillName);
    if (!skillFile) return [];

    const source = readFileSync(skillFile, 'utf-8');
    const parsed = parseSkillMarkdown(source);
    const content = parsed.body || source.trim();
    if (!content) return [];

    return [{ name: sanitizeSkillName(parsed.meta.name) || skillName, content }];
  });
}

function resolveSkillFile(agentDir: string | undefined, skillName: string): string | undefined {
  const candidates = [
    ...(agentDir ? [
      join(agentDir, 'skills', skillName, 'SKILL.md'),
      join(agentDir, 'skills', `${skillName}.md`),
    ] : []),
    join(getDataDir(), 'skills', skillName, 'SKILL.md'),
    join(getDataDir(), 'skills', `${skillName}.md`),
  ];

  return candidates.find((file) => existsSync(file) && statSync(file).size > 0);
}

function parseSkillMarkdown(source: string): { meta: Record<string, string>; body: string } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: source.trim() };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!parsed) continue;
    meta[parsed[1]] = parsed[2].trim().replace(/^['"]|['"]$/g, '');
  }

  return { meta, body: source.slice(match[0].length).trim() };
}

function sanitizeSkillName(name: string | undefined): string {
  const raw = basename(name ?? '').replace(/\.md$/i, '').trim();
  return raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildLangChainTools(
  functionTools: AgentFunctionTool[] | undefined,
  output: string[],
  options: AgentRunOptions | undefined,
  log: (message: string) => void,
  progress: LangChainRunProgress = createLangChainRunProgress(),
): NonNullable<CreateAgentParams['tools']> {
  if (!functionTools?.length) return [];
  return functionTools.map((runtimeTool) => tool(
    async (input: unknown) => {
      const startedAt = Date.now();
      const toolUseId = `${runtimeTool.name}-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
      const line = `Tool: ${runtimeTool.name} input=${JSON.stringify(input)}`;
      progress.recordToolUse();
      log(`tool use | source=function id=${toolUseId} name=${runtimeTool.name} descriptionChars=${runtimeTool.description.length} input=${summarizeForLog(input, 800)}`);
      output.push(line);
      options?.onEvent?.({ type: 'tool_use', id: toolUseId, name: runtimeTool.name, input, line });
      try {
        const result = await runtimeTool.execute(input);
        progress.recordToolResult(result);
        log(`tool result | source=function id=${toolUseId} name=${runtimeTool.name} elapsedMs=${Date.now() - startedAt} output=${summarizeForLog(result, 1000)}`);
        options?.onEvent?.({ type: 'tool_result', toolUseId, result });
        return stringifyToolResult(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`tool error | source=function id=${toolUseId} name=${runtimeTool.name} elapsedMs=${Date.now() - startedAt} error=${truncateForLog(message, 1000)}`);
        if (err instanceof Error && err.stack) console.error(err.stack);
        options?.onEvent?.({ type: 'tool_result', toolUseId, result: { success: false, error: message } });
        throw err;
      }
    },
    {
      name: runtimeTool.name,
      description: runtimeTool.description,
      schema: runtimeTool.inputSchema,
    },
  )) as NonNullable<CreateAgentParams['tools']>;
}

interface LangChainModelSettings {
  provider?: string;
  modelIdentifier: string;
  providerCorrectionReason?: string;
}

export function resolveLangChainModelSettings(config: AgentRuntimeConfig): LangChainModelSettings {
  const model = config.model || 'gpt-4o-mini';
  const configuredProvider = normalizeLangChainProvider(config.provider);
  const inferredProvider = inferLangChainProviderFromBaseURL(config.baseURL);
  const provider = configuredProvider === 'anthropic' && inferredProvider === 'openai'
    ? inferredProvider
    : configuredProvider;
  const plainModel = provider ? stripLangChainProviderPrefix(model) : model;
  const providerCorrectionReason = provider !== configuredProvider
    ? `baseURL=${config.baseURL} is OpenAI-compatible, using ${provider} instead of ${configuredProvider}`
    : undefined;

  return {
    provider,
    modelIdentifier: provider ? `${provider}:${plainModel}` : plainModel,
    providerCorrectionReason,
  };
}

function normalizeLangChainProvider(provider?: AgentRuntimeConfig['provider']): string | undefined {
  switch (provider) {
    case 'anthropic-messages':
      return 'anthropic';
    case 'openai-chat-completions':
    case 'openai-responses':
      return 'openai';
    case 'gemini-generate-content':
      return 'google-genai';
    default:
      return undefined;
  }
}

function buildModelConfig(config: AgentRuntimeConfig): Record<string, unknown> {
  return removeUndefined({
    apiKey: config.apiKey,
    api_key: config.apiKey,
    baseURL: config.baseURL,
    baseUrl: config.baseURL,
    configuration: config.baseURL ? { baseURL: config.baseURL } : undefined,
  });
}

function inferLangChainProviderFromBaseURL(baseURL?: string): string | undefined {
  if (!baseURL) return undefined;
  try {
    const hostname = new URL(baseURL).hostname.toLowerCase();
    if (hostname === 'open.bigmodel.cn' || hostname.endsWith('.bigmodel.cn')) return 'openai';
  } catch {
    return undefined;
  }
  return undefined;
}

function stripLangChainProviderPrefix(model: string): string {
  const match = /^(anthropic|openai|google-genai):(.+)$/i.exec(model);
  return match?.[2] || model;
}

export function stringifyToolResult(result: unknown): string {
  if (result === undefined) return 'null';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2) ?? String(result);
  } catch {
    return String(result);
  }
}

function createLangChainMcpClient(
  mcpServers: Record<string, unknown> | undefined,
  output: string[],
  options: AgentRunOptions | undefined,
  log: (message: string) => void,
  progress: LangChainRunProgress = createLangChainRunProgress(),
): MultiServerMCPClient | undefined {
  log(`normalizing MCP servers | requested=${Object.keys(mcpServers ?? {}).join(',') || '-'}`);
  const normalizedMcpServers = normalizeLangChainMcpServers(mcpServers);
  if (!normalizedMcpServers) {
    log('normalizing MCP servers | none');
    return undefined;
  }
  log(`normalized MCP servers | ${summarizeMcpServersForLog(normalizedMcpServers)}`);
  return new MultiServerMCPClient({
    throwOnLoadError: true,
    prefixToolNameWithServerName: true,
    additionalToolNamePrefix: 'mcp',
    useStandardContentBlocks: false,
    outputHandling: 'content',
    mcpServers: normalizedMcpServers,
    beforeToolCall: (request) => {
      const name = formatMcpToolName(request.serverName, request.name);
      const line = `Tool: ${name} input=${JSON.stringify(request.args ?? {})}`;
      progress.recordToolUse();
      log(`tool use | source=mcp server=${request.serverName} name=${name} input=${summarizeForLog(request.args ?? {}, 800)}`);
      output.push(line);
      options?.onEvent?.({ type: 'tool_use', id: name, name, input: request.args ?? {}, line });
    },
    afterToolCall: (result) => {
      const name = formatMcpToolName(result.serverName, result.name);
      const outputText = stringifyToolResult(result.result);
      progress.recordToolResult(outputText);
      log(`tool result | source=mcp server=${result.serverName} name=${name} chars=${outputText.length} output=${truncateForLog(outputText, 1000)}`);
      options?.onEvent?.({ type: 'tool_result', toolUseId: name, result: outputText });
      return { result: outputText };
    },
    onProgress: (progress, source) => {
      if (source.type !== 'tool') return;
      const name = formatMcpToolName(source.server, source.name);
      const progressText = progress.total
        ? `${progress.progress}/${progress.total}`
        : String(progress.progress);
      log(`tool progress | source=mcp server=${source.server} name=${name} progress=${progressText}${progress.message ? ` message=${truncateForLog(progress.message, 300)}` : ''}`);
    },
    onMessage: (message, source) => {
      log(`mcp message | server=${source.server} level=${message.level ?? '-'} data=${summarizeForLog(message.data, 500)}`);
    },
  });
}

export function normalizeLangChainMcpServers(
  mcpServers: Record<string, unknown> | undefined,
): Record<string, Connection> | undefined {
  if (!mcpServers || Object.keys(mcpServers).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(mcpServers).map(([name, server]) => [name, normalizeLangChainMcpServer(server)]),
  );
}

function normalizeLangChainMcpServer(server: unknown): Connection {
  if (!isRecord(server)) {
    throw new Error('MCP server config must be an object.');
  }
  const normalized = normalizeOpenAgentCompatibleFetchMcpServer(server);
  if (typeof normalized.url === 'string') {
    return removeUndefined({
      ...normalized,
      transport: normalized.transport === 'sse' || normalized.type === 'sse' ? 'sse' : 'http',
      url: normalized.url,
      headers: isStringRecord(normalized.headers) ? normalized.headers : undefined,
    }) as Connection;
  }
  if (typeof normalized.command === 'string') {
    return removeUndefined({
      ...normalized,
      transport: 'stdio',
      command: normalized.command,
      args: Array.isArray(normalized.args) ? normalized.args.map(String) : [],
      env: isStringRecord(normalized.env) ? normalized.env : undefined,
      cwd: typeof normalized.cwd === 'string' ? normalized.cwd : undefined,
    }) as Connection;
  }
  throw new Error('MCP server config requires either url or command.');
}

function normalizeOpenAgentCompatibleFetchMcpServer(server: Record<string, unknown>): Record<string, unknown> {
  const args = Array.isArray(server.args) ? server.args.map(String) : undefined;
  const badFetchPackageIndex = args?.indexOf('@modelcontextprotocol/server-fetch') ?? -1;
  if (String(server.command) !== 'npx' || !args || badFetchPackageIndex < 0) return server;
  return {
    ...server,
    command: 'uvx',
    args: ['mcp-server-fetch', ...args.slice(badFetchPackageIndex + 1)],
    env: {
      PYTHONIOENCODING: 'utf-8',
      ...(isStringRecord(server.env) ? server.env : {}),
    },
  };
}

function formatMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

function summarizeOptionsForLog(options: AgentRunOptions | undefined): string {
  if (!options) return '-';
  return summarizeForLog({
    maxTurns: options.maxTurns,
    tools: options.tools,
    functionTools: options.functionTools?.map((runtimeTool) => ({
      name: runtimeTool.name,
      descriptionChars: runtimeTool.description.length,
      annotations: runtimeTool.annotations,
      inputSchema: runtimeTool.inputSchema,
    })),
    mcpServers: Object.keys(options.mcpServers ?? {}),
    skills: options.skills,
    configDir: options.configDir,
    sandboxDirs: options.sandboxDirs,
    systemPromptChars: options.systemPrompt?.length,
    userPromptChars: options.userPrompt?.length,
    outputStyle: options.outputStyle,
    resumeSessionId: options.resumeSessionId,
    onEvent: options.onEvent ? 'set' : undefined,
  }, 2000);
}

export function createThrottledRuntimeEventSink(onEvent: AgentRunOptions['onEvent']): {
  emit: (event: AgentRuntimeEvent) => void;
  flush: () => void;
} {
  const pending: AgentRuntimeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!onEvent || pending.length === 0) return;
    const events = pending.splice(0, pending.length);
    for (const event of events) onEvent(event);
  };

  const schedule = () => {
    if (!onEvent || timer) return;
    timer = setTimeout(flush, STREAM_EVENT_THROTTLE_MS);
  };

  const emit = (event: AgentRuntimeEvent) => {
    if (!onEvent) return;
    if (event.type !== 'output' && event.type !== 'reasoning') {
      flush();
      onEvent(event);
      return;
    }

    const previous = pending.at(-1);
    if (event.type === 'output' && previous?.type === 'output') {
      previous.line += event.line;
    } else if (event.type === 'reasoning' && previous?.type === 'reasoning') {
      previous.text += event.text;
      previous.status = event.status ?? previous.status;
    } else {
      pending.push({ ...event });
    }
    schedule();
  };

  return { emit, flush };
}

function summarizeStreamTokenForLog(
  token: Record<string, unknown>,
  text: string,
  reasoning: string,
  usage: AgentRunResult['usage'] | undefined,
): string {
  const contentBlocks = Array.isArray(token.contentBlocks) ? token.contentBlocks : [];
  return summarizeForLog(removeUndefined({
    type: getMessageType(token) ?? token.type,
    role: token.role,
    id: token.id,
    contentBlockTypes: contentBlocks
      .map((block) => isRecord(block) ? block.type : typeof block)
      .filter(Boolean),
    textChars: text.length,
    textPreview: text ? truncateForLog(text, 160) : undefined,
    reasoningChars: reasoning.length,
    reasoningPreview: reasoning ? truncateForLog(reasoning, 160) : undefined,
    usage,
    toolCallCount: countToolCalls(token) || undefined,
    invalidToolCallCount: Array.isArray(token.invalid_tool_calls) ? token.invalid_tool_calls.length : undefined,
    finishReason: extractFinishReason(token),
  }), 500);
}

function splitLangChainStreamChunk(chunk: unknown): { mode?: string; payload: unknown } {
  if (
    Array.isArray(chunk)
    && chunk.length === 2
    && typeof chunk[0] === 'string'
    && (chunk[0] === 'messages' || chunk[0] === 'values')
  ) {
    return { mode: chunk[0], payload: chunk[1] };
  }
  return { payload: chunk };
}

function extractStateMessages(state: unknown): unknown[] {
  if (!isRecord(state) || !Array.isArray(state.messages)) return [];
  return state.messages;
}

function extractUpdateMessages(update: unknown): unknown[] {
  if (Array.isArray(update)) {
    return update.flatMap((entry) => extractUpdateMessages(entry));
  }
  if (!isRecord(update)) return [];
  if (Array.isArray(update.messages)) return update.messages;
  return Object.values(update).flatMap((value) => extractUpdateMessages(value));
}

function extractFinalAssistantTextFromState(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message) || !isAiStreamToken(message)) continue;
    if (countToolCalls(message) > 0) return '';
    return extractTextFromToken(message);
  }
  return '';
}

function summarizeStateMessagesForLog(messages: unknown[]): string {
  if (!messages.length) return '';
  const summary = messages.map((message, index) => {
    if (!isRecord(message)) return `${index}:unknown`;
    const type = getMessageType(message) ?? message.type ?? message.role ?? inferSerializedMessageType(message);
    const kwargs = isRecord(message.kwargs) ? message.kwargs : undefined;
    const role = typeof message.role === 'string'
      ? message.role
      : typeof kwargs?.role === 'string'
        ? kwargs.role
        : undefined;
    const text = extractTextFromToken(message);
    const toolCalls = countToolCalls(message);
    const finishReason = extractFinishReason(message);
    return [
      `${index}:${String(type || 'unknown')}`,
      role && role !== type ? `role=${role}` : undefined,
      text ? `text=${text.length}` : undefined,
      toolCalls ? `toolCalls=${toolCalls}` : undefined,
      finishReason ? `finish=${finishReason}` : undefined,
      type === 'generic' ? `keys=${Object.keys(message).join(',')}` : undefined,
    ].filter(Boolean).join('/');
  });
  return summary.join(' > ');
}

function inferSerializedMessageType(message: Record<string, unknown>): string | undefined {
  const id = Array.isArray(message.id) ? message.id : undefined;
  return typeof id?.at(-1) === 'string' ? id.at(-1) : undefined;
}

function countToolCalls(message: Record<string, unknown>): number {
  const direct = Array.isArray(message.tool_calls) ? message.tool_calls.length : 0;
  if (direct) return direct;
  const kwargs = isRecord(message.kwargs) ? message.kwargs : undefined;
  return Array.isArray(kwargs?.tool_calls) ? kwargs.tool_calls.length : 0;
}

function extractFinishReason(message: Record<string, unknown>): string | undefined {
  const responseMetadata = isRecord(message.response_metadata) ? message.response_metadata : undefined;
  const kwargs = isRecord(message.kwargs) ? message.kwargs : undefined;
  const kwargsResponseMetadata = isRecord(kwargs?.response_metadata) ? kwargs.response_metadata : undefined;
  const additionalKwargs = isRecord(message.additional_kwargs) ? message.additional_kwargs : undefined;
  const kwargsAdditional = isRecord(kwargs?.additional_kwargs) ? kwargs.additional_kwargs : undefined;
  const value = responseMetadata?.finish_reason
    ?? responseMetadata?.finishReason
    ?? kwargsResponseMetadata?.finish_reason
    ?? kwargsResponseMetadata?.finishReason
    ?? additionalKwargs?.finish_reason
    ?? kwargsAdditional?.finish_reason;
  return typeof value === 'string' ? value : undefined;
}

function summarizeMcpServersForLog(mcpServers: Record<string, Connection>): string {
  return summarizeForLog(Object.fromEntries(
    Object.entries(mcpServers).map(([name, server]) => [name, summarizeMcpServerForLog(server)]),
  ), 2000);
}

function summarizeMcpServerForLog(server: Connection): Record<string, unknown> {
  const record = server as Record<string, unknown>;
  return removeUndefined({
    transport: record.transport,
    url: typeof record.url === 'string' ? record.url : undefined,
    command: typeof record.command === 'string' ? record.command : undefined,
    args: Array.isArray(record.args) ? record.args : undefined,
    cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
    headers: isStringRecord(record.headers) ? Object.keys(record.headers) : undefined,
    env: isStringRecord(record.env) ? Object.keys(record.env) : undefined,
  });
}

function summarizeEnvForLog(env: Record<string, string | undefined>): string {
  const configured = Object.entries(env)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
  return configured.length ? configured.join(',') : '-';
}

function maskSensitiveConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => {
    if (/api[_-]?key/i.test(key)) return [key, value ? 'set' : value];
    if (key === 'configuration' && isRecord(value)) return [key, maskSensitiveConfig(value)];
    return [key, value];
  }));
}

function getObjectTypeName(value: unknown): string {
  return isRecord(value) && typeof value.constructor === 'function'
    ? value.constructor.name
    : typeof value;
}

function summarizeForLog(value: unknown, maxLength = 300): string {
  if (typeof value === 'string') return truncateForLog(value, maxLength);
  return truncateForLog(stringifyToolResult(value), maxLength);
}

function truncateForLog(value: string, maxLength = 300): string {
  const limit = Math.max(0, Math.min(maxLength, MAX_DEBUG_LOG_CHARS));
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function buildProviderEnv(config: AgentRuntimeConfig, resolvedProvider?: string): Record<string, string | undefined> {
  const provider = resolvedProvider ?? normalizeLangChainProvider(config.provider);
  return {
    OPENAI_API_KEY: provider === 'openai' ? config.apiKey : undefined,
    OPENAI_BASE_URL: provider === 'openai' ? config.baseURL : undefined,
    ANTHROPIC_API_KEY: provider === 'anthropic' ? config.apiKey : undefined,
    ANTHROPIC_BASE_URL: provider === 'anthropic' ? config.baseURL : undefined,
    GOOGLE_API_KEY: provider === 'google-genai' ? config.apiKey : undefined,
    GEMINI_API_KEY: provider === 'google-genai' ? config.apiKey : undefined,
  };
}

async function withTemporaryEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function extractTextFromToken(token: Record<string, unknown>): string {
  const blocks = Array.isArray(token.contentBlocks) ? token.contentBlocks : [];
  const text = blocks
    .map((block) => extractContentBlockText(block))
    .filter(Boolean)
    .join('');
  if (text) return text;
  if (isRecord(token.kwargs)) return extractTextFromToken(token.kwargs);
  return stringifyMessageContent(token.content);
}

export function extractReasoningFromToken(token: Record<string, unknown>): string {
  const blocks = Array.isArray(token.contentBlocks) ? token.contentBlocks : [];
  const reasoning = blocks
    .map((block) => extractContentBlockReasoning(block))
    .filter(Boolean)
    .join('');
  if (reasoning) return reasoning;
  return isRecord(token.kwargs) ? extractReasoningFromToken(token.kwargs) : '';
}

function extractContentBlockText(block: unknown): string {
  if (!isRecord(block) || block.type !== 'text') return '';
  if (typeof block.text === 'string') return block.text;
  if (typeof block.content === 'string') return block.content;
  return '';
}

function extractContentBlockReasoning(block: unknown): string {
  if (!isRecord(block) || block.type !== 'reasoning') return '';
  if (typeof block.reasoning === 'string') return block.reasoning;
  if (typeof block.text === 'string') return block.text;
  if (typeof block.content === 'string') return block.content;
  return '';
}

export function isAiStreamToken(token: Record<string, unknown>): boolean {
  const type = String(getMessageType(token) ?? inferSerializedMessageType(token) ?? token.type ?? '').toLowerCase();
  if (type === 'ai' || type === 'assistant' || type === 'aimessage' || type === 'aimessagechunk') return true;
  if (type && type !== 'generic') return false;

  const role = String(token.role ?? '').toLowerCase();
  if (role) return role === 'ai' || role === 'assistant';

  if (isRecord(token.kwargs)) return isAiStreamToken(token.kwargs);

  if (typeof token.tool_call_id === 'string' || typeof token.toolCallId === 'string') return false;
  if (!Array.isArray(token.contentBlocks)) return false;
  return token.contentBlocks.some((block) => (
    isRecord(block) && (block.type === 'text' || block.type === 'reasoning')
  ));
}

function getMessageType(message: Record<string, unknown>): string | undefined {
  const getType = message._getType;
  return typeof getType === 'function' ? getType.call(message) : undefined;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!isRecord(part)) return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractUsageFromMessage(message: Record<string, unknown>): AgentRunResult['usage'] {
  const usage = isRecord(message.usage_metadata)
    ? message.usage_metadata
    : isRecord(message.response_metadata) && isRecord(message.response_metadata.tokenUsage)
      ? message.response_metadata.tokenUsage
      : undefined;
  if (!usage) return undefined;
  const inputTokens = numberFrom(usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens);
  const outputTokens = numberFrom(usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens);
  const totalTokens = numberFrom(usage.total_tokens ?? usage.totalTokens) ?? (
    inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined
  );
  return removeUndefined({ inputTokens, outputTokens, totalTokens });
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

export const __testables = {
  extractStateMessages,
  extractUpdateMessages,
  splitLangChainStreamChunk,
};
