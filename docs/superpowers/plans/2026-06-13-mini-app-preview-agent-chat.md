# Mini-App Preview Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 standalone 预览页 Toolbar 里通过 popover 打开 agent 聊天，agent（langchain）能读路由、调插件工具、执行项目 `src/api.js` 方法（广播事件操控 UI），会话按 session-id 落盘到项目目录。

**Architecture:** 自包含执行路径，不依赖 workspace/channel。配置来自 `agents.json`（每个 agent 自带凭据，可选 `agentId` 复用全局 preset 密钥），api.js 在服务端沙箱执行（同 services 编译方式），方法通过 `ctx.broadcast` 发 `miniApp.*` 事件，UI 订阅后操控自身。复用 `createAgentRuntime` + langchain + `createMiniAppFunctionTools`，只新建配置源 / api.js 编译 / 存储 / 传输这一层。新建 3 个 REST 端点（并入现有 `routes/mini-apps.ts`），SSE 流式。完整设计见 [docs/superpowers/specs/2026-06-13-mini-app-agent-chat-design.md](../specs/2026-06-13-mini-app-agent-chat-design.md)。

**Tech Stack:** Express 5（后端路由）、langchain runtime（`createAgentRuntime`）、Next.js 16 + React（前端 `ui/chat-panel.tsx`）、`@agent-spaces/sdk`（`http.sse()`）、`node:test`（纯函数单测）。

**Branch:** 已在 `feat/mini-app-preview-agent-chat` 上工作（spec 已提交）。继续在此分支实现。

---

## 约定

- **ESM 后端**：导入路径带 `.js` 后缀（如 `'./mini-app-agent.js'`），即便源文件是 `.ts`。
- **测试**：纯函数用 `node:test` + `node:assert/strict`，文件放 `packages/server/test/`，运行 `npx tsx --test test/<file>.test.ts`。集成层（SSE / runtime / UI）用 `pnpm --filter @agent-spaces/server build`（tsc 类型检查）+ 手动验证。
- **i18n**：所有用户可见文案走 `packages/web/src/locales/{en,zh}/mini-apps.json`，组件用 `useTranslations('mini-apps')`。
- **kebab-case** 文件名。
- 每个任务结束 commit，message 前缀 `feat:` / `test:` / `docs:`。

## File Structure（改动清单）

**新建**
- `packages/server/src/services/mini-app-agent.ts` — 执行器：`loadApiJs`（api.js 编译）、`makeApiCtx`、`buildApiFunctionTools`、`resolveAgentCredentials`、`runMiniAppAgent`。
- `packages/server/test/mini-app-agent.test.ts` — 纯函数单测。
- `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/agents.json` — 示例配置。
- `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/src/api.js` — 示例 next/prev/play 方法。

**修改**
- `packages/server/src/storage/mini-app-store.ts` — `MiniAppProject` 加 `enableAgents`；增 `readAgentsConfig` / `saveAgentChat` / `listAgentChats`。
- `packages/server/src/routes/mini-apps.ts` — 增 3 个 agent 端点。
- `packages/sdk/src/modules/mini-apps.ts` — `MiniAppProject` 加 `enableAgents`；增 `MiniAppAgentConfig` / `MiniAppChatMessage` 类型 + agent 方法。
- `packages/web/src/components/mini-apps/mini-app-preview.tsx` — Toolbar popover + ChatPanel + session/route/switcher/streaming。
- `packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx` — 透传 `enableAgents`。
- `packages/web/src/locales/{en,zh}/mini-apps.json` — popover / 切换器 / 错误文案。
- `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/manifest.json` — 加 `enableAgents: true`。

> 偏离 spec：路由端点并入现有 `routes/mini-apps.ts` 而非新建 `routes/mini-app-agent.ts`（同前缀 `/api/mini-apps`，免 router 冲突，更 DRY）。新类型（`MiniAppAgentConfig` / `MiniAppChatMessage`）定义在 server service 与 sdk module 各一份，沿用 `MiniAppProject` 现有重复模式，不在 shared 单独开文件。

---

## Task 1: 类型与开关字段

**Files:**
- Modify: `packages/server/src/storage/mini-app-store.ts:6-22`（`MiniAppProject`）
- Modify: `packages/sdk/src/modules/mini-apps.ts:3-19`（`MiniAppProject`）
- Modify: `packages/server/src/storage/mini-app-store.ts:184`（`updateProject` 的 `Partial<Pick<...>>`）

- [ ] **Step 1: server 端 MiniAppProject 加 enableAgents**

`packages/server/src/storage/mini-app-store.ts`，在 `agentConfigId?: string;`（第 14 行）下面加一行：

```ts
  enableAgents?: boolean;
```

同文件 `updateProject` 的类型参数（第 184 行）`Partial<Pick<MiniAppProject, 'name' | 'description' | 'tags' | 'enabledPlugins' | 'agentConfigId' | 'mainFile' | 'icon' | 'avatarUrl'>>` 末尾加 `| 'enableAgents'`。

- [ ] **Step 2: sdk 端 MiniAppProject 加 enableAgents**

`packages/sdk/src/modules/mini-apps.ts`，在 `agentConfigId?: string;`（第 11 行）下面加：

