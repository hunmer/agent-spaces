# Mini-App Preview Agent Chat（预览 Toolbar 自包含版）

本文档说明 mini-app（Workflow UI 项目）在 **standalone 预览页 Toolbar** 中自包含的 Agent 对话能力：配置来源、`agents.json` / `src/api.js` 用法、凭据解析优先级、REST 端点与已知边界。

这是**预览 Toolbar 自包含版**，与 [mini-app-agent.md](mini-app-agent.md) 描述的「编辑器浮窗版」是两条不同的实现路径。两者的区别见下文「与编辑器版的区别」。

## 目标

在预览页 Toolbar 右侧通过 popover 打开一个聊天面板，让用户用自然语言指挥 Agent：

- 读取当前路由（由前端每条消息带进上下文）。
- 调用项目已启用插件工具（`list_plugin_tools` / `get_plugin_tool_detail` / `execute_plugin_tool`）。
- 调用项目自定义的 `src/api.js` 方法（如 `next_music` / `prev_music`）来操控 UI，并通过 `src/tools.js` 获取这些方法的结构化参数说明。

Runtime 固定 **langchain**。整条执行链路自包含：不依赖 workspace、不走 channel、不复用编辑器的 `mini-app-chat.tsx`。

## 与编辑器版的区别

[mini-app-agent.md](mini-app-agent.md) 描述的版本挂在**编辑器**右下角，复用主聊天系统的 workspace channel + `runMentionedAgent`；本版本面向 standalone 预览页（`/mini-apps-preview/[id]`，无 sidebar、无 active workspace），因此新建了一条独立执行路径。

| 维度 | 编辑器浮窗版（`mini-app-agent.md`） | 预览 Toolbar 自包含版（本文档） |
| --- | --- | --- |
| 入口位置 | 编辑器右下角浮动按钮 | 预览 Toolbar popover |
| 配置来源 | workspace 全局 Agent Preset（单选） | 项目本地 `agents.json`（多 agent） |
| 消息存储 | workspace channel | 项目本地 `chat/{sessionId}/{msgId}.json` |
| 会话标识 | channel id（存 localStorage） | 页面 session-id（存 sessionStorage） |
| Runtime | 跟随所选 preset | 固定 langchain |
| 是否依赖 workspace | **是**（查 preset / session / channel / 广播） | **否** |
| 是否需要 `src/api.js` | 否 | 是（agent 可调用的方法表） |
| 执行入口 | WS `runMentionedAgent` | 专用 REST + SSE |

## 如何为一个 mini-app 开启 agent 对话

两步：

1. 在项目的 `manifest.json` 加 `"enableAgents": true`：

   ```json
   { "name": "AI音乐", "mainFile": "index.jsx", "enableAgents": true }
   ```

   - `enableAgents === true` → 预览 Toolbar 渲染 agent 按钮，后端端点可用。
   - 缺失 / `false` → 不渲染按钮，端点返回禁用错误。

2. 在项目根目录建 `agents.json`（与 `manifest.json` 同级），JSON 数组，每项一个 agent：

   ```json
   [
     {
       "id": "music-assistant",
       "name": "音乐管家",
       "avatar": "🎵",
       "agentId": "49c45e3a-75be-4116-a1e3-b750e6466544",
       "modelId": "gpt-4o-mini",
       "systemPrompt": "你是 AI音乐 的管家，能切歌、查插件能力、回答用户...",
       "tools": { "api": true, "plugin": true }
     }
   ]
   ```

可选第三步：在 `src/api.js` 写 agent 可调用的方法表，并在 `src/tools.js` 写这些方法的参数说明（见下文）。

## agents.json schema

数组，每项字段如下：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 本项目内 agent 标识，popover 切换器与聊天端点用它定位 |
| `name` | 是 | 显示名，渲染到 ChatPanel header |
| `avatar` | 否 | emoji 或 URL |
| `agentId` | 否 | 引用全局 Agent Preset id，用于复用密钥（见下文凭据解析优先级） |
| `modelProvider` | 否 | 模型 provider，如 `openai-chat-completions` |
| `modelId` | 否 | 模型 id |
| `apiKey` | 否 | 模型 API key |
| `apiBase` | 否 | 自定义 API base URL |
| `systemPrompt` | 否 | mini-app 专属人设 |
| `temperature` | 否 | 默认 `0.3` |
| `maxTokens` | 否 | 默认 `4096` |
| `tools.api` | 否 | `true` → 把 `src/api.js` 的方法注册为 agent function tools |
| `tools.plugin` | 否 | `true` → 注册项目已启用插件相关的 function tools |

> Runtime 固定 langchain，无需在 `agents.json` 里指定 runtime。

