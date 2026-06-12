# Mini-App Agent Chat（Preview Toolbar 自包含版）设计

- 日期：2026-06-13
- 状态：设计已确认，待实施计划
- 目标 mini-app：`wui_1781192646059_cb4df369`（AI音乐）

## 1. 目标与范围

为 mini-app（Workflow UI 项目）增加**自包含的 Agent 对话能力**：在 standalone 预览页 Toolbar 里通过 popover 打开聊天面板，用户用自然语言指挥 agent 读取路由、调用插件工具、执行项目自定义的 `api.js` 方法（如 `next_music` / `prev_music`）来操控 UI。Runtime 固定 langchain。

### 范围内

- `manifest.json` 增 `enableAgents` 开关。
- 项目目录新增 `agents.json`（多 agent 配置，每个 agent 自带凭据，可选 `agentId` 引用全局 preset 复用密钥）。
- 项目目录新增 `src/api.js`（agent 可调用的服务端方法表）。
- `mini-app-preview.tsx` Toolbar 增 popover + `ui/chat-panel.tsx`。
- 自包含的后端执行路径（不依赖 workspace / channel）。
- 会话按页面 session-id 持久化到 `mini-apps/{id}/chat/{sessionId}/{messageId}.json`。
- agent 能力：读路由、`callPluginTool`、调 api.js 方法。

### 范围外（第一版不做，后续再说）

- api.js 方法的复杂 JSON Schema 参数描述（第一版仅无参 / 简单 object）。
- 公网匿名分享（无 Bearer token）场景——本设计要求登录态。
- 复用编辑器现有 `mini-app-chat.tsx`（那是 workspace/channel 耦合版，本设计是独立 preview 版）。
- 多 agent 协同 / 跨 agent 上下文传递。

## 2. 背景：为什么自包含，不复用编辑器版

现有 [docs/mini-app-agent.md](../../mini-app-agent.md) 描述的 mini-app agent 聊天挂在**编辑器**右下角，复用主聊天系统的 workspace channel + `runMentionedAgent`：

- agent 配置来自 workspace 全局 Agent Preset（单选，写回 `MiniAppProject.agentConfigId`）。
- 消息走 workspace channel，channel id 存浏览器 localStorage。
- 强依赖 `workspaceId`（查 preset / session / channel / 广播）。

本设计面向 **standalone 预览页**（`/mini-apps-preview/[id]`）。关键事实：