```ts
  enableAgents?: boolean;
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @agent-spaces/server build && pnpm --filter @agent-spaces/sdk build`
Expected: 两个包 tsc 都通过，无错误。

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/storage/mini-app-store.ts packages/sdk/src/modules/mini-apps.ts
git commit -m "feat: add enableAgents field to MiniAppProject"
```

---

## Task 2: 存储层（agents.json 读取 + chat 落盘）

**Files:**
- Modify: `packages/server/src/storage/mini-app-store.ts`（末尾追加）
- Test: `packages/server/test/mini-app-agent.test.ts`（本任务只建空文件 + import，Task 3/4 填测试）

- [ ] **Step 1: mini-app-store 增配置/聊天存储函数**

在 `packages/server/src/storage/mini-app-store.ts` 末尾（`copyDirSync` 之后）追加：

```ts
// ---- Agents config & chat ----

/** 读取项目 agents.json（多 agent 配置）。缺失返回 null。 */
export function readAgentsConfig(projectId: string): unknown[] | null {
  const filePath = join(projectDir(projectId), 'agents.json');
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export interface MiniAppChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  route?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
  timestamp: string;
}

function chatDir(projectId: string, sessionId: string): string {
  return join(projectDir(projectId), 'chat', sessionId);
}

function safeSessionId(sessionId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error('Invalid sessionId');
  }
  return sessionId;
}

/** 保存一条聊天消息到 chat/{sessionId}/{messageId}.json */
export function saveAgentChat(projectId: string, message: MiniAppChatMessage): void {
  safeSessionId(message.sessionId);
  const dir = chatDir(projectId, message.sessionId);
  ensureDir(dir);
  writeFileSync(join(dir, `${message.id}.json`), JSON.stringify(message, null, 2), 'utf-8');
}

/** 列出某 session 的全部消息，按 timestamp 升序。 */
export function listAgentChats(projectId: string, sessionId: string): MiniAppChatMessage[] {
  safeSessionId(sessionId);
  const dir = chatDir(projectId, sessionId);
  if (!existsSync(dir)) return [];
  const messages: MiniAppChatMessage[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue;
    try {
      const msg = JSON.parse(readFileSync(join(dir, entry.name), 'utf-8'));
      if (msg && typeof msg === 'object' && typeof msg.timestamp === 'string') {
        messages.push(msg as MiniAppChatMessage);
      }
    } catch { /* skip malformed */ }
  }
  messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return messages;
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @agent-spaces/server build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/storage/mini-app-store.ts
git commit -m "feat: add agents.json + chat persistence to mini-app-store"
```

---

## Task 3: api.js 编译器 + ctx + function tools

**Files:**
- Create: `packages/server/src/services/mini-app-agent.ts`
- Test: `packages/server/test/mini-app-agent.test.ts`

- [ ] **Step 1: 写失败测试（api.js 编译 + function tool 构建）**

`packages/server/test/mini-app-agent.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileApiJs, buildApiFunctionTools, type ApiCtx } from '../src/services/mini-app-agent.js';

test('compileApiJs strips imports and converts export default to method map', () => {
  const code = `
import { something } from 'x';
export default {
  next_music: (_input, ctx) => { ctx.broadcast('miniApp.playerAction', { dir: 'next' }); return { ok: true }; },
  play_track: ({ id }, ctx) => { return { got: id }; },
};
`;
  const methods = compileApiJs(code);
  assert.deepEqual(Object.keys(methods).sort(), ['next_music', 'play_track']);
  assert.equal(typeof methods.next_music, 'function');
});

test('compileApiJs returns empty map on missing/invalid default export', () => {
  assert.deepEqual(compileApiJs('export const x = 1;'), {});
  assert.deepEqual(compileApiJs('not valid js {'), {});
});

