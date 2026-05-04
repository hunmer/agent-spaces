import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpServerConfig, Options, PermissionMode, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type {
  AgentRunOptions,
  AgentRunResult,
  AgentRuntime,
  AgentRuntimeConfig,
} from './agent-runtime-types.js';
import { summarizeResult } from './agent-runtime-types.js';

/**
 * Runtime backed by Anthropic's Claude Agent SDK.
 * Uses the bundled Claude Code runtime so agents can create and edit files.
 */
export class ClaudeCodeRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;
  private activeQuery: Query | null = null;
  private adapterRun: ClaudeAdapterRun | null = null;

  constructor(private readonly config: AgentRuntimeConfig = {}) {}

  async execute(prompt: string, workingDir: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    this.abortController = new AbortController();
    const output: string[] = [];
    const cwd = workingDir || process.cwd();
    const startTime = Date.now();
    const d = (msg: string) => console.log(`[claude-code] ${msg}`);
    const permissionMode = normalizePermissionMode(this.config.permissionMode);
    const agentDir = options?.configDir;
    const configDir = agentDir ? join(agentDir, '.claude') : undefined;
    if (configDir) prepareConfigDir(configDir, agentDir);
    const skillNames = normalizeSkillNames(options?.skills, configDir);
    const claudeExecutable = resolveBundledClaudeExecutable();
    this.adapterRun = await startClaudeAdapterIfNeeded(this.config);
    const baseURL = this.adapterRun?.url ?? this.config.baseURL;
    const apiKey = this.adapterRun ? 'default' : this.config.apiKey;
    const model = getClaudeCodeModel(this.config);

    d(`starting | cwd=${cwd} model=${model ?? 'default'} targetModel=${this.config.model ?? 'default'} provider=${this.config.provider ?? 'default'} baseURL=${baseURL ?? 'default'} permissionMode=${permissionMode} maxTurns=${options?.maxTurns ?? '∞'} tools=claude_code mcpServers=${Object.keys(options?.mcpServers ?? {}).join(',') || '-'} skills=${skillNames.join(',') || '-'} configDir=${configDir ?? 'default'} sandboxDirs=${options?.sandboxDirs?.join(',') ?? '-'} claudeExecutable=${claudeExecutable ?? 'sdk-default'}`);
    d(`prompt: ${prompt.slice(0, 300)}${prompt.length > 300 ? '...' : ''}`);

    try {
      const queryOptions: Options = {
        cwd,
        model,
        maxTurns: options?.maxTurns,
        pathToClaudeCodeExecutable: claudeExecutable,
        tools: { type: 'preset', preset: 'claude_code' },
        mcpServers: normalizeMcpServers(options?.mcpServers),
        skills: skillNames,
        managedSettings: {
          strictPluginOnlyCustomization: ['mcp'],
        },
        settingSources: [],
        strictMcpConfig: true,
        additionalDirectories: options?.sandboxDirs,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions' ? true : undefined,
        abortController: this.abortController,
        env: buildEnv(this.config, configDir, { baseURL, apiKey }),
        stderr: (data) => {
          const line = data.trim();
          if (line) d(`stderr: ${line}`);
        },
      };

      this.activeQuery = query({ prompt, options: queryOptions });
      let resultText = '';
      let turns = 0;
      let tokenCount = 0;
      let error: string | undefined;
      const pendingAskUserQuestionToolIds = new Set<string>();
      let waitingForUserAnswer = false;

      for await (const message of this.activeQuery) {
        const toolUses = extractToolUseEvents(message);
        for (const toolUse of toolUses) {
          if (toolUse.name === 'AskUserQuestion') {
            pendingAskUserQuestionToolIds.add(toolUse.id);
          }
        }
        const toolResult = extractToolResultEvent(message);
        const suppressAskUserQuestionResult = Boolean(
          toolResult
          && isAskUserQuestionAutoResult(toolResult.result)
          && (pendingAskUserQuestionToolIds.size > 0
            || (toolResult.toolUseId ? pendingAskUserQuestionToolIds.has(toolResult.toolUseId) : false)),
        );
        if (suppressAskUserQuestionResult) {
          waitingForUserAnswer = true;
        }

        logToolDebug(message, d, { suppressAskUserQuestionResult });
        for (const toolUse of toolUses) {
          options?.onEvent?.({ type: 'tool_use', ...toolUse });
        }
        if (toolResult && !suppressAskUserQuestionResult) {
          options?.onEvent?.({ type: 'tool_result', ...toolResult });
        }
        const line = formatMessage(message);
        if (line && !isAskUserQuestionAutoResult(line)) {
          output.push(line);
          options?.onEvent?.({ type: 'output', line });
        }

        if (message.type === 'result') {
          turns = message.num_turns;
          tokenCount = countUsageTokens(message.usage);
          if (message.subtype === 'success') {
            if (!isAskUserQuestionAutoResult(message.result)) {
              resultText = message.result;
            }
          } else {
            error = message.errors.join('\n') || message.subtype;
          }
        }
      }

      const elapsed = Date.now() - startTime;
      if (waitingForUserAnswer && (!error || isAskUserQuestionAutoResult(error))) {
        d(`waiting for user answer ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);
        return {
          success: true,
          summary: 'Waiting for user answer',
          artifacts: [],
          output,
        };
      }

      if (error) {
        d(`failed ${elapsed}ms | turns=${turns} tokens=${tokenCount} | ${error}`);
        return {
          success: false,
          summary: 'Claude Code execution failed',
          artifacts: [],
          error,
          output,
        };
      }

      const text = resultText || output.at(-1) || '';
      d(`done ${elapsed}ms | turns=${turns} tokens=${tokenCount}`);

      return {
        success: true,
        summary: summarizeResult(text),
        artifacts: [],
        output: resultText && !output.includes(resultText) ? [...output, resultText] : output,
      };
    } catch (err) {
      const elapsed = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      d(`failed ${elapsed}ms | ${message}`);
      if (err instanceof Error && err.stack) console.error(err.stack);

      return { success: false, summary: 'Claude Code execution failed', artifacts: [], error: message, output };
    } finally {
      this.activeQuery?.close();
      this.activeQuery = null;
      await this.adapterRun?.release();
      this.adapterRun = null;
      this.abortController = null;
    }
  }

  stop(): void {
    this.abortController?.abort();
    void this.activeQuery?.interrupt().catch(() => {
      this.activeQuery?.close();
    });
  }
}

interface ClaudeAdapterRun {
  url: string;
  release: () => Promise<void>;
}

interface SharedClaudeAdapter {
  key: string;
  server: Server;
  url: string;
  refs: number;
}

const activeClaudeAdapters = new Map<string, SharedClaudeAdapter>();

async function startClaudeAdapterIfNeeded(config: AgentRuntimeConfig): Promise<ClaudeAdapterRun | null> {
  if (!isAnthropicBridgeProvider(config.provider)) return null;
  const adapterBaseURL = config.adapterBaseURL?.trim() || config.baseURL?.trim();
  if (!adapterBaseURL) throw new Error(`apiBase is required for ${formatBridgeProvider(config.provider)}`);
  if (!config.apiKey?.trim()) throw new Error(`apiKey is required for ${formatBridgeProvider(config.provider)}`);
  if (!config.model?.trim()) throw new Error(`modelId is required for ${formatBridgeProvider(config.provider)}`);

  const adapterConfig = {
    provider: config.provider,
    baseUrl: adapterBaseURL,
    apiKey: config.apiKey,
    model: config.model,
  };
  const key = JSON.stringify(adapterConfig);
  const existing = activeClaudeAdapters.get(key);
  if (existing) {
    existing.refs += 1;
    return {
      url: existing.url,
      release: () => releaseClaudeAdapter(existing.key),
    };
  }

  const server = createAnthropicBridgeServer(adapterConfig);
  const port = await findAvailablePort(3080);
  const url = await listen(server, port);
  const adapter: SharedClaudeAdapter = {
    key,
    server,
    url,
    refs: 1,
  };
  activeClaudeAdapters.set(key, adapter);
  return {
    url,
    release: () => releaseClaudeAdapter(key),
  };
}

async function releaseClaudeAdapter(key: string): Promise<void> {
  const adapter = activeClaudeAdapters.get(key);
  if (!adapter) return;
  adapter.refs -= 1;
  if (adapter.refs > 0) return;
  activeClaudeAdapters.delete(key);
  await closeServer(adapter.server);
}

function getClaudeCodeModel(config: AgentRuntimeConfig): string | undefined {
  if (isAnthropicBridgeProvider(config.provider)) {
    return process.env.CLAUDE_CODE_MODEL || undefined;
  }
  return config.model;
}

function isAnthropicBridgeProvider(provider?: string): provider is AnthropicBridgeProvider {
  return provider === 'openai-responses-to-anthropic-messages'
    || provider === 'openai-chat-completions-to-anthropic-messages';
}

function formatBridgeProvider(provider?: string): string {
  if (provider === 'openai-chat-completions-to-anthropic-messages') {
    return 'OpenAI Chat Completions To Anthropic Messages';
  }
  return 'OpenAI Responses To Anthropic Messages';
}

type AnthropicBridgeProvider =
  | 'openai-responses-to-anthropic-messages'
  | 'openai-chat-completions-to-anthropic-messages';

function createAnthropicBridgeServer(config: AnthropicBridgeConfig): Server {
  return createHttpServer((req, res) => {
    void handleAnthropicBridgeRequest(req, res, config);
  });
}

type AnthropicBridgeConfig = {
  provider: AnthropicBridgeProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
};

function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve(`http://localhost:${port}`);
    });
  });
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.listen(preferredPort, () => {
      const address = server.address() as AddressInfo | null;
      const port = address?.port ?? preferredPort;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(preferredPort + 1));
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve());
  });
}

