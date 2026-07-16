import { mkdirSync } from 'node:fs';
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
  private session: AgentSession | null = null;
  private stopped = false;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const cwd = workingDir || process.cwd();
    const output: string[] = [];
    const agentDir = options?.configDir || join(cwd, '.pi');
    const sessionDir = join(agentDir, 'sessions');
    const systemPrompt = options?.systemPrompt?.trim();
    const log = (message: string) => console.log(`[pi] ${message}`);
    let mcpClient: MultiServerMCPClient | undefined;
    this.stopped = false;

    try {
      mkdirSync(agentDir, { recursive: true });
      const authStorage = AuthStorage.create(join(agentDir, 'auth.json'));
      const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, 'models.json'));
      const model = resolveModel(this.config, authStorage, modelRegistry);
      const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
      const resourceLoader = new DefaultResourceLoader({
        cwd,
        agentDir,
        settingsManager,
        systemPromptOverride: systemPrompt ? () => systemPrompt : undefined,
        appendSystemPromptOverride: systemPrompt ? () => [] : undefined,
      });
      await resourceLoader.reload();

      const nativeTools = toPiTools(options?.functionTools);
      const normalizedMcpServers = normalizeLangChainMcpServers(options?.mcpServers);
      if (normalizedMcpServers) {
        mcpClient = new MultiServerMCPClient({
          throwOnLoadError: true,
          prefixToolNameWithServerName: true,
          additionalToolNamePrefix: 'mcp',
          useStandardContentBlocks: false,
          outputHandling: 'content',
          mcpServers: normalizedMcpServers,
        });
        nativeTools.push(...toPiMcpTools(await mcpClient.getTools()));
      }

      const sessionManager = await resolveSessionManager(cwd, sessionDir, options?.resumeSessionId);
      const { session } = await createAgentSession({
        cwd,
        agentDir,
        authStorage,
        modelRegistry,
        model,
        thinkingLevel: normalizeThinkingLevel(this.config),
        tools: resolveAllowedTools(options?.tools, nativeTools),
        customTools: nativeTools,
        resourceLoader,
        sessionManager,
        settingsManager,
      });
      this.session = session;
      options?.onEvent?.({ type: 'session', sessionId: session.sessionId });
      const unsubscribe = session.subscribe((event) => handleSessionEvent(event, output, options));

      try {
        await session.prompt(appendOutputStyleToPrompt(prompt, options?.outputStyle));
        const stats = session.getSessionStats();
        const text = output.at(-1) ?? '';
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
      }
    } catch (error) {
      const message = this.stopped
        ? 'Pi execution stopped'
        : error instanceof Error ? error.message : String(error);
      log(`failed | ${message}`);
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
    }
  }

  stop(): void {
    this.stopped = true;
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

function handleSessionEvent(event: AgentSessionEvent, output: string[], options?: AgentRunOptions): void {
  switch (event.type) {
    case 'message_update':
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        options?.onEvent?.({
          type: 'reasoning',
          text: event.assistantMessageEvent.delta,
          status: 'streaming',
        });
      }
      break;
    case 'tool_execution_start': {
      const line = `Tool: ${event.toolName} ${stringifyToolResult(event.args)}`;
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
      options?.onEvent?.({ type: 'tool_result', toolUseId: event.toolCallId, result: event.result });
      break;
    case 'turn_end': {
      const reasoning = extractMessageText(event.message, new Set(['thinking', 'reasoning']));
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
