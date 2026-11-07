import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type {
  AgentFunctionTool,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { appendOutputStyleToPrompt, summarizeResult } from './agent-runtime-types.js';
import { normalizeLangChainMcpServers, stringifyToolResult } from './langchain-runtime.js';

export class PiRuntime implements AgentRuntime {
  private static nextRunId = 1;
  private session: AgentSession | null = null;
  private activeRunId: number | null = null;
  private stopped = false;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const cwd = workingDir || process.cwd();
    const output: string[] = [];
    const agentDir = options?.configDir || join(cwd, '.pi');
    const sessionDir = join(agentDir, 'sessions');
    const systemPrompt = options?.systemPrompt?.trim();
    const runId = PiRuntime.nextRunId++;
    const startedAt = Date.now();
    const log = (message: string) => console.log(`[pi:${runId}] ${message}`);
    let mcpClient: MultiServerMCPClient | undefined;
    let stage = 'initialize';
    this.activeRunId = runId;
    this.stopped = false;
    log(`starting | cwd=${cwd} provider=${this.config.provider ?? 'auto'} model=${this.config.model ?? 'auto'} baseURL=${sanitizeUrlForLog(this.config.baseURL)} apiKey=${this.config.apiKey ? 'set' : 'unset'} thinking=${normalizeThinkingLevel(this.config)} promptChars=${prompt.length} systemPrompt=${systemPrompt ? 'custom' : 'default'} resume=${options?.resumeSessionId ?? '-'} tools=${options?.tools?.join(',') || 'default'} functionTools=${options?.functionTools?.map((tool) => tool.name).join(',') || '-'} mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${options?.skills?.join(',') || '-'}`);

    try {
      stage = 'configure';
      mkdirSync(agentDir, { recursive: true });
      const authStorage = AuthStorage.create(join(agentDir, 'auth.json'));
      const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, 'models.json'));
      const model = resolveModel(this.config, authStorage, modelRegistry);
      log(`model resolved | provider=${model?.provider ?? 'auto'} model=${model?.id ?? 'auto'} api=${model?.api ?? 'auto'}`);
      const shellPath = resolveShellPath();
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, shellPath });
      log(`shell resolved | path=${shellPath ?? 'default'}`);
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        systemPromptOverride: systemPrompt ? () => systemPrompt : undefined,
        appendSystemPromptOverride: systemPrompt ? () => [] : undefined,
      });
      stage = 'load resources';
      await resourceLoader.reload();
      log(`resources loaded | agentDir=${agentDir}`);

      stage = 'load tools';
      const nativeTools = toPiTools(options?.functionTools);
      const normalizedMcpServers = normalizeLangChainMcpServers(options?.mcpServers);
      if (normalizedMcpServers) {
        log(`MCP connecting | servers=${Object.keys(normalizedMcpServers).join(',')}`);
        mcpClient = new MultiServerMCPClient({
          throwOnLoadError: true,
          prefixToolNameWithServerName: true,
          additionalToolNamePrefix: 'mcp',
          useStandardContentBlocks: false,
          outputHandling: 'content',
          mcpServers: normalizedMcpServers,
        });
        const mcpTools = toPiMcpTools(await mcpClient.getTools());
        nativeTools.push(...mcpTools);
        log(`MCP connected | tools=${mcpTools.map((tool) => tool.name).join(',') || '-'}`);
      }
      const allowedTools = resolveAllowedTools(options?.tools, nativeTools);
      log(`tools resolved | custom=${nativeTools.map((tool) => tool.name).join(',') || '-'} allowed=${allowedTools?.join(',') || 'default'}`);

      stage = 'create session';
      const sessionManager = await resolveSessionManager(cwd, sessionDir, options?.resumeSessionId);
      const { session } = await createAgentSession({
        cwd,
        agentDir,
        authStorage,
        modelRegistry,
        model,
        thinkingLevel: normalizeThinkingLevel(this.config),
        tools: allowedTools,
        customTools: nativeTools,
        resourceLoader,
        sessionManager,
        settingsManager,
      });
      this.session = session;
      log(`session ready | id=${session.sessionId} mode=${options?.resumeSessionId ? 'resume' : 'new'} activeTools=${session.getActiveToolNames().join(',') || '-'}`);
      options?.onEvent?.({ type: 'session', sessionId: session.sessionId });
      const unsubscribe = session.subscribe((event) => handleSessionEvent(event, output, options, log));

      try {
        stage = 'prompt';
        log('prompt started');
        await session.prompt(appendOutputStyleToPrompt(prompt, options?.outputStyle));
        const stats = session.getSessionStats();
        const text = output.at(-1) ?? '';
        log(`completed | elapsedMs=${Date.now() - startedAt} outputLines=${output.length} outputChars=${output.reduce((sum, line) => sum + line.length, 0)} inputTokens=${stats.tokens.input} outputTokens=${stats.tokens.output} totalTokens=${stats.tokens.total} cachedTokens=${stats.tokens.cacheRead} costUsd=${stats.cost}`);
        return {
          success: true,
          summary: summarizeResult(text),
          artifacts: [],
          output,
          sessionId: session.sessionId,
          usage: {
            inputTokens: stats.tokens.input,
            outputTokens: stats.tokens.output,
            totalTokens: stats.tokens.total,
            cachedInputTokens: stats.tokens.cacheRead,
          },
          costUsd: stats.cost,
        };
      } finally {
        unsubscribe();
        session.dispose();
        this.session = null;
        log('session disposed');
      }
    } catch (error) {
      const message = this.stopped
        ? 'Pi execution stopped'
        : error instanceof Error ? error.message : String(error);
      log(`failed | stage=${stage} elapsedMs=${Date.now() - startedAt} error=${message}`);
      return {
        success: false,
        summary: 'Pi execution failed',
        artifacts: [],
        error: message,
        output,
        sessionId: options?.resumeSessionId,
      };
    } finally {
      await mcpClient?.close().catch((error) => log(`MCP close failed | ${String(error)}`));
      if (mcpClient) log('MCP closed');
      this.activeRunId = null;
    }
  }

  stop(): void {
    this.stopped = true;
    console.log(`[pi:${this.activeRunId ?? '-'}] stop requested | session=${this.session?.sessionId ?? '-'}`);
    void this.session?.abort();
  }
}

