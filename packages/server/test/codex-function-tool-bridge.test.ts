import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startCodexFunctionToolBridge } from '../src/adapters/codex-function-tool-bridge.js';

test('function tool bridge accepts MCP-prefixed Agent Spaces tool names', async () => {
  const bridge = await startCodexFunctionToolBridge([
    {
      name: 'ListDatabaseNodes',
      description: 'List database nodes.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({ nodes: [{ id: 'node-1' }] }),
    },
  ]);
  assert.ok(bridge);

  const client = new Client({ name: 'bridge-test', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(bridge.url));

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name), ['ListDatabaseNodes']);

    const result = await client.callTool({
      name: 'mcp__agent-spaces__ListDatabaseNodes',
      arguments: {},
    });

    assert.deepEqual(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : ''), {
      nodes: [{ id: 'node-1' }],
    });
  } finally {
    await client.close();
    await bridge.close();
  }
});