- [app-shell.tsx:31](../../../packages/web/src/components/layout/app-shell.tsx#L31) 把 preview 路径当 share 路径处理 → **无 sidebar、无 workspace 上下文**。
- [auth-guard.tsx](../../../packages/web/src/components/layout/auth-guard.tsx) 不放行 preview 路径 → **仍需登录态、带 Bearer token**，但**没有 active workspace**。

因此现有 `runMentionedAgent`（需 workspace）无法直接用于 preview。本设计新建一条**自包含执行路径**：配置来自 `agents.json`（非 workspace preset），存储走本地 chat 文件（非 channel），session 用页面 session-id（非 channel id）。Runtime 执行层（`createAgentRuntime` + langchain + `createMiniAppFunctionTools`）照旧复用。

## 3. 关键决策（已与用户确认）

1. **api.js 执行模型**：服务端 Node 沙箱执行（同 `mini-app-services.ts`），方法通过 `ctx.broadcast` 发事件，UI 订阅后操控自身。路由由前端每条消息带进 `miniAppContext.route`（agent 从上下文读，非实时往返）。
2. **agent 凭据来源**：agents.json 每个 agent **自带** `modelProvider/modelId/apiKey/apiBase`；可选 `agentId` 引用全局 Agent Preset 复用密钥（见 §5.2 解析优先级）。
3. **api.js 位置**：`src/api.js` 单文件，default-export 方法表。
4. **session-id 存储**：`sessionStorage`（key 带 projectId），同 tab reload 恢复历史，换 tab / 新会话则新建。
5. **api.js 方法 schema**：第一版仅无参 / 简单 object 参数，不做复杂 JSON Schema 描述。
6. **传输 + 存储**：专用 REST + SSE 流式 + 本地 JSON 文件（方案 A）。

## 4. 架构与数据流

```
[Preview Toolbar popover]
  ChatPanel (ui/chat-panel.tsx, 受控)
    │ onSend({ message, route, sessionId, agentId })
    ▼
sdk.miniAppAgent.chat(projectId, agentId, payload)   ── POST /api/mini-apps/:id/agents/:agentId/chat (SSE)
    ▼
[Server] runMiniAppAgent()
  1. 读 manifest.enableAgents → agents.json → 找 agentId
  2. 解析凭据（agentId→preset / 本地字段 / 默认兜底）
  3. runtime = createAgentRuntime({ kind:'langchain', provider, model, apiKey, baseURL })
  4. functionTools = [
       ...createMiniAppFunctionTools({ enabledPlugins }),   // list/get/execute plugin tool（现成）
       ...buildApiFunctionTools(projectId),                 // src/api.js 方法 → tools
     ]
  5. systemPrompt = agent.systemPrompt + 注入 {route, 可用 api 方法清单, enabledPlugins}
  6. runtime.execute(userPrompt, cwd=mini-apps/{id}, { functionTools, systemPrompt, onEvent })
       │ onEvent → SSE 推 {reasoning|tool_use|tool_result|text}
       │ api.js 方法 execute → ctx.broadcast('miniApp.<event>', ...) ──WS──▶ 所有客户端
  7. 收尾：user msg + agent msg 落 chat/{sessionId}/{msgId}.json
    ▼ SSE
[Frontend] 增量拼 agent 消息；UI 侧 onTaskEvent 同款订阅器收 miniApp.<event> 操控 UI
```

广播复用现有 `miniApp.*` WS 频道（`workspaceId = projectId`，见 [mini-app-tasks.ts](../../../packages/server/src/services/mini-app-tasks.ts) 与 [mini-app-renderer.md](../../mini-app-renderer.md)「WS 任务事件与多端同步」）。**收敛在宿主层**：广播 / 事件 / snapshot 都在 server，mini-app 代码只负责订阅 + 操控自身。

## 5. 配置

### 5.1 manifest.json

新增字段：

```json
{ "enableAgents": true }
```

- `enableAgents === true` → 预览 Toolbar 渲染 agent 按钮，后端端点可用。
- 缺失 / `false` → 不渲染，端点返回禁用错误。

### 5.2 agents.json（`mini-apps/{id}/agents.json`）

JSON 数组，每项一个 agent，runtime 固定 langchain：

```json
[
  {
    "id": "music-assistant",
    "name": "音乐管家",
    "avatar": "🎵",
    "agentId": "49c45e3a-75be-4116-a1e3-b750e6466544",
    "modelProvider": "openai-chat-completions",
    "modelId": "gpt-4o-mini",
    "apiKey": "sk-...",
    "apiBase": "https://api.example.com/v1",
    "systemPrompt": "你是 AI音乐 的管家，能切歌、查插件能力、回答用户...",
    "temperature": 0.3,
    "maxTokens": 4096,
    "tools": { "api": true, "plugin": true }
  }
]
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 本项目内 agent 标识（popover 切换器 / 聊天端点用） |
| `name` | 是 | 显示名 + ChatPanel header |
| `avatar` | 否 | emoji 或 URL，喂 ChatPanel `agent.avatar` |
| `agentId` | 否 | 引用全局 Agent Preset id，用于复用密钥（见解析优先级） |
| `modelProvider` / `modelId` / `apiKey` / `apiBase` | 否 | 自带凭据；缺失时按优先级解析 |
| `systemPrompt` | 否 | mini-app 专属人设；缺失 fallback 到 preset 的 |
| `temperature` / `maxTokens` | 否 | 默认 0.3 / 4096 |
| `tools.api` | 否 | true → 注册 `src/api.js` 方法为 functionTools |
| `tools.plugin` | 否 | true → 注册 `createMiniAppFunctionTools` |

**凭据解析优先级**（在 `runMiniAppAgent` 内）：

1. `agentId` 存在 → `agentService.listPresets('')` 按 id 找 preset，提取 `modelProvider/modelId/apiKey/apiBase` 作为**默认**。
2. agents.json 本地写了的字段**覆盖** preset 值（可只借密钥、换模型 / 换 base）。
3. `systemPrompt`：agents.json 本地的为准；缺失才用 preset 的。
4. 全都没有 → 服务端默认模型兜底（复用 `resolveLangChainModelSettings` 的 auto 解析），不硬崩。

> 复用全局 preset 用 `agentService.listPresets('')`（见 [mini-app-tools.ts:348](../../../packages/server/src/services/builtin-tools/mini-app-tools.ts#L348) 的现成用法，无需 workspace）。

### 5.3 src/api.js（`mini-apps/{id}/src/api.js`）

单文件，default-export 方法表。沙箱执行（编译方式照搬 `mini-app-services.ts` 的 `compileService`：剥离 import 行、ESM `export default` 转 `module.exports`、`new Function('module','exports', code)` 求值）。

```js
export default {
  // 无参：切下一首
  next_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'next' });
    return { ok: true };
  },
  prev_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'prev' });
    return { ok: true };
  },
  // 简单 object 参数
  play_track: ({ id }, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'goto', id });
    return { ok: true };
  },
};
```

`ctx`（注入，同 services 语义）：

| 方法 | 说明 |
|---|---|
| `ctx.broadcast(event, data)` | 向该 projectId 频道广播任意事件（`miniApp.*`） |
| `ctx.callPluginTool(pluginId, toolName, args)` | 执行已启用插件 tool（复用 plugin execute 路径） |
| `ctx.readConfig(path)` | 读 `configs/<path>`，不广播 |
| `ctx.writeConfig(path, value)` | 写 `configs/<path>` + 广播 `miniApp.configChanged` |
| `ctx.projectId` | 当前项目 id |

> handler 不能 `import` 外部模块（编译时剥离），能力通过 `ctx` 注入——与 services 一致。

## 6. 前端

### 6.1 Toolbar popover（[mini-app-preview.tsx](../../../packages/web/src/components/mini-apps/mini-app-preview.tsx)）

在现有 Toolbar 右侧（项目切换 `Sheet` 旁）加 `Popover`：

- 仅当 `manifest.enableAgents === true` 渲染触发器按钮（图标：`Sparkles` / `Bot`）。
- 内容挂 `<ChatPanel>`（[ui/chat-panel.tsx](../../../packages/web/src/components/ui/chat-panel.tsx)，受控 `messages` / `input` / `onSend` / `onStop` / `agent` / `markdown`）。
- `headerActions` 放 **agent 切换器**：agents.json 多于 1 个时下拉选当前 agent；单 agent 不显示。
- `MiniAppPreview` 新增 prop：`enableAgents?: boolean`（从 manifest 透传）。standalone 预览页 [preview-page-client.tsx](../../../packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx) 把 `project.enableAgents` 传进来。

### 6.2 session-id

- `sessionStorage` key = `mini-app-agent-session:${projectId}`。
- 首次进入生成 `crypto.randomUUID()`，存入；reload 同 tab 复用 → 恢复历史；换 tab / 清 sessionStorage → 新会话。
- 不用 `useId()`（渲染间不稳定）。

### 6.3 路由注入

每条用户消息发送时，payload 带 `route`：当前 iframe 的 `?route` 值。来源复用 [mini-app-router.tsx](../../../packages/web/src/components/mini-apps/mini-app-router.tsx) 已有的 postMessage 透传（iframe → 宿主页 URL 的 `route` 参数）。MiniAppPreview 需把当前 route 透给 popover（监听 `route` search param 或 iframe postMessage）。

### 6.4 流式渲染

`onSend` → `sdk.miniAppAgent.chat(...)` 返回 SSE 流，按事件增量拼接 agent 消息：

- `text` → 追加 content
- `reasoning` → ChatPanel typing / 折叠推理
- `tool_use` / `tool_result` → `renderMessageExtras` 里展示工具调用气泡（next_music 等）

停止：`onStop` → `AbortController` 取消 fetch 流。

### 6.5 历史加载

popover 打开（或 agent 切换）时，`GET /api/mini-apps/:id/agents/chat?sessionId=&agentId=` 拉历史，灌入 `messages`。

## 7. 后端

### 7.1 执行器 `mini-app-agent.ts`（新建，services 层）

```ts
runMiniAppAgent({
  projectId, agentId, sessionId, message, route,
  onEvent,              // SSE 推送
  signal?,              // 取消
}): Promise<{ userMessage, agentMessage }>
```

步骤：

1. `getProjectDir(projectId)` → 读 `manifest.json`，校验 `enableAgents`。
2. 读 `agents.json` → 找 `id === agentId`；找不到抛错。
3. 解析凭据（§5.2 优先级）：`agentId` → `agentService.listPresets('')` 查 preset → 合并本地字段。
4. `runtime = createAgentRuntime({ kind:'langchain', provider, model, apiKey, baseURL, ... })`。
5. 组装 functionTools：
   - `tools.plugin` → `createMiniAppFunctionTools({ enabledPlugins: manifest.enabledPlugins })`（现成：`list_plugin_tools` / `get_plugin_tool_detail` / `execute_plugin_tool` / `list_agent_spaces_ui_components`）。
   - `tools.api` → `buildApiFunctionTools(projectId)`（§7.2）。
6. 拼 `systemPrompt` = `agent.systemPrompt` + 注入块：
   - 当前路由：`Current route: {route}`（来自 payload）。
   - 可用 api 方法清单（name + 一句话描述）。
   - enabledPlugins 清单。
7. `runtime.execute(message, cwd=getProjectDir(projectId), { functionTools, systemPrompt, outputStyle, onEvent, maxTurns, signal })`。
8. 收尾：构造 user message + agent message，落 `chat/{sessionId}/{msgId}.json`，返回。

cwd 设到项目目录（同现有 miniAppContext 规则），让 agent 能用原生文件工具读 `src/`。

### 7.2 `buildApiFunctionTools(projectId)`（新建）

复用 `compileService` 思路加载 `src/api.js`，对每个导出方法生成 `AgentFunctionTool`：

- `name` = 方法名（snake_case）。
- `description` = 方法名（第一版不做 JSDoc 解析；约定方法名自描述）。
- `inputSchema` = `{ type: 'object', properties: {} }`（第一版不做参数 schema）。
- `execute(input)` = `handler(input, makeApiCtx(projectId))`。
- `src/api.js` 缺失或编译失败 → 返回空数组 + 日志告警（同 services 行为），不阻断 agent 运行。

> **第一版参数限制**：`inputSchema` 是空 object，意味着模型被告知「无参数」。因此无参方法（`next_music` / `prev_music`）可靠工作；**带参方法（如 `play_track({id})`）在 v1 不可靠**——模型不会主动传 `id`。需要带参的方法应让 agent 通过别的方式拿 id（如先 `list_plugin_tools` / 读 config），或等后续版本加参数 schema。这是已确认的范围外取舍。

`makeApiCtx`（§5.3 的 ctx 实现）：`broadcast` → `broadcastToWorkspace(projectId, event, data)`；`callPluginTool` → 复用 plugin execute；`readConfig/writeConfig` → `mini-app-store`。

### 7.3 路由（新建 `routes/mini-app-agent.ts`）

Bearer 鉴权（同其它 mini-app 路由）。

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/api/mini-apps/:id/agents` | 返回 `{ enableAgents, agents: [{id,name,avatar}] }`（脱敏，不带 apiKey） |
| GET | `/api/mini-apps/:id/agents/chat?sessionId=&agentId=` | 返回该 session 历史消息数组（按 timestamp 排序） |
| POST | `/api/mini-apps/:id/agents/:agentId/chat` | SSE 流式。body `{ sessionId, message, route }` → 事件流 |