function resolveModel(
  config: AgentRuntimeConfig,
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
) {
  if (!config.model) return undefined;

  const provider = normalizeProviderName(config.provider);
  let model = modelRegistry.find(provider, config.model)
    ?? modelRegistry.getAll().find((candidate) => candidate.id === config.model);

  if (!model || config.baseURL) {
    const api = normalizePiApi(config.provider);
    modelRegistry.registerProvider(provider, {
      baseUrl: config.baseURL || defaultBaseURL(api),
      apiKey: config.apiKey,
      api,
      models: [{
        id: config.model,
        name: config.model,
        api,
        reasoning: config.thinkingEnabled !== false,
        input: ['text', 'image'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: config.maxTokens ?? 16_384,
      }],
    });
    model = modelRegistry.find(provider, config.model);
  }

  if (!model) throw new Error(`Pi model not found: ${provider}/${config.model}`);
  if (config.apiKey) authStorage.setRuntimeApiKey(model.provider, config.apiKey);
  return model;
}

async function resolveSessionManager(
  cwd: string,
  sessionDir: string,
  resumeSessionId?: string,
): Promise<SessionManager> {
  if (!resumeSessionId) return SessionManager.create(cwd, sessionDir);
  const match = (await SessionManager.list(cwd, sessionDir)).find((session) => session.id === resumeSessionId);
  if (!match) throw new Error(`Pi session not found: ${resumeSessionId}`);
  return SessionManager.open(match.path, sessionDir, cwd);
}

function toPiTools(tools: AgentFunctionTool[] | undefined): ToolDefinition[] {
  return (tools ?? []).map((tool) => defineTool({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as ToolDefinition['parameters'],
    execute: async (_toolCallId, params) => {
      const result = await tool.execute(params);
      return {
        content: [{ type: 'text', text: stringifyToolResult(result) }],
        details: result,
      };
    },
  }));
}

function toPiMcpTools(tools: Awaited<ReturnType<MultiServerMCPClient['getTools']>>): ToolDefinition[] {
  return tools.map((tool) => defineTool({
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.schema as ToolDefinition['parameters'],
    execute: async (_toolCallId, params) => {
      const result = await tool.invoke(params);
      return {
        content: [{ type: 'text', text: stringifyToolResult(result) }],
        details: result,
      };
    },
  }));
}

function resolveAllowedTools(requested: string[] | undefined, customTools: ToolDefinition[]): string[] | undefined {
  if (!requested?.length) return undefined;
  return [...new Set([
    ...requested.map((name) => normalizeToolName(name)),
    ...customTools.map((tool) => tool.name),
  ])];
}

function handleSessionEvent(
  event: AgentSessionEvent,
  output: string[],
  options: AgentRunOptions | undefined,
  log: (message: string) => void,
): void {
  switch (event.type) {
    case 'agent_start':
      log('agent started');
      break;
    case 'agent_end':
      log(`agent ended | messages=${event.messages.length}`);
      break;
    case 'turn_start':
      log('turn started');
      break;
    case 'tool_execution_start': {
      const line = `Tool: ${event.toolName} ${JSON.stringify(event.args)}`;
      log(`tool started | id=${event.toolCallId} name=${event.toolName}`);
      options?.onEvent?.({
        type: 'tool_use',
        id: event.toolCallId,
        name: event.toolName,
        input: event.args,
        line,
      });
      break;
    }
    case 'tool_execution_end':
      log(`tool ended | id=${event.toolCallId} name=${event.toolName} error=${event.isError}`);
      options?.onEvent?.({ type: 'tool_result', toolUseId: event.toolCallId, result: event.result });
      break;
    case 'turn_end': {
      const reasoning = extractMessageText(event.message, new Set(['thinking', 'reasoning']));
      log(`turn ended | toolResults=${event.toolResults.length} reasoningChars=${reasoning.length}`);
      if (reasoning) options?.onEvent?.({ type: 'reasoning', text: reasoning, status: 'completed' });
      if (hasToolCall(event.message)) break;
      const text = extractMessageText(event.message, new Set(['text', 'output_text']));
      if (!text) break;
      output.push(text);
      options?.onEvent?.({ type: 'output', line: text });
      break;
    }
  }
}

function extractMessageText(message: unknown, acceptedTypes: Set<string>): string {
  if (!isRecord(message) || !Array.isArray(message.content)) return '';
  return message.content
    .filter(isRecord)
    .filter((block) => acceptedTypes.has(String(block.type)))
    .map((block) => String(block.text ?? block.thinking ?? ''))
    .filter(Boolean)
    .join('');
}

function hasToolCall(message: unknown): boolean {
  return isRecord(message)
    && Array.isArray(message.content)
    && message.content.some((block) => isRecord(block) && /tool[_-]?(call|use)/i.test(String(block.type)));
}

function normalizeProviderName(provider?: AgentRuntimeConfig['provider']): string {
  return String(provider || 'agent-spaces').trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'agent-spaces';
}

function normalizePiApi(provider?: AgentRuntimeConfig['provider']):
  'anthropic-messages' | 'openai-responses' | 'google-generative-ai' | 'openai-completions' {
  switch (provider) {
    case 'anthropic-messages':
      return 'anthropic-messages';
    case 'openai-responses':
      return 'openai-responses';
    case 'gemini-generate-content':
      return 'google-generative-ai';
    default:
      return 'openai-completions';
  }
}

function defaultBaseURL(api: ReturnType<typeof normalizePiApi>): string {
  if (api === 'anthropic-messages') return 'https://api.anthropic.com';
  if (api === 'google-generative-ai') return 'https://generativelanguage.googleapis.com/v1beta';
  return 'https://api.openai.com/v1';
}

function resolveShellPath(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return existsSync(powershell) ? powershell : undefined;
}

function sanitizeUrlForLog(value?: string): string {
  if (!value) return 'default';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return 'custom';
  }
}

function normalizeThinkingLevel(config: AgentRuntimeConfig): 'off' | 'low' | 'medium' | 'high' {
  if (config.thinkingEnabled === false) return 'off';
  return config.thinkingEffort ?? 'medium';
}

function normalizeToolName(name: string): string {
  const normalized = name.trim();
  const builtIn = new Set(['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']);
  return builtIn.has(normalized.toLowerCase()) ? normalized.toLowerCase() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