async function handleAnthropicBridgeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: AnthropicBridgeConfig,
): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', adapter: config.provider });
    return;
  }
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.method !== 'POST' || pathname !== '/v1/messages') {
    sendJson(res, 404, { error: { type: 'not_found_error', message: 'Not found' } });
    return;
  }

  try {
    const anthropicRequest = await readJson(req) as AnthropicRequest;
    const openAIRequest = convertAnthropicToOpenAI(anthropicRequest, config.model);
    const requestBody = config.provider === 'openai-responses-to-anthropic-messages'
      ? convertOpenAIChatRequestToResponses(openAIRequest)
      : openAIRequest;
    const upstreamPath = config.provider === 'openai-responses-to-anthropic-messages'
      ? '/responses'
      : '/chat/completions';
    console.info('[anthropic-bridge] request', {
      provider: config.provider,
      sourceModel: anthropicRequest.model,
      targetModel: config.model,
      stream: Boolean(anthropicRequest.stream),
      inputItems: Array.isArray((requestBody as { input?: unknown }).input) ? (requestBody as { input: unknown[] }).input.length : undefined,
      messages: Array.isArray((requestBody as { messages?: unknown }).messages) ? (requestBody as { messages: unknown[] }).messages.length : undefined,
      tools: Array.isArray((requestBody as { tools?: unknown }).tools) ? (requestBody as { tools: unknown[] }).tools.length : 0,
    });
    const upstream = await fetch(joinUrl(config.baseUrl, upstreamPath), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.warn('[anthropic-bridge] upstream failed', {
        provider: config.provider,
        status: upstream.status,
        targetModel: config.model,
        body: truncate(text, 2000),
      });
      sendJson(res, upstream.status, {
        error: {
          type: upstream.status >= 500 ? 'api_error' : 'invalid_request_error',
          message: text || `${formatBridgeProvider(config.provider)} request failed with status ${upstream.status}`,
        },
      });
      return;
    }

    const upstreamBody = await upstream.json() as ResponsesBody | OpenAIChatBody;
    console.info('[anthropic-bridge] upstream succeeded', {
      provider: config.provider,
      targetModel: config.model,
      responseId: upstreamBody.id,
      outputItems: 'output' in upstreamBody ? upstreamBody.output?.length ?? 0 : undefined,
      choices: 'choices' in upstreamBody ? upstreamBody.choices?.length ?? 0 : undefined,
    });
    const anthropicResponse = config.provider === 'openai-responses-to-anthropic-messages'
      ? convertResponsesToAnthropic(upstreamBody as ResponsesBody, anthropicRequest.model)
      : convertChatCompletionsToAnthropic(upstreamBody as OpenAIChatBody, anthropicRequest.model);
    if (anthropicRequest.stream) {
      sendAnthropicStream(res, anthropicResponse);
      return;
    }
    sendJson(res, 200, anthropicResponse);
  } catch (err) {
    console.error('[anthropic-bridge] proxy failed', err);
    sendJson(res, 500, {
      error: {
        type: 'api_error',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

type AnthropicRequest = {
  model: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicBlock[] }>;
  system?: string | Array<{ text?: string }>;
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  tools?: Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>;
  tool_choice?: { type?: string; name?: string };
};

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicBlock[]; is_error?: boolean };

type ResponsesBody = {
  id?: string;
  model?: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
};

type OpenAIChatBody = {
  id?: string;
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

type OpenAIChatRequest = {
  model: string;
  messages: Array<Record<string, unknown>>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string[];
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: unknown;
};

function convertAnthropicToOpenAI(request: AnthropicRequest, model: string): OpenAIChatRequest {
  const messages: Array<Record<string, unknown>> = [];
  const system = normalizeSystemPrompt(request.system);
  if (system) messages.push({ role: 'system', content: system });

  for (const message of request.messages) {
    messages.push(...convertAnthropicMessage(message));
  }

  return compactObject({
    model,
    messages,
    max_tokens: request.max_tokens === 1 ? 32 : request.max_tokens,
    temperature: request.temperature,
    top_p: request.top_p,
    stop: request.stop_sequences,
    tools: request.tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })),
    tool_choice: convertOpenAIToolChoice(request.tool_choice),
  });
}