SSE 实现照搬 [chat-run.ts:293](../../../packages/server/src/routes/chat-run.ts#L293) / [agent-sse.ts:208](../../../packages/server/src/routes/agent-sse.ts#L208) 的 `text/event-stream` 写法。

### 7.4 存储（`mini-app-store.ts` 增方法）

- `listAgentChats(projectId, sessionId)` → 枚举 `chat/{sessionId}/*.json`，按 timestamp 排序。
- `saveAgentChat(projectId, sessionId, message)` → 写 `chat/{sessionId}/{message.id}.json`。
- 文件格式：

```json
{
  "id": "msg-uuid",
  "sessionId": "...",
  "agentId": "music-assistant",
  "role": "user" | "agent",
  "content": "...",
  "route": "/history?filter=done",
  "toolCalls": [{ "name": "next_music", "input": {}, "result": { "ok": true } }],
  "timestamp": "2026-06-13T...Z"
}
```

- 项目删除时随目录递归清理（现有删除逻辑已递归删整个项目目录，无需额外处理）。

### 7.5 SDK（`packages/sdk`）

`miniAppAgent` 命名空间：

- `list(projectId)` → GET agents
- `history(projectId, sessionId, agentId)` → GET chat
- `chat(projectId, agentId, { sessionId, message, route, onEvent, signal })` → POST SSE，回调式消费事件（复用 sdk 现有 SSE 消费模式，见 [client.ts:220](../../../packages/sdk/src/client.ts#L220)）。

## 8. UI 订阅 api.js 广播

api.js 的 `ctx.broadcast` 走 `miniApp.*` WS 频道。mini-app 项目代码用**已有的** `window.AgentSpaces.onTaskEvent` 同款订阅机制监听自定义事件并操控 UI：

```js
// mini-app 项目代码（src/index.jsx 等）
window.AgentSpaces.onTaskEvent((event, data) => {
  if (event === 'miniApp.playerAction') {
    if (data.dir === 'next') nextTrack();
    if (data.dir === 'prev') prevTrack();
    if (data.dir === 'goto') playTrack(data.id);
  }
});
```

> 第一版沿用 onTaskEvent 通道承载自定义业务事件；若语义上想分离，后续可加专用 `onCustomEvent`，但第一版不引入新订阅器（KISS）。

## 9. 错误处理与边界

- `enableAgents !== true` → Toolbar 不渲染按钮；端点返回 403 / 禁用错误。
- `agents.json` 缺失或 `agentId` 找不到 → 端点返回明确错误，不静默降级。
- `agentId` 引用的 preset 不存在 → 按本地字段 / 默认兜底，日志告警。
- `src/api.js` 编译失败 → 该方法不注册，agent 看不到，日志告警（同 services），不阻断运行。
- 无 apiKey 且无 preset 且无默认 → 运行前校验，返回明确「未配置模型」错误。
- SSE 断连 / 用户停止 → 已落盘消息保留；前端 reload 按 sessionId 恢复。
- 凭据脱敏：GET agents 端点不返回 apiKey。

## 10. 文件改动清单

### 新建

- `packages/server/src/services/mini-app-agent.ts` — `runMiniAppAgent` + `buildApiFunctionTools` + `makeApiCtx`。
- `packages/server/src/routes/mini-app-agent.ts` — 3 个端点。
- `packages/sdk/src/mini-app-agent.ts`（或并入现有 mini-app 适配器）— SDK 命名空间。
- `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/agents.json` — 示例配置。
- `packages/server/agent-spaces-data/mini-apps/wui_1781192646059_cb4df369/src/api.js` — 示例 next/prev/play 方法。

### 修改

- `packages/server/src/storage/mini-app-store.ts` — 增 `listAgentChats` / `saveAgentChat`；manifest 类型加 `enableAgents`。
- `packages/shared/src/types/`（mini-app 相关）— `MiniAppProject` 加 `enableAgents?: boolean`；新增 `MiniAppAgentConfig` / `MiniAppChatMessage` 类型。
- `packages/web/src/components/mini-apps/mini-app-preview.tsx` — Toolbar 加 popover + ChatPanel；新增 `enableAgents` prop；session-id / route / agent 切换器 / 流式逻辑。
- `packages/web/src/app/mini-apps-preview/[id]/preview-page-client.tsx` — 透传 `enableAgents`。
- `packages/sdk/src/index.ts`（导出聚合）— 挂 `miniAppAgent`。
- 服务端 app.ts / 路由注册 — 挂载 `routes/mini-app-agent.ts`。
- `packages/web/src/locales/{en,zh}/mini-apps.json` — popover / 切换器 / 错误文案 i18n。

### 文档

- `docs/mini-app-agent.md` 或新增 `docs/mini-app-preview-agent.md` — 说明 preview 版与编辑器版的区别、agents.json / api.js 用法。

## 11. 验证标准

- `enableAgents: false` 的项目 Toolbar 不出现 agent 按钮。
- 目标项目（AI音乐）打开预览 → Toolbar 出现按钮 → popover 打开 → 选 agent → 发「切下一首」→ agent 调 `next_music` → 广播 `miniApp.playerAction{dir:next}` → UI 收到切歌。
- 发「现在在哪个页面」→ agent 从注入的 route 回答当前视图。
- reload 预览页（同 tab）→ 历史恢复；换 tab → 新会话。
- agents.json 用 `agentId` 引用 preset → 不填 apiKey 也能跑。
- `src/api.js` 语法错误 → agent 仍能跑（仅缺 api 工具），后端有告警日志。