### 凭据解析优先级

后端 `resolveAgentCredentials` 按如下优先级合并凭据（在 `runMiniAppAgent` 内执行）：

1. **`agentId` 存在** → 用 `agentId` 在全局 Agent Preset 中查找（`agentService.listPresets('')`，无需 workspace），提取该 preset 的 `modelProvider / modelId / apiKey / apiBase / systemPrompt / temperature / maxTokens` 作为**默认值**。
2. **agents.json 本地字段覆盖 preset**：本地写了的字段（用 `??` 合并）覆盖 preset 对应值。这样可以「只借 preset 的密钥、换模型 / 换 base / 换人设」。
3. **`systemPrompt` 本地优先**：本地写了用本地；缺失才回退到 preset 的。
4. **全部都没有** → 服务端默认模型兜底（auto 解析），不硬崩。

> 因此用 `agentId` 引用一个已配好密钥的 preset 时，`agents.json` 里可以**完全不写 `apiKey`**。

### 示例：AI音乐（引用 preset，不填 apiKey）

```json
[
  {
    "id": "music-assistant",
    "name": "音乐管家",
    "avatar": "🎵",
    "agentId": "49c45e3a-75be-4116-a1e3-b750e6466544",
    "modelId": "gpt-4o-mini",
    "systemPrompt": "你是 AI音乐 的管家，能切歌、查插件能力、回答用户...",
    "temperature": 0.3,
    "maxTokens": 4096,
    "tools": { "api": true, "plugin": true }
  }
]
```

`apiKey` 来自引用的 preset；`modelId` 本地覆盖（想换模型）。

## src/api.js

项目根目录下的 `src/api.js`，单文件，**default-export 一个方法表**。每个方法是 `(input, ctx) => result`。沙箱执行（编译方式照搬 services：剥离 import 行、`export default` 转 `module.exports =`、`new Function('module','exports', code)` 求值）。

```js
export default {
  // 无参：切下一/上一首
  next_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'next' });
    return { ok: true };
  },
  prev_music: (_input, ctx) => {
    ctx.broadcast('miniApp.playerAction', { dir: 'prev' });
    return { ok: true };
  },
  generate_music: async (input, ctx) => {
    const prompt = input.prompt || '默认风格';
    const result = await ctx.callPluginTool('workflow.minimax', 'minimax_music_generation', { prompt });
    ctx.broadcast('miniApp.musicGenerated', { ... });
    return { ok: true, result };
  },
};
```

> 带参方法的结构化说明写在同目录 `src/tools.js`，不要依赖 `api.js` 的 JSDoc。

### ctx API

| 方法 | 说明 |
| --- | --- |
| `ctx.broadcast(event, data)` | 向该 projectId 频道广播任意 `miniApp.*` 事件 |
| `ctx.callPluginTool(pluginId, toolName, args)` | 执行项目已启用的插件 tool（复用 plugin execute 路径） |
| `ctx.readConfig(path)` | 读 `configs/<path>`，不广播 |
| `ctx.writeConfig(path, value)` | 写 `configs/<path>`，并广播 `miniApp.configChanged` |
| `ctx.projectId` | 当前项目 id |

### 约束

- handler **不能 `import` 外部模块**（编译时剥离 import 行），能力全部通过 `ctx` 注入 —— 与 services 一致。

## src/tools.js

项目根目录下的 `src/tools.js`，单文件，**default-export 一个工具说明数组**，或 `{ tools: [...] }`。服务启动时会遍历 mini-app 的 `src/tools.js` 并注册到内存表；agent 运行时会获得 `get_mini_app_tools` function tool，可按 mini-app id 查询对应工具说明。

每个工具说明的 `name` 必须和 `src/api.js` 导出的方法名一致。`description` 和 `inputSchema` 会注入到同名 api function tool，模型据此知道该传什么参数。

```js
export default [
  {
    name: 'generate_music',
    description: '根据提示词生成一首歌曲',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '音乐风格描述' },
        lyrics: { type: 'string', description: '歌词文本，留空表示纯音乐' },
        instrumental: { type: 'boolean', description: '是否为纯音乐，默认 true' },
      },
      required: ['prompt'],
    },
  },
];
```

**约束与边界**：

- handler **不能 `import` 外部模块**（编译时剥离 import 行），能力全部通过 `ctx` 注入 —— 与 services 一致。
- `tools.js` 也不能 `import` 外部模块；它只承载静态工具元数据。
- `tools.js` 缺失或某方法没有同名说明时，该方法仍会注册，schema 回退为 `{ type: 'object', properties: {} }`。
- handler 内部读取参数用 `input.xxx`（首参数为对象），不强制做类型校验，建议对缺失参数给默认值。
- `get_mini_app_tools` 的入参为 `{ projectId?: string }`；缺省时查询当前 mini-app。

