/**
 * 红绿灯测试 —— @agent-spaces/mcp 质量门禁
 *
 * 三层：
 *   🟢 GREEN   注册完整性：全部 SDK 方法都被反射为 MCP tool，不漏一个
 *   🟡 YELLOW  调用链路：代表性 tool（覆盖各 HTTP 动词/上传/流式）经 mock server 正确转发
 *   🔴 RED     错误处理：未知 tool / 缺参 / HTTP 错误 被正确捕获，不崩溃
 *
 * 用 Node 内置 node:test，零额外依赖。任一断言失败 → 进程非零退出。
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { createSDK, type SDK } from '@agent-spaces/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createMcpServer } from '../src/server.js';
import { buildToolRegistry, listExpectedToolNames } from '../src/registry.js';
import { startMockServer, type MockServerHandle } from './mock-server.js';

// ---- 彩色输出（测试报告）----
const C = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

let sdk: SDK;
let mock: MockServerHandle;
let client: Client;
let serverCleanup: (() => Promise<void>) | null = null;

// ---- 测试夹具：mock server + 通过 InMemoryTransport 连接的 MCP client ----
before(async () => {
  mock = await startMockServer();
  sdk = createSDK({ baseUrl: mock.baseUrl, getToken: () => 'test-token' });

  const { server, tools } = createMcpServer(sdk);
  // 用 tools 数量做报告，serverCleanup 关闭 server
  void tools;
  serverCleanup = async () => {
    await server.close();
  };

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'redlight-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

after(async () => {
  await client.close();
  if (serverCleanup) await serverCleanup();
  await mock.close();
});

// ===================== 🟢 GREEN：注册完整性 =====================
describe(C.green('🟢 GREEN — 注册完整性'), () => {
  test('反射出的 tool 数 = SDK 公开方法数（339）', () => {
    const tools = buildToolRegistry(sdk);
    assert.equal(tools.length, 339, `应为 339，实际 ${tools.length}`);
  });

  test('每个 ${模块}_${方法} 名都在 tools/list 中', async () => {
    const expected = listExpectedToolNames(sdk);
    const listed = await client.listTools();
    const listedNames = new Set(listed.tools.map((t) => t.name));

    const missing = expected.filter((n) => !listedNames.has(n));
    assert.deepEqual(missing, [], `缺少 tool: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' ...' : ''}`);
  });

  test('tool 名格式统一为 模块_方法，且无重复', async () => {
    const listed = await client.listTools();
    const names = listed.tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, '存在重复 tool 名');
    for (const n of names) {
      assert.match(n, /^[a-zA-Z]+_[a-zA-Z]/, `tool 名格式异常: ${n}`);
    }
  });

  test('tool schema 的 properties 数 = SDK 方法 arity，required 仅 arg0', async () => {
    // 抽查几个已知 arity 的方法
    const cases: Array<[string, number]> = [
      ['version_current', 0], // 无参
      ['workspace_list', 0], // 无参
      ['git_commit', 2], // (workspaceId, message)
      ['task_create', 2], // (workspaceId, data)
      ['agentStore_fetchIndex', 1], // (baseUrl)
    ];
    const listed = await client.listTools();
    const byName = new Map(listed.tools.map((t) => [t.name, t]));
    for (const [name, arity] of cases) {
      const tool = byName.get(name);
      assert.ok(tool, `tool ${name} 不存在`);
      assert.equal(
        Object.keys(tool.inputSchema.properties ?? {}).length,
        arity,
        `${name} 的 properties 数应为 ${arity}`,
      );
      // required 最多 1 个（arg0）；arity=0 时为 0
      assert.ok(
        (tool.inputSchema.required ?? []).length <= 1,
        `${name} 的 required 应 ≤1`,
      );
    }
  });
});

// ===================== 🟡 YELLOW：调用链路 =====================
describe(C.yellow('🟡 YELLOW — 调用链路（mock server）'), () => {
  test('GET noAuth: version_current 不带 Authorization，正确转发', async () => {
    mock.reset();
    mock.setNextResponse(200, { version: '1.2.3' });
    const result = await client.callTool({ name: 'version_current', arguments: {} });
    const req = mock.requests[0];
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/version');
    assert.equal(req.headers.authorization, undefined, 'noAuth 方法不应带 Authorization');
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.equal(JSON.parse(text).version, '1.2.3');
  });

  test('GET 鉴权: workspace_list 带 Bearer token', async () => {
    mock.reset();
    mock.setNextResponse(200, [{ id: 'ws-1', name: 'demo' }]);
    await client.callTool({ name: 'workspace_list', arguments: {} });
    const req = mock.requests[0];
    assert.equal(req.url, '/api/workspaces');
    assert.equal(req.headers.authorization, 'Bearer test-token');
  });

  test('POST body: git_commit(workspaceId, message) 序列化正确', async () => {
    mock.reset();
    mock.setNextResponse(200, {});
    await client.callTool({ name: 'git_commit', arguments: { arg0: 'ws-1', arg1: 'fix bug' } });
    const req = mock.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/workspaces/ws-1/git/commit');
    assert.deepEqual(JSON.parse(req.body), { message: 'fix bug' });
  });

  test('POST object 参数: task_create(wsId, {title}) JSON 字符串自动解析', async () => {
    mock.reset();
    mock.setNextResponse(200, { id: 'task-1' });
    await client.callTool({
      name: 'task_create',
      arguments: { arg0: 'ws-1', arg1: '{"title":"新任务"}' },
    });
    const req = mock.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/workspaces/ws-1/tasks');
    assert.deepEqual(JSON.parse(req.body), { title: '新任务' });
  });

  test('PUT: task_update(wsId, taskId, data) 路径与 body 正确', async () => {
    mock.reset();
    mock.setNextResponse(200, {});
    await client.callTool({
      name: 'task_update',
      arguments: { arg0: 'ws-1', arg1: 'task-1', arg2: '{"status":"done"}' },
    });
    const req = mock.requests[0];
    assert.equal(req.method, 'PUT');
    assert.equal(req.url, '/api/workspaces/ws-1/tasks/task-1');
    assert.deepEqual(JSON.parse(req.body), { status: 'done' });
  });

  test('DELETE: task_delete_(wsId, taskId) 正确', async () => {
    mock.reset();
    mock.setNextResponse(200, {});
    await client.callTool({ name: 'task_delete_', arguments: { arg0: 'ws-1', arg1: 'task-1' } });
    const req = mock.requests[0];
    assert.equal(req.method, 'DELETE');
    assert.equal(req.url, '/api/workspaces/ws-1/tasks/task-1');
  });

  test('多参数 spread 顺序: agent_getAgent(appId, agentId)', async () => {
    mock.reset();
    mock.setNextResponse(200, {});
    await client.callTool({
      name: 'miniApp_getAgent',
      arguments: { arg0: 'app-1', arg1: 'agent-9' },
    });
    const req = mock.requests[0];
    assert.equal(req.url, '/api/mini-apps/app-1/agents/agent-9');
  });

  test('SSE 流式: workflow_execute 聚合为文本', async () => {
    mock.reset();
    // 模拟 SSE 响应
    mock.setNextResponse(200, 'data: {"delta":"hi"}\n\ndata: {"delta":"!"}\n\n', 'text/event-stream');
    const result = await client.callTool({
      name: 'workflow_execute',
      arguments: { arg0: 'wf-1' }, // body 可选，省略
    });
    const req = mock.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/workflows/wf-1/execute');
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.ok(text.includes('hi'), '流应被聚合且含 hi');
  });
});

// ===================== 🔴 RED：错误处理 =====================
describe(C.red('🔴 RED — 错误处理'), () => {
  test('未知 tool 返回错误（不崩溃）', async () => {
    await assert.rejects(
      () => client.callTool({ name: 'nonexistent_method', arguments: {} }),
      (err: unknown) => {
        // MCP InvalidParams 错误
        const msg = err instanceof Error ? err.message : String(err);
        return msg.includes('未知 tool') || msg.includes('not found') || msg.includes('Invalid');
      },
    );
  });

  test('缺少必填参数(arg0)返回友好错误', async () => {
    mock.reset();
    await assert.rejects(
      () => client.callTool({ name: 'git_commit', arguments: {} }), // 缺 arg0
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        return msg.includes('缺少必填参数') || msg.includes('arg0') || msg.includes('Invalid');
      },
    );
  });

  test('HTTP 4xx/5xx 被包装为 tool 错误（isError=true），不中断会话', async () => {
    mock.reset();
    mock.setNextResponse(500, { error: 'server down' });
    const result = await client.callTool({ name: 'workspace_list', arguments: {} });
    // SDK 非 rawResponse 会抛 ApiError → server 捕获 → 返回 isError=true 的结果
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.ok(text.includes('error') || text.includes('500'), `应含错误信息，实际: ${text}`);
  });

  test('错误后 server 仍可正常服务（会话未崩溃）', async () => {
    mock.reset();
    mock.setNextResponse(200, { version: 'recover' });
    const result = await client.callTool({ name: 'version_current', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.equal(JSON.parse(text).version, 'recover');
  });
});
