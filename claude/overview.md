# Agent Spaces — 架构总览

## 定位

Agent Spaces 是一个**多智能体协作编程平台**，支持 AI Agent 的创建、编排、执行与可视化。用户可以定义 Agent（配置 LLM 提供商、工具、Prompt 模板），通过 Workflow 可视化编排 Agent 执行流程，并在 Workspace 中进行代码编辑、Git 操作、知识库管理等。

## 架构边界

- **前端**：Next.js 16 SPA，React 19，Zustand 状态管理，支持静态导出嵌入桌面壳。
- **后端**：Express 5 REST API + WebSocket，SQLite 存储，多 AI Agent 运行时适配器。
- **桌面壳**：Electron（窗口管理 + 本地协议 + 全局快捷键）、Flutter（WebView 嵌入 + 移动端扩展）。
- **SDK**：统一前端 API 层，封装所有后端 HTTP 调用。
- **共享层**：`@agent-spaces/shared` 提供跨前后端的类型定义。

## 运行时形态

1. **纯 Web 模式**：Web dev server (port 3000) + Server (port 3100)，API 代理到后端。
2. **Docker 模式**：Server 镜像内置静态 Web 前端，单进程部署。
3. **Electron 模式**：本地 HTTP 服务加载 Web 静态导出，后端仍为独立 Server 进程。
4. **Flutter 模式**：WebView 嵌入 Web 静态导出，支持 Android/iOS/macOS/Windows。

## 重要设计取舍

- Web 支持 `NEXT_STATIC_EXPORT=1` 纯静态导出，为 Electron/Flutter 嵌入服务。
- Server 同时作为 API 服务器和 Web 静态文件服务器（生产模式）。
- AI Agent 执行采用**多运行时适配器**模式：支持 Claude Code、OpenAI Codex、Grok、Gemini CLI、LangChain、Hermes、Pi、Open Agent SDK；`RUNTIME_DESCRIPTORS` 登记 20 个 runtime id（含 11 个别名复用既有 runtimeKind）。
- Workflow 执行引擎支持 HTTP 回调、Webhook 触发、定时调度。
- SQLite 作为主存储，JSON 文件辅助，无外部数据库依赖。
- **SkyOffice**（Colyseus 房间服务）因 colyseus 0.15 纯 CJS，采用**独立 tsconfig + CJS 隔离编译**（输出到 `dist/skyoffice/`，靠 `dist/skyoffice/package.json` 覆盖上层 ESM 声明），主后端用 `createRequire(import.meta.url)` 桥接加载；三路 upgrade 冲突由 `app.ts` 统一 dispatcher 五路分流（`/ws`、`/ws/speech`、`/ws/lsp/typescript`、`/agent-ws` + Colyseus 委托）；`SKYOFFICE_ENABLED=false` 可关闭。
