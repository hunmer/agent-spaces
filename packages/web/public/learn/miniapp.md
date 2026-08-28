# MiniApp

Mini-app 是 Agent Spaces 提供的轻量应用形态。每个 Mini-app 是一个独立、自包含的 React 或 HTML 项目，自带源码、配置、数据与（可选）SQLite 数据库，可在平台内编辑、预览、运行，也可挂载 Agent 运行时让 Agent 帮你编写。

## 组成要素

- **项目类型** `react` 或 `html`（入口 `index.jsx` / `index.html`）
- **源码目录** `src/`
- **配置目录** `configs/`（JSON，沙箱服务端读写，实时同步）
- **数据目录** `data/`（文本 / 二进制）
- **SQLite 数据库** `data/db/<dbName>.sqlite`（基于 better-sqlite3，可多个）
- **Agent 配置**（可选）`agents.json`
- **manifest.json**（名称、类型、入口、启用插件、头像）

所有 Mini-app 存放在 `~/.agent-spaces-data/mini-apps/{projectId}/`。

## 创建与编辑

### 创建项目

`POST /api/mini-apps`，请求体需 `name` + `type`。名称全局唯一，重名返回 409。

- React → 生成 `index.jsx`（用 `window.AgentSpacesUI` 解构宿主组件）
- HTML → 生成最小 `index.html`

### 编辑源码

前端集成 Monaco + TypeScript LSP。文件管理 REST 路由：files 树、manifest、content 读写、rename、folder、upload、delete。所有路径经 `safeSrcPath` 越界校验。

### 导入与导出

- `GET /api/mini-apps/:id/export` — 打包为 ZIP
- `POST /api/mini-apps/import` — 接收 base64 ZIP，自动定位内容根

## 预览与运行

预览页一次性加载所有源码，按 `manifest.mainFile` 解析入口。入口缺失会显式报错，不静默 fallback。

- **React 模式** — 浏览器端 Babel 编译 + `new Function()` 沙箱，无构建链。宿主通过 `window.AgentSpacesUI` 注入组件与图标。
- **HTML 模式** — 普通 HTML/CSS/JS，`window.AgentSpacesUI` 与 `window.AgentSpaces` 同样可用。

白名单模块：`react`、`react-dom`、`@dnd-kit/*`、`@tiptap/*`、`@agent-spaces/ui` 等。

> Mini-app 不会单独跑 Tailwind 扫描。需要稳定样式时优先用内联 `style`，或复用 `window.AgentSpacesUI` 组件。

## 沙箱服务（src/services/*.js）

服务编译机制：剥离 import 行 → ESM 转 CJS → `new Function` 沙箱求值。每个 handler 获得 `MiniAppServiceContext`，可读写 `configs/`、广播事件、列出运行中任务。通过 `POST /api/mini-apps/:id/services/invoke` 调用。

## Agent 运行时

Mini-app 内置 Agent 对话能力，自包含执行，不依赖 workspace：

- **预览页模式** — 基于项目自己的 `agents.json` + `langchain` 运行时
- **编辑器模式** — 复用通用 ChatPanel，额外注入 `miniAppContext`（projectId、活动文件路径、当前文件内容）

### 函数工具注入

当 `agent.tools` 允许时（默认 `{ api: true, plugin: true }`）注入：

- `list_agent_spaces_ui_components` — 列出宿主 React 组件
- `list_plugin_tools` / `get_plugin_tool_detail` / `execute_plugin_tool` — 插件工具
- `api.js` 方法工具 + `get_mini_app_tools` 元工具

### SSE 流式对话

`POST /api/mini-apps/:id/agents/:agentId/chat` 流式返回：`reasoning` / `tool_use` / `tool_result` / `text` / `message_saved` / `done` / `error`。

## SQLite 数据持久化

`packages/server/src/storage/mini-app-db.ts`（better-sqlite3）：

- 连接按 `projectId/dbName` 复用，首次打开设 `WAL` + `busy_timeout=5000`
- `POST /api/mini-apps/:id/db/:dbName` — 单语句（`mode: all|get|run|exec`）
- `POST /api/mini-apps/:id/db/:dbName/transaction` — 批量原子执行
- 所有 SQL 经 `checkSql` 安全校验，`all` 结果超 `MAX_ROWS` 抛错

## 客户端 RPC

服务端 → 预览客户端的请求-响应 RPC：`requestMiniAppClient(projectId, type, payload, timeoutMs=5000)`，通过 `miniApp.clientRequest/Response` 事件配对，超时 reject。

## WebSocket 事件

- `miniApp.configChanged` — configs 写入后广播
- `miniApp.clientRequest` / `clientResponse` — RPC 双向
- `miniApp.taskSnapshot` / `configSnapshot` — 客户端连入时推送快照

## Background service

Mini-app 可在 `manifest.json` 增加一行配置开启后台服务：

```json
{ "backgroundService": { "enabled": true } }
```

默认加载 `src/background.js`，也可用 `entry` 指定入口。入口导出函数（或 `{ onTask }`）接收任务并返回结果。宿主 API 提供 `registerBackgroundService(config)` 与 `submitBackgroundTask(task)`；任务通过现有 `/ws` 长连接提交，立即返回 `taskId`，完成后广播 `miniApp.background.completed`，失败广播 `miniApp.background.failed`。服务端内置 `persist-images` 任务，用于把生成图片异步写入工作区目录。