function convertAnthropicMessage(message: AnthropicRequest['messages'][number]): Array<Record<string, unknown>> {
  if (typeof message.content === 'string') {
    if (message.role === 'assistant' && isAssistantPrefill(message.content)) return [];
    return [{ role: message.role, content: message.content }];
  }

  if (message.role === 'user') {
    const output: Array<Record<string, unknown>> = [];
    const textParts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
        continue;
      }
      if (block.type === 'tool_result') {
        output.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: stringifyToolResult(block),
        });
      }
    }
    if (textParts.length > 0) {
      output.push({ role: 'user', content: textParts.join('\n') });
    }
    return output;
  }

  const textParts: string[] = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
      continue;
    }
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input ?? {}),
        },
      });
    }
  }
  const content = textParts.join('\n');
  if (toolCalls.length === 0 && isAssistantPrefill(content)) return [];
  return [{
    role: 'assistant',
    content: content || null,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  }];
}

function convertOpenAIChatRequestToResponses(chatRequest: OpenAIChatRequest): Record<string, unknown> {
  const messages = chatRequest.messages;
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => stringifyContent(message.content))
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => (message as Record<string, unknown>).role !== 'system')
    .flatMap(convertChatMessageToResponseInput);
  return compactObject({
    model: chatRequest.model,
    input,
    instructions: instructions || undefined,
    max_output_tokens: chatRequest.max_tokens,
    temperature: chatRequest.temperature,
    top_p: chatRequest.top_p,
    stop: chatRequest.stop,
    tools: chatRequest.tools?.map((tool: { function: { name: string; description?: string; parameters?: unknown } }) => ({
      type: 'function',
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    })),
    tool_choice: convertResponsesToolChoice(chatRequest.tool_choice),
  });
}

