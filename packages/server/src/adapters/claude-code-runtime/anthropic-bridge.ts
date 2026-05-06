import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import type { AnthropicBridgeConfig, ResponsesBody, OpenAIChatBody } from './types.js';
import { formatBridgeProvider } from './types.js';
import { convertAnthropicToOpenAI, convertOpenAIChatRequestToResponses, convertResponsesToAnthropic, convertChatCompletionsToAnthropic } from './protocol-converter.js';
import { truncate } from './message-format.js';

export function createAnthropicBridgeServer(config: AnthropicBridgeConfig) {
  return createHttpServer((req, res) => {
    void handleAnthropicBridgeRequest(req, res, config);
  });
}

export function listen(server: ReturnType<typeof createHttpServer>, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve(`http://localhost:${port}`);
    });
  });
}

export async function findAvailablePort(preferredPort: number): Promise<number> {
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

export function closeServer(server: ReturnType<typeof createHttpServer>): Promise<void> {
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
    const anthropicRequest = await readJson(req) as import('./types.js').AnthropicRequest;
    const openAIRequest = convertAnthropicToOpenAI(anthropicRequest, config.model, {
      thinkingEnabled: config.thinkingEnabled,
      thinkingEffort: config.thinkingEffort,
    });
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
