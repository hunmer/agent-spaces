import { createAgent, initChatModel, tool } from 'langchain';
import type { CreateAgentParams } from 'langchain';
import { z } from 'zod';
import type {
  AgentFunctionTool,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { summarizeResult } from './agent-runtime-types.js';

/**
 * Runtime backed by LangChain.js.
 * Uses LangChain's provider-neutral createAgent API and adapts Agent Spaces tools.
 */
export class LangChainRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (msg: string) => console.log(`[langchain] ${msg}`);
    const model = buildModelIdentifier(this.config);

    d(`starting | cwd=${cwd} provider=${this.config.provider ?? 'auto'} model=${model} baseURL=${this.config.baseURL ?? 'default'} maxTurns=${options?.maxTurns ?? '∞'} tools=${options?.functionTools?.map((runtimeTool) => runtimeTool.name).join(',') || '-'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const chatModel = await withTemporaryEnv(
        buildProviderEnv(this.config),
        () => initChatModel(model, buildModelConfig(this.config)),
      );
      const agent = createAgent({
        model: chatModel,
        tools: buildLangChainTools(options?.functionTools, output, options),
        systemPrompt: options?.systemPrompt,
      });

      const result = await agent.invoke(
        { messages: [{ role: 'user', content: prompt }] },
        {
          signal: this.abortController?.signal,
          recursionLimit: options?.maxTurns ? Math.max(2, options.maxTurns * 2 + 1) : undefined,
        },
      );

      const text = extractFinalText(result);
      const usage = extractUsage(result);
      if (text) {
        output.push(text);
        options?.onEvent?.({ type: 'output', line: text });
      }
      if (usage?.totalTokens || usage?.inputTokens || usage?.outputTokens) {
        const usageLine = `[Usage] tokens=${usage.totalTokens ?? '-'} input=${usage.inputTokens ?? '-'} output=${usage.outputTokens ?? '-'}`;
        output.push(usageLine);
        options?.onEvent?.({ type: 'output', line: usageLine });
      }

      const elapsed = Date.now() - startTime;
      d(`done ${elapsed}ms | tokens=${usage?.totalTokens ?? 'unknown'}`);

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
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'LangChain execution failed', artifacts: [], error: message, output };
    } finally {
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
  }
}

function buildLangChainTools(
  functionTools: AgentFunctionTool[] | undefined,
  output: string[],
  options: AgentRunOptions | undefined,
): NonNullable<CreateAgentParams['tools']> {
  if (!functionTools?.length) return [];
  return functionTools.map((runtimeTool) => tool(
    async (input: unknown) => {
      const line = `Tool: ${runtimeTool.name} input=${JSON.stringify(input)}`;
      output.push(line);
      options?.onEvent?.({ type: 'tool_use', id: runtimeTool.name, name: runtimeTool.name, input, line });
      const result = await runtimeTool.execute(input);
      options?.onEvent?.({ type: 'tool_result', toolUseId: runtimeTool.name, result });
      return result;
    },
    {
      name: runtimeTool.name,
      description: runtimeTool.description,
      schema: z.object({}).passthrough(),
    },
  )) as NonNullable<CreateAgentParams['tools']>;
}

function buildModelIdentifier(config: AgentRuntimeConfig): string {
  const model = config.model || 'gpt-4o-mini';
  const provider = normalizeLangChainProvider(config.provider);
  if (!provider || model.includes(':')) return model;
  return `${provider}:${model}`;
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

function buildProviderEnv(config: AgentRuntimeConfig): Record<string, string | undefined> {
  const provider = normalizeLangChainProvider(config.provider);
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

function extractFinalText(result: unknown): string {
  const messages = isRecord(result) && Array.isArray(result.messages) ? result.messages : [];
  const last = [...messages].reverse().find((message) => isRecord(message) && getMessageType(message) === 'ai')
    ?? messages.at(-1);
  return stringifyMessageContent(isRecord(last) ? last.content : undefined);
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

function extractUsage(result: unknown): AgentRunResult['usage'] {
  const messages = isRecord(result) && Array.isArray(result.messages) ? result.messages : [];
  for (const message of [...messages].reverse()) {
    if (!isRecord(message)) continue;
    const usage = isRecord(message.usage_metadata)
      ? message.usage_metadata
      : isRecord(message.response_metadata) && isRecord(message.response_metadata.tokenUsage)
        ? message.response_metadata.tokenUsage
        : undefined;
    if (!usage) continue;
    const inputTokens = numberFrom(usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens);
    const outputTokens = numberFrom(usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens);
    const totalTokens = numberFrom(usage.total_tokens ?? usage.totalTokens) ?? (
      inputTokens !== undefined || outputTokens !== undefined ? (inputTokens ?? 0) + (outputTokens ?? 0) : undefined
    );
    return removeUndefined({ inputTokens, outputTokens, totalTokens });
  }
  return undefined;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