function normalizeSystemPrompt(system?: AnthropicRequest['system']): string {
  if (!system) return '';
  if (typeof system === 'string') return system;
  return system
    .map((item) => typeof item.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n');
}

function stringifyToolResult(block: Extract<AnthropicBlock, { type: 'tool_result' }>): string {
  const content = typeof block.content === 'string'
    ? block.content
    : block.content
      .map((item) => item.type === 'text' ? item.text : JSON.stringify(item))
      .join('\n');
  return block.is_error ? `Error: ${content}` : content;
}

function convertOpenAIToolChoice(toolChoice?: AnthropicRequest['tool_choice']): unknown {
  if (!toolChoice) return undefined;
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'tool' && toolChoice.name) {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return undefined;
}

function isAssistantPrefill(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  return ['{', '[', '```', '{"', '[{', '<', '<tool_code', '<tool_code>'].includes(trimmed)
    || trimmed.length <= 2
    || (trimmed.startsWith('<tool_code') && !trimmed.includes('</tool_code>'));
}

function convertChatMessageToResponseInput(rawMessage: unknown): Record<string, unknown>[] {
  const message = rawMessage as Record<string, unknown>;
  const role = message.role;
  if (role === 'tool') {
    return [{
      type: 'function_call_output',
      call_id: String(message.tool_call_id ?? ''),
      output: String(message.content ?? ''),
    }];
  }
  if (role === 'assistant' && Array.isArray(message.tool_calls)) {
    const items: Record<string, unknown>[] = [];
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (content) items.push(createResponseMessage('assistant', content));
    for (const toolCall of message.tool_calls as Array<Record<string, unknown>>) {
      const fn = toolCall.function as Record<string, unknown> | undefined;
      items.push({
        type: 'function_call',
        call_id: String(toolCall.id ?? ''),
        name: String(fn?.name ?? ''),
        arguments: String(fn?.arguments ?? '{}'),
      });
    }
    return items;
  }
  if (role === 'system') return [createResponseMessage('system', stringifyContent(message.content))];
  if (role === 'assistant') return [createResponseMessage('assistant', stringifyContent(message.content))];
  return [createResponseMessage('user', stringifyContent(message.content))];
}

function createResponseMessage(role: string, text: string): Record<string, unknown> {
  return {
    type: 'message',
    role,
    content: text,
  };
}

function stringifyContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (!part || typeof part !== 'object') return '';
    const record = part as Record<string, unknown>;
    return typeof record.text === 'string' ? record.text : JSON.stringify(record);
  }).filter(Boolean).join('\n');
}

function convertResponsesToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || toolChoice === 'auto' || toolChoice === 'none' || toolChoice === 'required') return toolChoice;
  if (typeof toolChoice !== 'object') return undefined;
  const fn = (toolChoice as { function?: { name?: string } }).function;
  return fn?.name ? { type: 'function', name: fn.name } : undefined;
}

function convertResponsesToAnthropic(response: ResponsesBody, originalModel: string): Record<string, unknown> {
  const content = extractResponsesContent(response);
  const hasToolUse = content.some((block) => block.type === 'tool_use');
  return {
    id: `msg_${response.id ?? Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
    model: originalModel,
    stop_reason: hasToolUse ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: response.usage?.input_tokens_details?.cached_tokens,
    },
  };
}

function convertChatCompletionsToAnthropic(response: OpenAIChatBody, originalModel: string): Record<string, unknown> {
  const choice = response.choices?.[0];
  const message = choice?.message;
  const content: AnthropicBlock[] = [];
  if (message?.content) {
    content.push({ type: 'text', text: message.content });
  }
  for (const toolCall of message?.tool_calls ?? []) {
    content.push({
      type: 'tool_use',
      id: String(toolCall.id ?? `call_${Date.now().toString(36)}`),
      name: String(toolCall.function?.name ?? ''),
      input: parseJsonObject(String(toolCall.function?.arguments ?? '{}')),
    });
  }

  return {
    id: `msg_${response.id ?? Date.now().toString(36)}`,
    type: 'message',
    role: 'assistant',
    content: content.length ? content : [{ type: 'text', text: '' }],
    model: originalModel,
    stop_reason: mapOpenAIStopReason(choice?.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: response.usage?.prompt_tokens_details?.cached_tokens,
    },
  };
}

function mapOpenAIStopReason(finishReason?: string | null): string {
  if (finishReason === 'length') return 'max_tokens';
  if (finishReason === 'tool_calls') return 'tool_use';
  return 'end_turn';
}

function extractResponsesContent(response: ResponsesBody): AnthropicBlock[] {
  const blocks: AnthropicBlock[] = [];
  if (response.output_text) blocks.push({ type: 'text', text: response.output_text });

  for (const item of response.output ?? []) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      const text = item.content.map((part) => {
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        return typeof record.text === 'string' ? record.text : '';
      }).filter(Boolean).join('');
      if (text && !blocks.some((block) => block.type === 'text' && block.text === text)) {
        blocks.push({ type: 'text', text });
      }
      continue;
    }
    if (item.type === 'function_call') {
      blocks.push({
        type: 'tool_use',
        id: String(item.call_id ?? item.id ?? `call_${Date.now().toString(36)}`),
        name: String(item.name ?? ''),
        input: parseJsonObject(String(item.arguments ?? '{}')),
      });
    }
  }

  return blocks;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

function addCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, anthropic-version, x-api-key');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  addCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendAnthropicStream(res: ServerResponse, message: Record<string, unknown>): void {
  addCorsHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const content = Array.isArray(message.content) ? message.content as Array<Record<string, unknown>> : [];
  sendSse(res, 'message_start', {
    type: 'message_start',
    message: {
      ...message,
      content: [],
      stop_reason: null,
      stop_sequence: null,
    },
  });

  content.forEach((block, index) => {
    sendSse(res, 'content_block_start', {
      type: 'content_block_start',
      index,
      content_block: block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} },
    });

    if (block.type === 'text') {
      sendSse(res, 'content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: String(block.text ?? '') },
      });
    } else if (block.type === 'tool_use') {
      sendSse(res, 'content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input ?? {}) },
      });
    }

    sendSse(res, 'content_block_stop', {
      type: 'content_block_stop',
      index,
    });
  });

  const usage = message.usage && typeof message.usage === 'object'
    ? message.usage as Record<string, unknown>
    : {};
  sendSse(res, 'message_delta', {
    type: 'message_delta',
    delta: {
      stop_reason: message.stop_reason ?? 'end_turn',
      stop_sequence: null,
    },
    usage: {
      output_tokens: usage.output_tokens ?? 0,
    },
  });
  sendSse(res, 'message_stop', { type: 'message_stop' });
  res.end();
}

function sendSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function buildEnv(
  config: AgentRuntimeConfig,
  configDir?: string,
  override?: { baseURL?: string; apiKey?: string },
): Record<string, string | undefined> {
  const usesAnthropicBridge = isAnthropicBridgeProvider(config.provider);
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: configDir || process.env.CLAUDE_CONFIG_DIR,
    ANTHROPIC_API_KEY: override?.apiKey || config.apiKey || process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AUTH_TOKEN: override?.apiKey || config.apiKey || process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_BASE_URL: override?.baseURL || config.baseURL || process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
    ANTHROPIC_DEFAULT_SONNET_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: usesAnthropicBridge ? undefined : config.model || process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
    CLAUDE_AGENT_SDK_CLIENT_APP: process.env.CLAUDE_AGENT_SDK_CLIENT_APP || 'agent-spaces/server',
  };
}

function normalizeMcpServers(servers?: Record<string, unknown>): Record<string, McpServerConfig> | undefined {
  if (!servers || Object.keys(servers).length === 0) return undefined;
  return servers as Record<string, McpServerConfig>;
}

function resolveBundledClaudeExecutable(): string | undefined {
  const require = createRequire(import.meta.url);
  const packageName = getBundledClaudePackageName();
  if (!packageName) return undefined;

  try {
    return require.resolve(`${packageName}/claude`);
  } catch {
    return undefined;
  }
}

function getBundledClaudePackageName(): string | undefined {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-darwin-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-darwin-x64';
  }

  if (platform === 'linux') {
    if (arch === 'arm64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-arm64-musl' : '@anthropic-ai/claude-agent-sdk-linux-arm64';
    if (arch === 'x64') return isMuslRuntime() ? '@anthropic-ai/claude-agent-sdk-linux-x64-musl' : '@anthropic-ai/claude-agent-sdk-linux-x64';
  }

  if (platform === 'win32') {
    if (arch === 'arm64') return '@anthropic-ai/claude-agent-sdk-win32-arm64';
    if (arch === 'x64') return '@anthropic-ai/claude-agent-sdk-win32-x64';
  }

  return undefined;
}

function isMuslRuntime(): boolean {
  const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
  return !report?.header?.glibcVersionRuntime;
}

function normalizeSkillNames(skills?: string[], configDir?: string): string[] {
  if (!Array.isArray(skills)) return [];
  return skills
    .map((skill) => skill.trim().replace(/\.md$/i, ''))
    .filter((skill) => Boolean(skill) && hasSkillContent(skill, configDir));
}

function prepareConfigDir(configDir: string, agentDir?: string): void {
  mkdirSync(configDir, { recursive: true });
  if (!agentDir) return;

  const sourceSkillsDir = join(agentDir, 'skills');
  const targetSkillsDir = join(configDir, 'skills');
  rmSync(targetSkillsDir, { recursive: true, force: true });
  mkdirSync(targetSkillsDir, { recursive: true });

  if (!existsSync(sourceSkillsDir)) return;
  for (const file of readdirSync(sourceSkillsDir)) {
    if (extname(file).toLowerCase() !== '.md') continue;
    copyFileSync(join(sourceSkillsDir, file), join(targetSkillsDir, file));
  }
}

function hasSkillContent(skill: string, configDir?: string): boolean {
  if (!configDir) return true;
  const skillFile = join(configDir, 'skills', `${skill}.md`);
  if (!existsSync(skillFile)) return false;
  return statSync(skillFile).size > 0;
}

function normalizePermissionMode(permissionMode?: AgentRuntimeConfig['permissionMode']): PermissionMode {
  if (
    permissionMode === 'default' ||
    permissionMode === 'acceptEdits' ||
    permissionMode === 'bypassPermissions' ||
    permissionMode === 'plan' ||
    permissionMode === 'dontAsk'
  ) {
    return permissionMode;
  }
  return 'bypassPermissions';
}

function formatMessage(message: SDKMessage): string | null {
  switch (message.type) {
    case 'assistant':
      return formatAssistantMessage(message.message.content);
    case 'result':
      return message.subtype === 'success' ? message.result : message.errors.join('\n');
    case 'system':
      if (message.subtype === 'init') {
        return `Claude Code initialized with ${message.model}`;
      }
      if (message.subtype === 'task_started') {
        return message.description;
      }
      if (message.subtype === 'task_progress') {
        return message.summary || message.description;
      }
      if (message.subtype === 'task_notification') {
        return message.summary;
      }
      if (message.subtype === 'local_command_output') {
        return message.content;
      }
      return null;
    case 'tool_progress':
      return `${message.tool_name} running (${message.elapsed_time_seconds}s)`;
    case 'tool_use_summary':
      return message.summary;
    default:
      return null;
  }
}

function formatAssistantMessage(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;

  const parts = content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; text?: unknown };
    if (typedBlock.type === 'text' && typeof typedBlock.text === 'string') {
      return [typedBlock.text];
    }
    return [];
  });

  return parts.length > 0 ? parts.join('\n') : null;
}

function extractToolUseEvents(message: SDKMessage): Array<{ id: string; name: string; input?: unknown; line: string }> {
  if (message.type !== 'assistant' || !Array.isArray(message.message.content)) return [];

  return message.message.content.flatMap((block) => {
    if (!block || typeof block !== 'object') return [];
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') return [];

    return [{
      id: typeof typedBlock.id === 'string' ? typedBlock.id : typedBlock.name,
      name: typedBlock.name,
      input: typedBlock.input,
      line: formatToolUse(typedBlock.name, typedBlock.input),
    }];
  });
}

function extractToolResultEvent(message: SDKMessage): { toolUseId?: string; result: unknown } | null {
  if (message.type !== 'user') return null;
  const parentToolUseId = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id;
  const toolUseId = typeof parentToolUseId === 'string' && parentToolUseId ? parentToolUseId : undefined;

  const directResult = (message as { tool_use_result?: unknown }).tool_use_result;
  if (directResult !== undefined) {
    return { toolUseId, result: directResult };
  }

  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (Array.isArray(content)) {
    const toolResultBlock = content.find((block) => {
      return Boolean(block && typeof block === 'object' && (block as { type?: unknown }).type === 'tool_result');
    }) as { content?: unknown } | undefined;
    if (toolResultBlock) {
      return { toolUseId, result: toolResultBlock.content };
    }
  }

  return null;
}

function logToolDebug(
  message: SDKMessage,
  d: (message: string) => void,
  options: { suppressAskUserQuestionResult?: boolean } = {},
): void {
  switch (message.type) {
    case 'assistant':
      logAssistantToolUses(message.message.content, d);
      return;
    case 'user': {
      const toolResult = (message as { tool_use_result?: unknown }).tool_use_result;
      if (toolResult !== undefined) {
        if (options.suppressAskUserQuestionResult) return;
        d(`tool result | parent=${message.parent_tool_use_id ?? '-'} result=${summarizeToolResult(toolResult)}`);
      }
      return;
    }
    case 'tool_progress':
      d(`tool progress | id=${message.tool_use_id} name=${message.tool_name} elapsed=${message.elapsed_time_seconds}s parent=${message.parent_tool_use_id ?? '-'}`);
      return;
    case 'tool_use_summary':
      d(`tool summary | ids=${message.preceding_tool_use_ids.join(',') || '-'} summary=${truncate(message.summary, 240)}`);
      return;
    case 'system':
      if (message.subtype === 'task_started') {
        d(`subagent started | ${truncate(message.description, 240)}`);
      } else if (message.subtype === 'task_progress') {
        d(`subagent progress | ${truncate(message.summary || message.description, 240)}`);
      } else if (message.subtype === 'task_notification') {
        d(`subagent notification | ${truncate(message.summary, 240)}`);
      } else if (message.subtype === 'local_command_output') {
        d(`local command output | ${truncate(message.content, 240)}`);
      }
      return;
    default:
      return;
  }
}

function logAssistantToolUses(content: unknown, d: (message: string) => void): void {
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const typedBlock = block as { type?: string; id?: unknown; name?: unknown; input?: unknown };
    if (typedBlock.type !== 'tool_use' || typeof typedBlock.name !== 'string') continue;
    const id = typeof typedBlock.id === 'string' ? typedBlock.id : '-';
    d(`tool use | id=${id} name=${typedBlock.name} input=${summarizeToolInput(typedBlock.input) || '-'}`);
  }
}

function formatToolUse(name: string, input: unknown): string {
  const summary = summarizeToolInput(input);
  return summary ? `Tool: ${name} ${summary}` : `Tool: ${name}`;
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const record = input as Record<string, unknown>;
  const keys = ['file_path', 'path', 'command', 'pattern', 'query', 'description', 'prompt'];
  const details = keys.flatMap((key) => {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) return [];
    return `${key}=${JSON.stringify(truncate(value.trim(), 140))}`;
  });
  if (details.length > 0) return details.join(' ');
  return JSON.stringify(redactLargeInput(record));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function redactLargeInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (typeof value === 'string') return [key, truncate(value, 140)];
    return [key, value];
  }));
}

function summarizeToolResult(result: unknown): string {
  if (typeof result === 'string') return JSON.stringify(truncate(result, 240));
  if (!result || typeof result !== 'object') return JSON.stringify(result);
  return JSON.stringify(redactLargeInput(result as Record<string, unknown>));
}

function isAskUserQuestionAutoResult(result: unknown): boolean {
  if (typeof result === 'string') return /Answer questions\?/i.test(result);
  if (!result || typeof result !== 'object') return false;
  return /Answer questions\?/i.test(JSON.stringify(result));
}

function countUsageTokens(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const values = Object.values(usage as Record<string, unknown>);
  return values.reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
}
