# Server 模块 — 模块职责

## 路由层 (routes/)

30+ 路由文件，对应 REST API 各模块。每个路由文件导出 Express Router。

## 服务层 (services/)

90+ 业务逻辑文件，核心子域：

| 子域 | 关键文件 | 职责 |
|---|---|---|
| 内置工具 | `builtin-tools/` | Agent 可调用内置工具（Workflow 编辑器、数据库、Issue、Team 协作、命令、文件等） |
| Team 协作 | `team.ts`, `team-manage.ts`, `team-membership.ts`, `team-message.ts`, `team-inbox.ts`, `team-runtime.ts`, `team-internal.ts`, `team-message.ts`, `team-types.ts` | 多 Agent 团队：创建/成员角色/消息广播与直发/收件箱/运行时编排 |
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
| LangChain | `langchain-runtime.ts` | @langchain/* |
| Hermes | `hermes-runtime.ts` | 自研 |
| Oh-My-Pi | `oh-my-pi-runtime.ts` | 自研 |
| Open Agent SDK | `open-agent-sdk-runtime.ts` | @codeany/open-agent-sdk |
| Agent Runtime | `agent-runtime.ts`, `agent-runtime-types.ts` | 统一接口 |
| Git | `git.ts` | simple-git |

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
| `typescript-lsp.ts` | TypeScript LSP 代理 |
| `execution-channels.ts` | Workflow 执行通道 |
| `message-parts.ts` | 消息分片处理 |

## 存储层 (storage/)

20+ Store 文件，详见 [data-model.md](data-model.md)。

## 中间件 (middleware/)

| 文件 | 职责 |
|---|---|
| `auth.ts` | authMiddleware, verifyToken |
