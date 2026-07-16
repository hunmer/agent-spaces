import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { PiRuntime } from '../src/adapters/pi-runtime.js';
import { startCodexFunctionToolBridge } from '../src/adapters/codex-function-tool-bridge.js';

test('native pi SDK creates an isolated in-memory session', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-runtime-'));
  const agentDir = join(cwd, '.pi-agent');
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    systemPromptOverride: () => 'You are a test assistant.',
    appendSystemPromptOverride: () => [],
  });

  try {
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      tools: ['read', 'grep'],
      resourceLoader,
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager,
    });

    try {
      assert.equal(session.sessionFile, undefined);
      assert.ok(session.sessionId);
      assert.match(session.systemPrompt, /You are a test assistant\./);
      assert.deepEqual(session.getActiveToolNames().sort(), ['grep', 'read']);
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('PiRuntime executes through the native SDK event stream', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pi-runtime-'));
  let requestCount = 0;
  let toolInput: unknown;
  let mcpToolInput: unknown;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    if (requestCount === 1) {
      response.write('data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"echo","arguments":"{\\"text\\":\\"hello\\"}"}},{"index":1,"id":"call-2","type":"function","function":{"name":"mcp__agent-spaces__mcp_echo","arguments":"{\\"text\\":\\"mcp\\"}"}}]},"finish_reason":null}]}\n\n');
      response.write('data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n');
      response.end('data: [DONE]\n\n');
      return;
    }
    response.write('data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"hello native pi"},"finish_reason":null}]}\n\n');
    response.write('data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"test-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":3,"total_tokens":6}}\n\n');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const events: Array<{ type: string; line?: string; sessionId?: string }> = [];
  const bridge = await startCodexFunctionToolBridge([{
    name: 'mcp_echo',
    description: 'Echo input through MCP.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    execute: async (input) => {
      mcpToolInput = input;
      return input;
    },
  }]);
  assert.ok(bridge);

  try {
    const runtime = new PiRuntime({
      provider: 'openai-chat-completions',
      model: 'test-model',
      apiKey: 'test-key',
      baseURL: `http://127.0.0.1:${address.port}/v1`,
      thinkingEnabled: false,
    });
    const result = await runtime.execute('hello', cwd, {
      configDir: join(cwd, 'agent'),
      systemPrompt: 'Reply briefly.',
      functionTools: [{
        name: 'echo',
        description: 'Echo input.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
        execute: async (input) => {
          toolInput = input;
          return input;
        },
      }],
      mcpServers: {
        'agent-spaces': { url: bridge.url, type: 'http' },
      },
      onEvent: (event) => events.push(event),
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.output, ['hello native pi']);
    assert.equal(result.usage?.totalTokens, 6);
    assert.ok(result.sessionId);
    assert.deepEqual(toolInput, { text: 'hello' });
    assert.deepEqual(mcpToolInput, { text: 'mcp' });
    assert.equal(events.filter((event) => event.type === 'tool_use').length, 2);
    assert.equal(events.filter((event) => event.type === 'tool_result').length, 2);
    assert.deepEqual(events.filter((event) => event.type === 'output'), [
      { type: 'output', line: 'hello native pi' },
    ]);
    assert.equal(events.filter((event) => event.type === 'session').length, 1);
  } finally {
    await bridge.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(cwd, { recursive: true, force: true });
  }
});
