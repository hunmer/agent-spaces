# 模块职责

## packages/web (`@agent-spaces/web`)

前端 SPA。基于 Next.js 16，提供：
- 聊天界面（Chat）
- 代码编辑器（Monaco Editor + LSP）
- Workflow 可视化编辑器（ReactFlow）
- Mini Apps 管理
- 设置页面（Agent/Provider/MCP/Skill/Tool/Prompt/OutputStyle 等）
- Workspace/Worktree 文件管理
- 终端（xterm.js）
- 多 CLI 会话面板（`components/cli/`，每会话 flex-layout 独立持久化）
- SkyOffice 可视化办公空间（`features/skyoffice/`，Phaser + React）
- i18n 国际化
- 命令面板（cmdk）
- Zustand 状态管理（27+ stores）

## packages/server (`@agent-spaces/server`)

后端服务。Express 5 + WebSocket，提供：
- REST API（40+ 路由模块）
- WebSocket 实时通信（聊天、终端、TypeScript LSP、Agent 执行流）
- 多 AI Agent 运行时适配器（Claude Code/Codex/Grok/**Gemini CLI**/LangChain/Hermes/Pi/Open Agent SDK），`claude-code-runtime` 已独立为子模块；`RUNTIME_DESCRIPTORS` 登记 20 个 runtime id（含 openclaw/omp/opencode/qwen/cursor/kimi/kiro/kilocode/antigravity/xiaomimimo/githubcopilot 11 个别名复用既有 runtimeKind）
- **SkyOffice 可视化办公空间**（`src/skyoffice/`，Colyseus 0.15 房间服务）：多 Agent 在 2D 地图中以虚拟形象实时呈现，外部 Agent 通过 HTTP + `/agent-ws` 推送 spawn/move/talk/action，浏览器 Viewer 用 Phaser 渲染并支持 WASD 人类操控；状态纯内存（重启即丢）。详见 `packages/server/CLAUDE.md`
- Runtime 管理（`routes/runtime.ts`：CLI 发现 / SDK 安装 / 版本检测）
- Workflow 执行引擎（可视化节点编排 + HTTP 回调 + Webhook + 定时调度）
- Issue 系统（任务跟踪 + 重试 + 自动化工作流 + 评论时间线）
- SQLite 存储（20+ store：agent/chat/command/issue/workflow/mini-app 等）
- 知识库 + 向量嵌入
- Git 操作（simple-git）
- PTY 终端管理（node-pty）
- MCP 工具集成
- Notification Hub（`services/notification-hub/`：微信/飞书 Bot + 命令路由）
- 插件系统（运行时动态加载）
- 语音识别

## packages/electron (`@agent-spaces/electron`)

桌面壳。Electron 31，提供：
- 窗口管理（拖拽/最大化/最小化）
- `local://` 和 `app://` 自定义协议
- 全局快捷键
- IPC 通信（文件系统操作、插件管理）
- 自动更新（electron-updater）
- 本地 HTTP 服务（生产模式加载 Web 静态导出）

## packages/sdk (`@agent-spaces/sdk`)

前端 API SDK。统一封装所有后端 HTTP 调用，提供：
- `createSDK()` 工厂函数
- 35+ API 模块（workspace/agent/channel/issue/workflow/...）
- HTTP 客户端（Token 管理、错误处理、调试日志）

## packages/shared (`@agent-spaces/shared`)

共享类型。提供跨前后端的 TypeScript 类型定义：
- Agent/Channel/Command/Issue/Workflow/Workspace 等 30+ 类型文件
- 纯类型包，无运行时代码

## packages/templates (`@agent-spaces/agents`)

模板/插件/技能打包。提供：
- 插件模板（plugins/）
- 技能模板（skills/）
- Workflow UI 组件（workflow-ui/）
- Mini Apps 打包（pack-mini-apps.mjs）
- 索引生成（generate-index.mjs）

## packages/dom-inspector-hook (`dom-inspector-hook`)

开发工具。捕获元素源码信息（code-inspector-plugin），POST 到自定义 URL 用于 DevInspector 跳转。

## packages/flutter

移动端壳。Flutter WebView 嵌入 Web 静态导出：
- 多平台支持（Android/iOS/macOS/Windows）
- 本地通知（awesome_notifications）
- SSH 终端（dartssh2 + xterm）
- 国际化（easy_localization）

## documents

文档站点。Docusaurus 3：
- 博客
- API 文档
- 部署在 port 3001
