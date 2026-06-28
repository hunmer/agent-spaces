## Agent 运行时与工具注入

Mini-app 内置独立的 Agent 对话能力，运行链路封装在 `packages/server/src/services/mini-app-agent.ts` 的 `runMiniAppAgent()` 中。它自包含执行，不依赖 workspace 系统：读取 `agents.json` → 解析凭据 → 组装 functionTools → 注入 systemPrompt → 执行 → 落盘消息。

### 两种对话入口

Mini-app 当前有两条独立的 Agent 入口：

- **预览页模式**：走 `GET /api/mini-apps/:id/agents`、`GET /api/mini-apps/:id/agents/chat`、`POST /api/mini-apps/:id/agents/:agentId/chat`，完全基于项目自己的 `agents.json` 与 `langchain` 运行时。
- **编辑器模式**：编辑器右下角的 `MiniAppChat` 复用通用 `ChatPanel` 和 workspace channel，但会额外注入 `miniAppContext`（`projectId`、活动文件路径、项目类型、当前文件内容），让运行时把 `cwd` 切到该 Mini-app 的真实目录。

编辑器模式更适合边写边改；预览页模式更适合项目内自包含助手。两者共用同一项目目录和文件系统，但消息存储与运行入口不同。

### 运行时选择

当前 Mini-app 内置 Agent 固定使用 `langchain` 运行时（`runtimeConfig.kind = 'langchain'`），并解析凭据优先级为：

1. `agentId` 指向的 Agent preset 作为默认（`modelProvider`/`modelId`/`apiKey`/`apiBase`/`systemPrompt`/`temperature`/`maxTokens`）。
2. Agent 本地字段覆盖 preset 值。
3. `systemPrompt` 本地优先，缺失才用 preset。
4. 全都没有则调用方走服务端默认模型兜底。

凭据解析后，可通过 `providerId` 或 `apiBase`+`apiKey` 匹配已配置的 provider。

### 函数工具注入

当 `agent.tools` 配置允许时（默认 `{ api: true, plugin: true }`），运行时注入以下工具：

- **plugin 工具**（由 `createMiniAppFunctionTools()` 提供，定义在 `packages/server/src/services/builtin-tools/mini-app-tools.ts`）：
  - `list_agent_spaces_ui_components` — 按分类列出 `window.AgentSpacesUI` 暴露的宿主 React 组件（共约 9 个分类：actions / forms / layout / navigation / overlays / feedback / data-display / media / utilities）。
  - `list_plugin_tools` — 列出项目已启用插件（`enabledPlugins`）注册的所有 tool 与内置 tool 的轻量摘要。
  - `get_plugin_tool_detail` — 查看指定插件 tool 的完整 `input_schema`。
  - `execute_plugin_tool` — 执行插件 tool，内置虚拟插件 `@agent-spaces/builtin` 提供 `list_agent_presets` 与 `agent_run` 两个内置工具。
- **api.js 方法工具**：项目 `src/api.js` 编译出的方法表（编译机制与 services 一致），每个方法被包装成一个 function tool；同时注入一个 `get_mini_app_tools` 元工具，让 Agent 查询 `src/tools.js` 里声明的工具元数据（描述与 inputSchema）后再调用项目自定义方法。

### systemPrompt 注入

运行时会拼接出 systemPrompt，包含：Agent 自带 systemPrompt、当前路由（`route`）、当前 projectId、可用 api.js 方法名清单（提示先调 `get_mini_app_tools` 看描述），以及启用的插件清单（提示用 `list_plugin_tools` 等三个工具）。

### SSE 流式对话

对话通过 `POST /api/mini-apps/:id/agents/:agentId/chat` 触发，以 Server-Sent Events 流式返回以下事件：

- `reasoning` — 思考过程（含 status）
- `tool_use` — 工具调用（id / name / input）
- `tool_result` — 工具结果（toolUseId / result）
- `text` — 输出文本行
- `message_saved` — 对话结束，落盘的用户与 agent 消息
- `done` / `error`

用户消息时间戳在执行**前**捕获，agent 消息时间戳在执行后生成，保证严格 `user` 早于 `agent`，避免同毫秒落盘导致历史排序错乱。agent 消息会附带 `toolCalls` 数组（name / input / result）。

### Agent 配置管理

- `GET /api/mini-apps/:id/agents` — 脱敏返回 agents 清单与 `enableAgents` 开关（不含 apiKey）。
- `GET /api/mini-apps/:id/agents/:agentId` — 返回完整 agent config（含 apiKey，仅供编辑器加载）。
- `PUT /api/mini-apps/:id/agents/:agentId` — 整条替换 agent config；写入时会剥离 `apiKey`/`apiBase`/`baseURL`，按 provider 解析后只存非敏感字段。
- `GET /api/mini-apps/:id/agents/chat?sessionId=&agentId=` — 拉取历史消息（按 timestamp 升序）。
- `DELETE /api/mini-apps/:id/agents/chat?sessionId=&agentId=` — 清空 session（可按 agentId 过滤）。

服务器启动时会调用 `ensureAgentsConfigs()`：若某项目的 `agents.json` 尚不存在但 manifest 声明了 `agents` 种子数组，则把种子写入 `agents.json`；已存在的 `agents.json` 一律跳过，绝不覆盖（哪怕文件损坏）。