## agent 能力

预览版 agent 注册的 function tools 取决于 `agents.json` 的 `tools` 字段：

- **读当前路由**：当前 iframe 的 `?route` 值由前端每条消息带进 payload（`miniAppContext.route`），后端注入到 systemPrompt（`Current route: {route}`）。agent 从上下文读，**非实时往返**。
- **`tools.plugin` → `createMiniAppFunctionTools`**：提供 `list_plugin_tools` / `get_plugin_tool_detail` / `execute_plugin_tool`（可见范围来自 `manifest.enabledPlugins`）。
- **`tools.api` → `buildApiFunctionTools`**：把 `src/api.js` 的每个导出方法注册成一个 function tool，并用 `src/tools.js` 的同名说明补充 `description` / `inputSchema`。

Runtime 固定 **langchain**。agent 的 `cwd` 设到项目目录，让它能用原生文件工具读 `src/`。

## UI 订阅 api.js 广播

api.js 的 `ctx.broadcast` 走现有 `miniApp.*` WS 频道（`workspaceId = projectId`，详见 [mini-app-renderer.md](mini-app-renderer.md)「WS 任务事件与多端同步」）。mini-app 项目代码用**已有的** `window.AgentSpaces.onTaskEvent` 同款订阅机制监听自定义事件并操控 UI：

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

> v1 沿用 `onTaskEvent` 通道承载自定义业务事件；第一版不引入新的专用订阅器。

## REST 端点

3 个端点，全部 Bearer 鉴权（**需要登录态**，不支持匿名分享场景）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/mini-apps/:id/agents` | 返回 `{ enableAgents, agents: [{ id, name, avatar }] }`（脱敏，不含 apiKey） |
| GET | `/api/mini-apps/:id/agents/chat?sessionId=&agentId=` | 返回该 session 历史消息数组（按 timestamp 升序） |
| POST | `/api/mini-apps/:id/agents/:agentId/chat` | SSE 流式。body `{ sessionId, message, route }`，返回 `text/event-stream` 事件流 |

SSE 事件类型：`text` / `reasoning` / `tool_use` / `tool_result`（与主聊天系统 SSE 写法一致）。停止时前端用 `AbortController` 取消 fetch 流。

## 边界

- **带参方法需写 `src/tools.js`** —— 见上文「src/tools.js」：同名工具说明会被注册为 inputSchema；缺失说明的方法默认为空对象 schema。
- **需要登录态** —— 预览路径虽无 active workspace，但仍带 Bearer token，不支持公网匿名分享。
- **`agentId` 引用的 preset 必须存在**才能复用密钥；preset 不存在时按本地字段 / 默认兜底，并打告警日志（不阻断）。
- **`src/api.js` 编译失败不致命** —— 该文件缺失或编译出错时，后端返回空方法表并告警，agent 仍能运行，只是看不到 api 方法工具。
- **会话按页面 session-id 持久化** —— key 为 `mini-app-agent-session:${projectId}` 存 sessionStorage；同 tab reload 恢复历史，换 tab / 清 sessionStorage 则新建会话。
- **凭据脱敏** —— GET agents 端点不返回 apiKey。

## 相关代码

| 文件 | 说明 |
| --- | --- |
| `packages/server/src/services/mini-app-agent.ts` | 执行器：`runMiniAppAgent`、`compileApiJs`、`compileToolsJs`、`registerAllMiniAppTools`、`loadApiJs`、`makeApiCtx`、`buildApiFunctionTools`、`resolveAgentCredentials` |
| `packages/server/src/storage/mini-app-store.ts` | 存储层：`readAgentsConfig`、`saveAgentChat`、`listAgentChats`、`getProjectDir` |
| `packages/server/src/routes/mini-apps.ts` | 3 个 agent 端点（`GET /:id/agents`、`GET /:id/agents/chat`、`POST /:id/agents/:agentId/chat`） |
| `packages/sdk/src/modules/mini-apps.ts` | SDK 命名空间：`listAgents`、`agentHistory`、`agentChat`（SSE 回调式消费） |
| `packages/web/src/components/mini-apps/mini-app-preview.tsx` | 预览 Toolbar 的 `MiniAppAgentPopover`（agent 按钮 + ChatPanel + agent 切换器 + session-id + 流式逻辑） |
| `docs/superpowers/specs/2026-06-13-mini-app-agent-chat-design.md` | 设计文档（决策、数据流、验证标准的权威来源） |