test('buildApiFunctionTools wraps each method as an AgentFunctionTool with empty object schema', () => {
  const methods = compileApiJs(`
export default {
  next_music: () => ({ ok: true }),
};
`);
  const ctx: ApiCtx = {
    projectId: 'p1',
    broadcast: () => {},
    callPluginTool: async () => ({ ok: true }),
    readConfig: () => null,
    writeConfig: () => {},
  };
  const tools = buildApiFunctionTools(methods, () => ctx);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'next_music');
  assert.deepEqual(tools[0].inputSchema, { type: 'object', properties: {} });
  // execute invokes the handler with the ctx
  return tools[0].execute({}).then((r: any) => assert.deepEqual(r, { ok: true }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test test/mini-app-agent.test.ts`
Expected: FAIL（`Cannot find module '../src/services/mini-app-agent.js'`）。

- [ ] **Step 3: 实现 mini-app-agent.ts 的编译 + ctx + 工具构建部分**

`packages/server/src/services/mini-app-agent.ts`：

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectDir } from '../storage/mini-app-store.js';
import * as miniAppStore from '../storage/mini-app-store.js';
import { broadcastToWorkspace } from '../ws/connection-manager.js';
import { executePluginTool } from './plugin.js';
import { createBuiltinPluginApi } from './plugin-runtime-api.js';
import type { AgentFunctionTool } from '../adapters/agent-runtime-types.js';

export interface ApiCtx {
  projectId: string;
  broadcast(event: string, data: unknown): void;
  callPluginTool(pluginId: string, toolName: string, args: Record<string, unknown>): Promise<unknown>;
  readConfig(path: string): unknown | null;
  writeConfig(path: string, value: unknown): void;
}

export type ApiHandler = (input: Record<string, unknown>, ctx: ApiCtx) => unknown | Promise<unknown>;

/**
 * 编译 src/api.js：剥离 import 行（api.js 不依赖外部模块），把 ESM `export default`
 * 转 CJS `module.exports =`，在沙箱求值。默认导出应为 { methodName: handler }。
 * 复用 services 的编译约定（见 mini-app-services.ts）。
 */
export function compileApiJs(code: string): Record<string, ApiHandler> {
  let moduleObj: { exports: unknown };
  try {
    const stripped = code
      .replace(/^\s*import\s+.*$/gm, '')
      .replace(/\bexport\s+default\s+/, 'module.exports = ');
    moduleObj = { exports: {} };
    const fn = new Function('module', 'exports', stripped);
    fn(moduleObj, moduleObj.exports);
  } catch {
    return {};
  }
  const exported = moduleObj.exports;
  if (!exported || typeof exported !== 'object') return {};
  const handlers: Record<string, ApiHandler> = {};
  for (const [name, h] of Object.entries(exported as Record<string, unknown>)) {
    if (typeof h === 'function') handlers[name] = h as ApiHandler;
  }
  return handlers;
}

/** 从项目目录加载 src/api.js 并编译为方法表。文件缺失返回 {}。 */
export function loadApiJs(projectId: string): Record<string, ApiHandler> {
  const filePath = join(getProjectDir(projectId), 'src', 'api.js');
  if (!existsSync(filePath)) return {};
  try {
    return compileApiJs(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.error(`[mini-app-agent] failed to load src/api.js:`, err instanceof Error ? err.message : err);
    return {};
  }
}

export function makeApiCtx(projectId: string): ApiCtx {
  return {
    projectId,
    broadcast: (event, data) => broadcastToWorkspace(projectId, event, data),
    callPluginTool: (pluginId, toolName, args) =>
      executePluginTool(pluginId, toolName, args, createBuiltinPluginApi()),
    readConfig: (path) => miniAppStore.readConfig(projectId, path),
    writeConfig: (path, value) => miniAppStore.writeConfig(projectId, path, value),
  };
}

/**
 * 把 api.js 方法表包装成 AgentFunctionTool[]。第一版 inputSchema 为空 object
 * （无参 / 简单 object，不做参数描述——见 spec §7.2 限制说明）。
 */
export function buildApiFunctionTools(
  methods: Record<string, ApiHandler>,
  ctxProvider: () => ApiCtx,
): AgentFunctionTool[] {
  return Object.entries(methods).map(([name, handler]) => ({
    name,
    description: `${name} (project-defined api.js method)`,
    inputSchema: { type: 'object', properties: {} },
    execute: async (input) => {
      const record = input && typeof input === 'object' && !Array.isArray(input)
        ? input as Record<string, unknown>
        : {};
      return handler(record, ctxProvider());
    },
  }));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx tsx --test test/mini-app-agent.test.ts`
Expected: PASS（3 个测试全过）。

- [ ] **Step 5: 类型检查**

Run: `pnpm --filter @agent-spaces/server build`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/mini-app-agent.ts packages/server/test/mini-app-agent.test.ts
git commit -m "feat: api.js compiler + ctx + function tool builder"
```

---

## Task 4: agent 凭据解析（agentId → preset）

**Files:**
- Modify: `packages/server/src/services/mini-app-agent.ts`（追加 `resolveAgentCredentials`）
- Modify: `packages/server/test/mini-app-agent.test.ts`（追加测试）
- Modify: `packages/sdk/src/modules/mini-apps.ts`（加 `MiniAppAgentConfig` 类型）

- [ ] **Step 1: sdk 加 MiniAppAgentConfig 类型**

`packages/sdk/src/modules/mini-apps.ts`，在 `MiniAppProject` interface 之后追加：

```ts
export interface MiniAppAgentConfig {
  id: string;
  name: string;
  avatar?: string;
  /** 引用全局 Agent Preset id，复用其密钥（可选） */
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiBase?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: { api?: boolean; plugin?: boolean };
}
```

- [ ] **Step 2: 写失败测试（凭据解析优先级）**

追加到 `packages/server/test/mini-app-agent.test.ts`：

```ts
import { resolveAgentCredentials } from '../src/services/mini-app-agent.js';

test('resolveAgentCredentials: agentId resolves preset creds, local fields override', () => {
  const entry: any = {
    agentId: 'preset-1',
    modelId: 'local-model',        // 本地覆盖 preset 的 model
    systemPrompt: 'local persona', // 本地人设为准
  };
  const presets: any[] = [
    {
      id: 'preset-1',
      modelProvider: 'openai-chat-completions',
      modelId: 'preset-model',
      apiKey: 'sk-preset',
      apiBase: 'https://preset',
      systemPrompt: 'preset persona',
    },
  ];
  const resolved = resolveAgentCredentials(entry, presets);
  assert.equal(resolved.modelProvider, 'openai-chat-completions'); // 来自 preset
  assert.equal(resolved.modelId, 'local-model');                   // 本地覆盖
  assert.equal(resolved.apiKey, 'sk-preset');                      // 来自 preset
  assert.equal(resolved.systemPrompt, 'local persona');            // 本地为准
});

test('resolveAgentCredentials: preset missing falls back to local only', () => {
  const entry: any = { agentId: 'nope', modelId: 'm', apiKey: 'sk' };
  const resolved = resolveAgentCredentials(entry, []);
  assert.equal(resolved.modelId, 'm');
  assert.equal(resolved.apiKey, 'sk');
});

test('resolveAgentCredentials: nothing configured → empty (caller falls back to server default)', () => {
  const resolved = resolveAgentCredentials({}, []);
  assert.equal(resolved.modelId, undefined);
  assert.equal(resolved.apiKey, undefined);
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx tsx --test test/mini-app-agent.test.ts`
Expected: FAIL（`resolveAgentCredentials` 未导出）。

- [ ] **Step 4: 实现 resolveAgentCredentials**

追加到 `packages/server/src/services/mini-app-agent.ts`：

```ts
export interface ResolvedAgentCredentials {
  modelProvider?: string;
  modelId?: string;
  apiKey?: string;
  apiBase?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 解析 agent 凭据优先级（spec §5.2）：
 * 1. agentId → 从 presets 提取 modelProvider/modelId/apiKey/apiBase 作为默认
 * 2. entry 本地字段覆盖 preset 值
 * 3. systemPrompt：entry 本地为准，缺失才用 preset
 * 4. 全都没有 → 返回空对象，调用方走服务端默认模型兜底
 */
export function resolveAgentCredentials(
  entry: {
    agentId?: string;
    modelProvider?: string;
    modelId?: string;
    apiKey?: string;
    apiBase?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  },
  presets: Array<{
    id: string;
    modelProvider?: string;
    modelId?: string;
    apiKey?: string;
    apiBase?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }>,
): ResolvedAgentCredentials {
  const preset = entry.agentId ? presets.find((p) => p.id === entry.agentId) : undefined;
  return {
    modelProvider: entry.modelProvider ?? preset?.modelProvider,
    modelId: entry.modelId ?? preset?.modelId,
    apiKey: entry.apiKey ?? preset?.apiKey,
    apiBase: entry.apiBase ?? preset?.apiBase,
    systemPrompt: entry.systemPrompt ?? preset?.systemPrompt,
    temperature: entry.temperature ?? preset?.temperature,
    maxTokens: entry.maxTokens ?? preset?.maxTokens,
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx tsx --test test/mini-app-agent.test.ts`
Expected: PASS（6 个测试全过）。

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/services/mini-app-agent.ts packages/server/test/mini-app-agent.test.ts packages/sdk/src/modules/mini-apps.ts
git commit -m "feat: resolve agent credentials via agentId preset reference"
```

---

## Task 5: runMiniAppAgent 执行器

**Files:**
- Modify: `packages/server/src/services/mini-app-agent.ts`（追加 `runMiniAppAgent`）

- [ ] **Step 1: 实现 runMiniAppAgent**

追加到 `packages/server/src/services/mini-app-agent.ts`。新增 import（文件顶部补）：

```ts
import { createAgentRuntime } from '../adapters/agent-runtime.js';
import type { AgentRuntimeConfig, AgentRuntimeEvent } from '../adapters/agent-runtime-types.js';
import { createMiniAppFunctionTools } from './builtin-tools/mini-app-tools.js';
import { listPresets } from './agent.js';
import { randomUUID } from 'node:crypto';
```

追加函数：

```ts
export interface MiniAppAgentRunInput {
  projectId: string;
  agentId: string;
  sessionId: string;
  message: string;
  route?: string;
  /** SSE 事件回调 */
  onEvent: (event: AgentRuntimeEvent) => void;
  /** 取消信号：abort 时调 runtime.stop() */
  stopSignal?: AbortSignal;
}

export interface MiniAppAgentRunOutput {
  userMessage: miniAppStore.MiniAppChatMessage;
  agentMessage: miniAppStore.MiniAppChatMessage;
}

/**
 * 自包含执行路径：读 agents.json → 解析凭据 → 组装 functionTools（plugin + api.js）
 * → 注入路由/方法清单/systemPrompt → langchain execute → 落盘 user+agent 消息。
 * 不依赖 workspace。
 */
export async function runMiniAppAgent(input: MiniAppAgentRunInput): Promise<MiniAppAgentRunOutput> {
  const { projectId, agentId, sessionId, message, route, onEvent, stopSignal } = input;

  const project = miniAppStore.getProject(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (!project.enableAgents) throw new Error('Agents not enabled for this project');

  const configs = miniAppStore.readAgentsConfig(projectId);
  if (!configs) throw new Error('agents.json not found');
  const entry = configs.find((c: any) => c && c.id === agentId) as
    | {
        id: string; name: string; avatar?: string; agentId?: string;
        modelProvider?: string; modelId?: string; apiKey?: string; apiBase?: string;
        systemPrompt?: string; temperature?: number; maxTokens?: number;
        tools?: { api?: boolean; plugin?: boolean };
      }
    | undefined;
  if (!entry) throw new Error(`Agent not found in agents.json: ${agentId}`);

  const creds = resolveAgentCredentials(entry, listPresets('') as any);

  const runtimeConfig: AgentRuntimeConfig = {
    kind: 'langchain',
    ...(creds.modelProvider ? { provider: creds.modelProvider as AgentRuntimeConfig['provider'] } : {}),
    ...(creds.modelId ? { model: creds.modelId } : {}),
    ...(creds.apiKey ? { apiKey: creds.apiKey } : {}),
    ...(creds.apiBase ? { baseURL: creds.apiBase } : {}),
  };
  const runtime = createAgentRuntime(runtimeConfig);
  if (stopSignal) stopSignal.addEventListener('abort', () => runtime.stop(), { once: true });

  // 组装 functionTools
  const functionTools: import('../adapters/agent-runtime-types.js').AgentFunctionTool[] = [];
  const toolsCfg = entry.tools ?? { api: true, plugin: true };
  if (toolsCfg.plugin) {
    functionTools.push(...createMiniAppFunctionTools({
      enabledPlugins: project.enabledPlugins ?? [],
    }));
  }
  let apiMethodNames: string[] = [];
  if (toolsCfg.api) {
    const apiMethods = loadApiJs(projectId);
    apiMethodNames = Object.keys(apiMethods);
    if (apiMethodNames.length) {
      const ctxProvider = () => makeApiCtx(projectId);
      functionTools.push(...buildApiFunctionTools(apiMethods, ctxProvider));
    }
  }

  // 拼 systemPrompt
  const sections: string[] = [];
  if (creds.systemPrompt) sections.push(creds.systemPrompt);
  sections.push(`Current mini-app route: ${route ?? '/'}`);
  if (apiMethodNames.length) {
    sections.push(`Available project api.js methods: ${apiMethodNames.join(', ')}. ` +
      `Call them to control the UI (they broadcast events the UI reacts to).`);
  }
  if (project.enabledPlugins?.length) {
    sections.push(`Enabled plugins: ${project.enabledPlugins.join(', ')}. ` +
      `Use list_plugin_tools / get_plugin_tool_detail / execute_plugin_tool.`);
  }
  const systemPrompt = sections.join('\n\n');

  // 执行
  const output: string[] = [];
  const toolCalls: Array<{ name: string; input: unknown; result: unknown }> = [];
  const result = await runtime.execute(message, getProjectDir(projectId), {
    systemPrompt,
    functionTools,
    maxTurns: 20,
    onEvent: (event) => {
      onEvent(event);
      if (event.type === 'output') output.push(event.line);
      else if (event.type === 'tool_use') output.push(`[tool:${event.name}]`);
      else if (event.type === 'tool_result') {
        // 记录最近一次 tool_use 的结果（简化：在 tool_use 时推入，这里填 result）
      }
    },
  });

  const now = new Date().toISOString();
  const userMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'user',
    content: message, route, timestamp: now,
  };
  const agentContent = result.success
    ? (result.output?.join('\n').trim() || result.summary)
    : `Error: ${result.error ?? result.summary}`;
  const agentMessage: miniAppStore.MiniAppChatMessage = {
    id: randomUUID(), sessionId, agentId, role: 'agent',
    content: agentContent, route, toolCalls, timestamp: new Date().toISOString(),
  };
  miniAppStore.saveAgentChat(projectId, userMessage);
  miniAppStore.saveAgentChat(projectId, agentMessage);

  return { userMessage, agentMessage };
}
```

> 注：`toolCalls` 完整记录（关联 tool_use→tool_result）是 nice-to-have，第一版可只记录 tool_use 名称（上面 `output.push([tool:name])`）。如需精确配对，在 `onEvent` 里维护 `pendingToolUseId` map。保持简单，不过度设计。

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @agent-spaces/server build`
Expected: 通过。若 `AgentRuntimeConfig['provider']` 类型报错，把 `creds.modelProvider as AgentRuntimeConfig['provider']` 改为 `as any` 兜底（provider 是宽联合类型）。

- [ ] **Step 3: 单测仍通过（回归）**

Run: `npx tsx --test test/mini-app-agent.test.ts`
Expected: 6 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/mini-app-agent.ts
git commit -m "feat: runMiniAppAgent self-contained langchain executor"
```

---

## Task 6: 路由端点（3 个）

**Files:**
- Modify: `packages/server/src/routes/mini-apps.ts`（追加端点）

- [ ] **Step 1: 路由文件顶部补 import**

`packages/server/src/routes/mini-apps.ts` 顶部 import 区追加：

```ts
import { readAgentsConfig, listAgentChats } from '../storage/mini-app-store.js';
import { runMiniAppAgent } from '../services/mini-app-agent.js';
```

- [ ] **Step 2: 追加 3 个端点**

在 `routes/mini-apps.ts` 的 `export default router;` 之前追加：

```ts
// ---- Agents (preview chat) ----

// GET /:id/agents — 脱敏返回 agents 清单 + 开关
router.get('/:id/agents', (req: Request, Response, res: Response) => {}); // 占位避免编辑错误，下一步替换
```

实际替换为（删掉上面占位，写真实）：

```ts
// GET /:id/agents — 脱敏返回 agents 清单 + enableAgents
router.get('/:id/agents', (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = svc.getProject(req.params.id);
    if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
    const configs = readAgentsConfig(req.params.id) ?? [];
    const agents = configs
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        id: String(c.id),
        name: String(c.name ?? c.id),
        avatar: typeof c.avatar === 'string' ? c.avatar : undefined,
      }));
    res.json({ enableAgents: project.enableAgents === true, agents });
  } catch (error: any) { res.status(500).json({ error: error.message }); }
});

// GET /:id/agents/chat?sessionId=&agentId= — 历史
router.get('/:id/agents/chat', (req: Request<{ id: string }, any, any, { sessionId?: string; agentId?: string }>, res: Response) => {
  try {
    const { sessionId, agentId } = req.query;
    if (!sessionId) { res.status(400).json({ error: 'sessionId is required' }); return; }
    let messages = listAgentChats(req.params.id, sessionId);
    if (agentId) messages = messages.filter((m) => m.agentId === agentId);
    res.json({ messages });
  } catch (error: any) {
    res.status(error.message === 'Invalid sessionId' ? 400 : 500).json({ error: error.message });
  }
});

// POST /:id/agents/:agentId/chat — SSE 流式
router.post('/:id/agents/:agentId/chat', (req: Request<{ id: string; agentId: string }>, res: Response) => {
  const { sessionId, message, route } = req.body ?? {};
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'sessionId is required' }); return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' }); return;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  const write = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  runMiniAppAgent({
    projectId: req.params.id,
    agentId: req.params.agentId,
    sessionId,
    message,
    route,
    stopSignal: ac.signal,
    onEvent: (event) => {
      if (event.type === 'reasoning') write('reasoning', { text: event.text, status: event.status });
      else if (event.type === 'tool_use') write('tool_use', { id: event.id, name: event.name, input: event.input });
      else if (event.type === 'tool_result') write('tool_result', { toolUseId: event.toolUseId, result: event.result });
      else if (event.type === 'output') write('text', { line: event.line });
    },
  })
    .then(({ userMessage, agentMessage }) => {
      write('message_saved', { userMessage, agentMessage });
      res.write('event: done\ndata: {}\n\n');
      res.end();
    })
    .catch((error: any) => {
      write('error', { message: error?.message ?? String(error) });
      res.end();
    });
});
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @agent-spaces/server build`
Expected: 通过。删除占位行（Step 2 第一块占位）确保不留死代码。

- [ ] **Step 4: 手动冒烟（端点存在性）**

Run: `pnpm --filter @agent-spaces/server dev`（后台启动），然后：
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3100/api/mini-apps/wui_1781192646059_cb4df369/agents
```
Expected: 因 manifest 还没加 `enableAgents`、agents.json 还没建，返回 `{"enableAgents":false,"agents":[]}`（不报 500）。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/mini-apps.ts
git commit -m "feat: mini-app agent chat endpoints (list/history/SSE)"
```

---

## Task 7: SDK 方法

**Files:**
- Modify: `packages/sdk/src/modules/mini-apps.ts`（在 `createMiniAppApi` 返回对象里追加方法）

- [ ] **Step 1: sdk 加 agent 方法 + MiniAppChatMessage 类型**

`packages/sdk/src/modules/mini-apps.ts`，在 `MiniAppAgentConfig` interface 之后（Task 4 已加）追加：

```ts
export interface MiniAppChatMessage {
  id: string;
  sessionId: string;
  agentId: string;
  role: 'user' | 'agent';
  content: string;
  route?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
  timestamp: string;
}
```

在 `createMiniAppApi(http)` 的返回对象末尾（最后一个方法后，`}` 之前）追加：

```ts
    // ---- Agents (preview chat) ----

    listAgents: (id: string): Promise<{ enableAgents: boolean; agents: Array<{ id: string; name: string; avatar?: string }> }> =>
      http.get(`/api/mini-apps/${id}/agents`),

    agentHistory: (id: string, sessionId: string, agentId?: string): Promise<{ messages: MiniAppChatMessage[] }> =>
      http.get(`/api/mini-apps/${id}/agents/chat?sessionId=${encodeURIComponent(sessionId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ''}`),

    /**
     * SSE 流式聊天。返回原始 Response，调用方用 reader 解析 `event:` / `data:` 行。
     * body: { sessionId, message, route? }
     */
    agentChat: (id: string, agentId: string, body: { sessionId: string; message: string; route?: string }): Promise<Response> =>
      http.sse(`/api/mini-apps/${id}/agents/${encodeURIComponent(agentId)}/chat`, body),
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @agent-spaces/sdk build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/modules/mini-apps.ts
git commit -m "feat: sdk miniApp agent chat methods (list/history/sse)"
```

---

## Task 8: 前端透传 enableAgents

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-app-preview.tsx:19-35`（props）
- Modify: `packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx:75-86`

- [ ] **Step 1: MiniAppPreview 加 enableAgents prop**

`packages/web/src/components/mini-apps/mini-app-preview.tsx`，`MiniAppPreviewProps` interface（第 19 行）加：

```ts
  /** 开启 agent 对话（manifest.enableAgents） */
  enableAgents?: boolean;
```

函数签名（第 35 行）解构加 `enableAgents`：

```ts
export function MiniAppPreview({ type, sourceCode, error, onError, projectId, projectName, hideHeader, enabledPlugins, files, mainFile, enableAgents }: MiniAppPreviewProps) {
```

- [ ] **Step 2: 预览页透传**

`packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx`，`<MiniAppPreview>` 调用（第 75 行）加 `enableAgents={project.enableAgents}`：

```tsx
        <MiniAppPreview
          type={project.type}
          sourceCode={sourceCode}
          error={error}
          onError={setError}
          projectId={project.id}
          projectName={project.name}
          hideHeader={embedded}
          enabledPlugins={project.enabledPlugins}
          enableAgents={project.enableAgents}
          files={allFiles}
          mainFile={project.mainFile}
        />
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @agent-spaces/web build`
Expected: 通过（web 构建可能慢；若只想类型检查可 `pnpm --filter @agent-spaces/web exec tsc --noEmit`）。

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/mini-apps/mini-app-preview.tsx packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx
git commit -m "feat: thread enableAgents prop to MiniAppPreview"
```

---

## Task 9: Toolbar popover + ChatPanel + 流式

**Files:**
- Modify: `packages/web/src/components/mini-apps/mini-app-preview.tsx`
- Modify: `packages/web/src/locales/{en,zh}/mini-apps.json`

- [ ] **Step 1: i18n 文案**

`packages/web/src/locales/zh/mini-apps.json` 顶层加：
```json
  "agent": {
    "open": "打开助手",
    "switch": "切换助手",
    "inputPlaceholder": "对助手说点什么…",
    "empty": "暂无消息",
    "loadError": "加载失败"
  }
```
`packages/web/src/locales/en/mini-apps.json` 对应：
```json
  "agent": {
    "open": "Open assistant",
    "switch": "Switch assistant",
    "inputPlaceholder": "Message assistant…",
    "empty": "No messages",
    "loadError": "Failed to load"
  }
```

- [ ] **Step 2: 加 import + 子组件 MiniAppAgentPopover**

`mini-app-preview.tsx` 顶部 import 区，在现有 import 之后加：

```tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatPanel, type ChatMessage } from '@/components/ui/chat-panel';
import { Sparkles } from 'lucide-react';
import { sdk } from '@/lib/sdk';
import { useSearchParams } from 'next/navigation';
```
（`sdk`、`useRouter` 已存在则不重复；`useSearchParams` 新增。）

在 `MiniAppPreview` 组件**之前**定义 SSE 消费 helper + 子组件：

```tsx
/** 从 fetch SSE Response 解析 event:/data: 帧，逐帧回调。 */
async function consumeSse(response: Response, onEvent: (event: string, data: unknown) => void) {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) {
        try { onEvent(event, JSON.parse(dataLines.join('\n'))); }
        catch { onEvent(event, dataLines.join('\n')); }
      }
    }
  }
}

function MiniAppAgentPopover({ projectId }: { projectId: string }) {
  const t = useTranslations('mini-apps');
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? '/';

  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; avatar?: string }>>([]);
  const [agentId, setAgentId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // session-id：sessionStorage，同 tab reload 复用
  const [sessionId] = useState(() => {
    const key = `mini-app-agent-session:${projectId}`;
    if (typeof window === 'undefined') return '';
    let sid = sessionStorage.getItem(key);
    if (!sid) { sid = crypto.randomUUID(); sessionStorage.setItem(key, sid); }
    return sid;
  });

  // 加载 agents 清单
  useEffect(() => {
    if (!projectId) return;
    sdk.miniApp.listAgents(projectId).then((r) => {
      setAgents(r.agents);
      if (r.agents.length && !agentId) setAgentId(r.agents[0].id);
    }).catch(() => {});
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // agent 变化或首次打开 → 拉历史
  const loadHistory = useCallback(async () => {
    if (!projectId || !agentId) return;
    try {
      const { messages: hist } = await sdk.miniApp.agentHistory(projectId, sessionId, agentId);
      setMessages(hist.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      })));
    } catch { /* ignore */ }
  }, [projectId, agentId, sessionId]);

  useEffect(() => { if (open) loadHistory(); }, [open, loadHistory]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !agentId || sending) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() };
    const agentMsgId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: agentMsgId, role: 'agent', content: '', timestamp: new Date() }]);
    setInput('');
    setSending(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await sdk.miniApp.agentChat(projectId, agentId, { sessionId, message: text, route });
      await consumeSse(res, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'text' && typeof d.line === 'string') {
          setMessages((prev) => prev.map((m) => m.id === agentMsgId ? { ...m, content: m.content + d.line } : m));
        } else if (event === 'message_saved') {
          // 服务端已落盘；可选：用服务端 id 替换前端临时 id
        }
      });
    } catch { /* aborted or error */ }
    finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, agentId, sending, projectId, sessionId, route]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
  }, []);

  const current = agents.find((a) => a.id === agentId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('agent.open')} />}>
        <Sparkles className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 border-0 bg-transparent shadow-none">
        <ChatPanel
          onClose={() => setOpen(false)}
          agent={{
            name: current?.name ?? 'Agent',
            avatar: current?.avatar,
            status: sending ? 'busy' : 'online',
          }}
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          inputPlaceholder={t('agent.inputPlaceholder')}
          headerActions={
            agents.length > 1 ? (
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Toolbar 里挂 popover**

在 `mini-app-preview.tsx` 的 Toolbar `<div className="flex-1 flex justify-end">`（第 99 行）内，`<Sheet>` **之前**加：

```tsx
            {enableAgents && projectId && <MiniAppAgentPopover projectId={projectId} />}
```

- [ ] **Step 4: 类型检查**

Run: `pnpm --filter @agent-spaces/web exec tsc --noEmit`
Expected: 通过。若 `PopoverTrigger render={...}` API 与项目版本不符，参照 `packages/web/src/components/ui/popover.tsx` 的实际用法调整（项目其它处如 sheet 用 `render` prop）。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/mini-apps/mini-app-preview.tsx packages/web/src/locales/zh/mini-apps.json packages/web/src/locales/en/mini-apps.json
git commit -m "feat: mini-app preview Toolbar agent chat popover"
```

---

## Task 10: 示例数据（目标项目 agents.json / api.js / manifest 开关）

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/agents.json`
- Create: `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/src/api.js`
- Modify: `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/manifest.json`

- [ ] **Step 1: manifest 加开关**

`.../wui_1781192646059_cb4df369/manifest.json` 在 `"enabledPlugins"` 之后加：
```json
  "enableAgents": true,
```

- [ ] **Step 2: agents.json**

创建 `.../wui_1781192646059_cb4df369/agents.json`（引用现有 preset `49c45e3a-75be-4116-a1e3-b750e6466544` 复用密钥，本地不填 key）：

```json
[
  {
    "id": "music-assistant",
    "name": "音乐管家",
    "avatar": "🎵",
    "agentId": "49c45e3a-75be-4116-a1e3-b750e6466544",
    "systemPrompt": "你是「AI音乐」的管家。用户说切歌/下一首/上一首时，调用 next_music 或 prev_music；说播放某首时调 play_track（但注意 v1 不传参，引导用户用列表选择）。可以用 list_plugin_tools 查看 minimax 插件能力。回答简洁。",
    "tools": { "api": true, "plugin": true }
  }
]
```

- [ ] **Step 3: src/api.js**

创建 `.../wui_1781192646059_cb4df369/src/api.js`：

```js
export default {
  // 无参：广播切下一首
  next_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'next' });
    return { ok: true, action: 'next' };
  },
  // 无参：广播切上一首
  prev_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'prev' });
    return { ok: true, action: 'prev' };
  },
};
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/
git commit -m "feat: example agents.json + api.js + enableAgents for AI音乐"
```

---

## Task 11: mini-app UI 订阅广播（操控自身）

**Files:**
- Modify: `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/src/index.jsx`（示例项目入口）

> 这一步属于「示例 mini-app 自身代码」，演示 api.js 广播如何被消费。真实项目作者按需实现。

- [ ] **Step 1: 入口订阅 miniApp.playerAction**

在 `src/index.jsx` 顶层（组件外或 App useEffect 内）加订阅：

```jsx
useEffect(() => {
  const unsub = window.AgentSpaces.onTaskEvent((event, data) => {
    if (event !== 'miniApp.playerAction') return;
    if (data.dir === 'next') nextTrack();   // 复用项目已有的切歌函数
    if (data.dir === 'prev') prevTrack();
  });
  return unsub;
}, []);
```
（`nextTrack` / `prevTrack` 用项目现有的播放控制函数；若名字不同，按 `src/hooks/useAudioPlayer.js` 的实际导出调整。）

- [ ] **Step 2: 手动验证（端到端）**

Run: `pnpm --filter @agent-spaces/server dev` + `pnpm --filter @agent-spaces/web dev`，浏览器打开 `/mini-apps-preview/wui_1781192646059_cb4df369`：
1. Toolbar 出现 ✨ 按钮 → 点开 popover → 选「音乐管家」。
2. 发「下一首」→ agent 调 `next_music` → UI 切到下一首。
3. 发「现在在哪个页面」→ agent 从注入的 route 回答。
4. 刷新页面（同 tab）→ 历史恢复；换 tab → 新会话。

- [ ] **Step 3: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/src/index.jsx
git commit -m "feat: AI音乐 subscribes to api.js playerAction broadcasts"
```

---

## Task 12: 文档

**Files:**
- Create: `docs/mini-app-preview-agent.md`

- [ ] **Step 1: 写 preview 版 agent 文档**

创建 `docs/mini-app-preview-agent.md`，说明：与编辑器版（`mini-app-agent.md`）的区别（自包含 / 不依赖 workspace / agents.json / 本地 chat 文件 / session-id / langchain 固定 / api.js 服务端沙箱 + 广播）；`agents.json` schema + `agentId` 凭据解析优先级；`src/api.js` 写法 + ctx；UI 订阅 `miniApp.*` 事件；3 个端点；边界（v1 api 不带参 / 需登录态）。

内容可直接精简自 spec §1–§9，加「如何新增一个 agent」的操作步骤。

- [ ] **Step 2: Commit**

```bash
git add docs/mini-app-preview-agent.md
git commit -m "docs: mini-app preview agent chat usage"
```

---

## 自审（Spec Coverage）

| Spec 要求 | 任务 |
|---|---|
| manifest.enableAgents | T1（类型）+ T10（开关） |
| agents.json 多 agent + agentId 复用密钥 | T2（读）+ T4（解析）+ T10（示例） |
| runtime 固定 langchain | T5（`kind:'langchain'`） |
| 读路由 | T5（注入 route）+ T9（前端每条消息带 route） |
| callPluginTool / 读插件 tools | T5（`createMiniAppFunctionTools`，现成） |
| api.js 服务端执行 + 广播 | T3（编译/ctx/tools）+ T10（示例）+ T11（UI 订阅） |
| Toolbar popover + chat-panel | T8 + T9 |
| session-id key + chat/{id}/{msg}.json | T2（存储）+ T9（sessionStorage） |
| REST + SSE 端点 | T6 + T7 |
| 凭据脱敏 | T6（GET agents 不返 apiKey） |
| 错误/边界（enableAgents / 缺 agents.json / api.js 编译失败 / 停止恢复） | T5 + T6 + T3（编译失败返空）+ T9（abort） |

**Placeholder scan**：无 TBD/TODO；每步含真实代码或确切命令。
**Type 一致性**：`MiniAppChatMessage`（T2 定义、T5/T6/T7 复用）、`MiniAppAgentConfig`（T4 定义）、`ApiCtx`/`ApiHandler`（T3 定义、T5 用）、`runMiniAppAgent` 入参（T5 定义、T6 调用）——命名一致。
**已知简化**：toolCalls 第一版不精确配对 tool_use→tool_result（T5 注释说明）；api.js 带参方法 v1 不可靠（spec §7.2 已述）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-mini-app-preview-agent-chat.md`. 见下条消息的执行方式选择。
