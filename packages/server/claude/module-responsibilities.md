# Server 模块 — 模块职责

## 路由层 (routes/)

42 路由文件，对应 REST API 各模块。每个路由文件导出 Express Router。

## 服务层 (services/)

100 业务逻辑文件，核心子域：

| 子域 | 关键文件 | 职责 |
|---|---|---|
| 内置工具 | `builtin-tools/`（12 文件：agent-tools / command-tools / database-tools / issue-tools / mini-app-tools / team-tools / workflow-editor-tools / workflow-exec-tools / workspace-file-tools / input-helpers / index + workflow-editor/） | Agent 可调用内置工具（Workflow 编辑器、数据库、Issue、Team 协作、命令、文件、Agent 等） |
| Team 协作 | `team.ts`, `team-manage.ts`, `team-membership.ts`, `team-message.ts`, `team-inbox.ts`, `team-runtime.ts`, `team-internal.ts`, `team-types.ts`（8 文件） | 多 Agent 团队：创建/成员角色/消息广播与直发/收件箱/运行时编排 |
| 通知中心 | `notification-hub/` (11 文件) | 微信/飞书/机器人通知推送 |
| 语音识别 | `speech-recognition/` (3 文件) | 腾讯语音等 |
| 订阅管理 | `subscription/` (5 文件) | AI Code/MiniMax/智谱订阅 |
| 执行引擎 | `execution-*.ts` (9 文件) | Workflow 节点执行、值访问、回调 |
| AI 文本 | `ai-text.ts` | LLM 文本生成 |
| Agent | `agent.ts`, `agent-commands.ts` | Agent 管理/命令 |
| Chat | `chat.ts`, `chat-run.ts` | 聊天会话/聊天运行 |
| Git | `git-operation-log.ts`, `gitignore.ts` | Git 操作日志 |
| 插件 | `plugin.ts`, `plugin-runtime-api.ts` | 插件管理/运行时 |
| 知识库 | `knowledge-base-parser.ts`, `embedding-util.ts`, `database-vector.ts` | 知识库解析 + 向量嵌入 |
| Hook | `hook-engine.ts` | Webhook/Hook 引擎 |
| Workspace | `workspace.ts`, `workspace-prompt.ts` | 工作区管理 |
| Workflow | `workflow.ts`, `workflow-trigger-service.ts`, `workflow-command-runner.ts` | Workflow 编排/触发/命令 |
| PTY | `pty.ts` | 终端管理 |
| 搜索 | `search.ts` | 全文搜索 |

## AI 适配器 (adapters/)

| 适配器 | 文件 | SDK |
|---|---|---|
| Claude Code | `claude-code-runtime/` (6 文件) | @anthropic-ai/claude-agent-sdk |
| OpenAI Codex | `codex-runtime.ts`, `codex-function-tool-bridge.ts` | @openai/codex-sdk |
| Grok | `grok-runtime.ts` | Grok CLI（spawn 子进程） |
| Gemini CLI | `gemini-cli-runtime.ts` | Google Gemini CLI（spawn 子进程） |
| LangChain | `langchain-runtime.ts` | @langchain/* |
| Hermes | `hermes-runtime.ts` | 自研 |
| Pi | `pi-runtime.ts` | @earendil-works/pi-coding-agent |
| Open Agent SDK | `open-agent-sdk-runtime.ts` | @codeany/open-agent-sdk |
| Agent Runtime | `agent-runtime.ts`, `agent-runtime-types.ts` | 统一接口（`AgentRuntimeKind` 8 种） |
| Git | `git.ts` | simple-git |

## SkyOffice (skyoffice/)

Colyseus 0.15 房间服务，多 Agent 可视化办公空间。独立 tsconfig + CJS 隔离编译（输出 `dist/skyoffice/`）。

| 子目录/文件 | 职责 |
|---|---|
| `index.ts` | 入口：`mountSkyOfficeRoutes(app)` 挂 HTTP 路由、`attachSkyOffice({app,server})` 接入实时、`getColyseusUpgradeHandler()` 摘出 transport upgrade handler 供主 dispatcher 委托 |
| `api/roomRoutes.ts` | 房间 CRUD（`/api/skyoffice/rooms`），自管 per-room token 鉴权 |
| `api/mapRoutes.ts` | 地图数据（`/api/skyoffice/map`），定位地图资源（原 `packages/skyoffice-web/` 已删除，地图数据现由内置/数据目录提供） |
| `api/auth.ts` | per-room token 签发/校验 |
| `broadcast/BroadcastServer.ts` | Agent 广播 WS（`/agent-ws`），被动 `handleUpgrade`，不劫持 removeAllListeners |
| `broadcast/Bridge.ts` | 广播消息桥接到 Colyseus 房间 |
| `rooms/SkyOffice.ts` | Colyseus 房间定义（状态机 + 命令分发） |
| `rooms/RoomRegistry.ts` | 房间注册表 |
| `rooms/commands/*.ts` | 命令模式：`PlayerUpdateCommand` / `PlayerUpdateNameCommand` / `ChatMessageUpdateCommand` |
| `rooms/schema/OfficeState.ts` | `@colyseus/schema` 状态定义（`import type` 适配 isolatedModules + emitDecoratorMetadata） |
| `types/*.ts` | 领域类型：`IAgent` / `IOfficeState` / `Messages` / `PlayerBehavior` / `Rooms` / `Items` / `KeyboardState` / `BackgroundMode` / `agentZones` |
| `examples/` | 集成示例：`agent-client.ts` / `agent-client.py` / `README.md`（端口 3100，API 前缀 `/skyoffice`） |

## Agent 运行时 (agents/)

| 文件 | 职责 |
|---|---|
| `agent-context.ts` | Agent 上下文管理 |
| `agent-designer.ts` | Agent 设计器 |
| `issue-agent-runner.ts` | Issue Agent 执行 |
| `commit-agent.ts` | Git Commit Agent |
| `pull-request-agent.ts` | PR Agent |
| `scheduler-agent.ts` | 定时调度 Agent |
| `title-generator-agent.ts` | 标题生成 Agent |

## WebSocket (ws/)

| 文件 | 职责 |
|---|---|
| `handler.ts` | 主 WS 连接处理 |
| `connection-manager.ts` | 连接管理/广播 |
| `chat-handler.ts` | 聊天消息处理 |
| `terminal-handler.ts` | 终端 IO 转发 |
| `agent-runner.ts` | Agent 执行流 |
| `agent-prompt.ts` | Agent Prompt 处理 |
| `mini-app-channels.ts` | mini-app 任务中断通道（`miniApp.taskStop` 事件，前端凭 taskId 主动中断 mini-app agent 执行） |
| `execution-channels.ts` | Workflow 执行通道 |
| `message-parts.ts` | 消息分片处理 |
| `html-utils.ts` | HTML 工具 |

> 注：原 `typescript-lsp.ts`（TypeScript LSP WS 代理）已于本期删除，对应 `/ws/lsp/typescript` 端点下线。

## 存储层 (storage/)

20+ Store 文件，详见 [data-model.md](data-model.md)。

## 中间件 (middleware/)

| 文件 | 职责 |
|---|---|
| `auth.ts` | authMiddleware, verifyToken |
