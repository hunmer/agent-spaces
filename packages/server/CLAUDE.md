[根目录](../../CLAUDE.md) > [packages](../) > **server**

# @agent-spaces/server

## 模块职责

Express 5 后端服务，提供 REST API、WebSocket 实时通信、认证中间件、三运行时 Agent 编排引擎（OpenAgentSdk / ClaudeCode / Codex）、Anthropic Bridge 协议中转（7 文件子模块）、通知中心（飞书 Lark + 企微 WeChat 双适配器 + Bot Agent + 16 个内置斜杠命令）、PTY 终端管理、文件系统操作、Git 操作（含 Clone SSE）、SQLite Agent Usage 统计与费用估算、LLM 模型/供应商管理、Agent Preset 管理、内置 Function Call 工具、Commit Agent（自动生成 conventional commit message）、Issue 评论与重试恢复、工具详情持久化能力。作为整个平台的核心运行时，管理 Workspace 生命周期、Issue/Task 状态机（含依赖调度）、Agent 会话调度和数据持久化。

## 入口与启动

- **入口文件**：`src/app.ts`
- **启动命令**：`pnpm dev`（tsx watch 热重载）或 `pnpm start`（编译后运行）
- **默认端口**：`3100`（可通过 `PORT` 环境变量修改）
- **数据目录**：`~/.agent-spaces-data`（可通过 `AGENT_SPACES_DATA_DIR` 修改）
- **启动流程**：Express 初始化 -> auth 中间件注册 -> 路由注册 -> HTTP Server 创建 -> WebSocket Server 创建 -> 启动 Issue 重试恢复 -> 启动持久化通知服务

## 对外接口

### REST API 路由表

所有路由挂载在 `/api/` 下，除 `/api/health`、`/api/auth/login`、`/api/auth/check` 外均需 Bearer Token 认证：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/auth/login` | POST | 认证登录（Secret Key -> Token） |
| `/api/auth/check` | GET | 检查认证状态 |
| `/api/auth/change-secret` | POST | 修改 Secret Key |
| `/api/upload/avatar` | POST | 上传 Agent 头像（base64 dataUrl） |
| `/api/workspaces` | GET/POST | 列出/创建工作空间 |
| `/api/workspaces/:id` | GET/PUT/DELETE | 获取/更新/删除工作空间 |
| `/api/workspaces/:id/prompt` | GET/PUT | 读取/写入工作空间 Prompt（Markdown） |
| `/api/workspaces/:id/clone` | POST | Git Clone（SSE 流式进度） |
| `/api/workspaces/:id/reveal` | POST | 在文件管理器中打开目录 |
| `/api/workspaces/:id/files/tree` | GET | 获取文件树（支持 `?path=` 参数） |
| `/api/workspaces/:id/files/content` | GET/PUT | 读取/写入文件内容 |
| `/api/workspaces/:id/channels` | GET/POST | 列出/创建频道 |
| `/api/workspaces/:id/channels/:channelId/messages` | GET/POST | 获取/发送消息 |
| `/api/workspaces/:id/channels/:channelId/messages/:messageId/tool-details/:detailId` | GET | 获取工具调用详情（懒加载） |
| `/api/workspaces/:id/issues` | GET/POST | 列出/创建议题 |
| `/api/workspaces/:id/issues/:issueId` | GET/PUT | 获取/更新议题 |
| `/api/workspaces/:id/issues/:issueId/start` | POST | 启动议题（draft -> planned） |
| `/api/workspaces/:id/agents` | GET | 列出 Agent 会话 |
| `/api/workspaces/:id/agents/start` | POST | 启动 Agent 会话 |
| `/api/workspaces/:id/agents/:agentId/stop` | POST | 停止 Agent 会话 |
| `/api/workspaces/:id/agents/presets` | GET/POST | 列出/创建 Agent 预设 |
| `/api/workspaces/:id/agents/presets/test-connection` | POST | 测试 Agent 连接 |
| `/api/workspaces/:id/agents/presets/:presetId` | PUT/DELETE | 更新/删除 Agent 预设 |
| `/api/workspaces/:id/agent-templates` | GET | 列出全局 Agent 模板 |
| `/api/workspaces/:id/agents/from-templates` | POST | 从模板导入 Agent 到工作空间 |
| `/api/workspaces/:id/tasks` | GET | 列出任务（支持 `?issueId=` 过滤） |
| `/api/workspaces/:id/tasks/:taskId` | GET | 获取任务 |
| `/api/workspaces/:id/tasks/:taskId/retry` | POST | 重试任务 |
| `/api/workspaces/:id/tasks/:taskId/cancel` | POST | 取消任务 |
| `/api/workspaces/:id/git/status` | GET | Git 状态 |
| `/api/workspaces/:id/git/diff` | GET | Git diff（支持 `?path=` 参数） |
| `/api/workspaces/:id/git/log` | GET | Git 日志 |
| `/api/workspaces/:id/notifications/start` | POST | 启动通知服务（飞书/企微） |
| `/api/workspaces/:id/notifications/stop` | POST | 停止通知服务 |
| `/api/workspaces/:id/notifications/test` | POST | 发送测试通知 |
| `/api/workspaces/:id/notifications/wechat/qr` | POST | 获取/轮询企微登录二维码 |
| `/api/agents/usage/dashboard` | GET | Agent 用量 Dashboard（`?days=30`） |
| `/api/models` | GET/POST | 列出/创建 LLM 模型 |
| `/api/models/:id` | PUT/DELETE | 更新/删除 LLM 模型 |
| `/api/providers` | GET/POST | 列出/创建 LLM 供应商 |
| `/api/providers/:id` | PUT/DELETE | 更新/删除 LLM 供应商 |
| `/api/folder/browse` | GET | 文件夹浏览器（目录列表 + 父目录） |
| `/api/folder/create` | POST | 创建目录 |

### WebSocket 事件

连接地址：`ws://localhost:3100/ws?workspaceId=<id>&token=<token>`

**客户端 -> 服务端事件**（9 个）：
- `terminal.create` / `terminal.input` / `terminal.resize` / `terminal.close`
- `channel.message`（支持 mentions 字段触发 @agent）
- `channel.stop`（停止频道所有活跃 Agent 运行）
- `channel.answer_question`（回答 Agent 提问，触发断点续跑）
- `agent.start` / `agent.stop`

**服务端 -> 客户端事件**（20 个）：
- `connected` -- 连接确认
- `terminal.created` / `terminal.output` / `terminal.closed`
- `channel.message` / `channel.message.updated` / `channel.message.deleted` / `channel.messages.cleared` / `channel.updated`
- `agent.started` / `agent.status_changed` / `agent.output` / `agent.completed` / `agent.error`
- `issue.created` / `issue.updated` / `issue.status_changed`
- `task.created` / `task.updated` / `task.status_changed` / `task.output`

### Agent 运行时架构

支持三种运行时，通过 `createAgentRuntime(config)` 工厂函数按 `config.kind` 切换：

| 运行时 | kind 值 | SDK | 说明 |
|--------|---------|-----|------|
| `OpenAgentSdkRuntime` | `open-agent-sdk`（默认） | `@codeany/open-agent-sdk` | 进程内 Agent 循环，支持多 API 类型 |
| `ClaudeCodeRuntime` | `claude-code` | `@anthropic-ai/claude-agent-sdk` | 使用 Claude Code 运行时，支持文件创建/编辑，内置 Anthropic Bridge（7 文件子模块） |
| `CodexRuntime` | `codex` | `@openai/codex-sdk` | 使用 OpenAI Codex CLI，支持沙箱/技能/MCP |

**ClaudeCodeRuntime 子模块结构**（`adapters/claude-code-runtime/`）：

| 文件 | 职责 |
|------|------|
| `index.ts` | ClaudeCodeRuntime 主类，execute/stop 实现，SDK query() 事件循环 |
| `sdk-config.ts` | SDK 配置构建（env/权限模式/MCP/技能/configDir/可执行文件路径） |
| `adapter-pool.ts` | Bridge 引用计数式复用池，相同配置共享服务器实例 |
| `anthropic-bridge.ts` | HTTP Bridge 服务器，请求/响应管道 |
| `protocol-converter.ts` | Anthropic <-> OpenAI 协议转换（请求+响应双向） |
| `message-format.ts` | SDK 消息格式化与事件提取（thinking/tool_use/tool_result/usage） |
| `types.ts` | 类型定义（AnthropicRequest/OpenAIChatBody/ResponsesBody/BridgeConfig） |

### Anthropic Bridge

ClaudeCodeRuntime 内置本地 HTTP 反向代理，解决 Claude Agent SDK 只发送 Anthropic Messages 格式的问题。

**架构**：
- 引用计数式 Bridge 复用：相同配置的 Bridge 服务器只创建一个实例，端口从 3080 起分配
- `startClaudeAdapterIfNeeded()` -> `createAnthropicBridgeServer()` -> `handleAnthropicBridgeRequest()`
- `execute()` 完成后通过 `release()` 减引用，最后一个引用释放时关闭服务器

**支持两种模式**：
- `openai-chat-completions-to-anthropic-messages`：Anthropic <-> OpenAI Chat Completions
- `openai-responses-to-anthropic-messages`：Anthropic <-> OpenAI Responses API

详见 `docs/anthropic-bridge.md`。

### 认证系统

- **Secret Key 存储**：`~/.agent-spaces-data/auth.json`
- **中间件**：`middleware/auth.ts`，保护除 `/api/health`、`/api/auth/login`、`/api/auth/check` 外的所有路由
- **WebSocket 认证**：连接时通过 `token` 查询参数验证
- **Token 管理**：支持修改 Secret Key（需当前 Token 验证）

### 通知中心 (Notification Hub)

`services/notification-hub/` 子目录（12 个文件）实现完整的外部通知系统：

| 文件 | 职责 |
|------|------|
| `index.ts` | 公开 API 重导出 |
| `types.ts` | 类型定义、常量、共享状态（adapter Map、去重 Map） |
| `service.ts` | 服务生命周期管理（start/stop/persist/restore） |
| `events.ts` | 内部 WS 事件 -> 外部通知信封映射 |
| `format.ts` | Lark/WeChat 消息格式化 |
| `helpers.ts` | 持久化辅助、判断函数 |
| `lark-api.ts` | Lark 消息去重、文本解析 |
| `lark-adapter.ts` | LarkNotificationAdapter（飞书长连接 WebSocket） |
| `wechat-api.ts` | WeChat HTTP API（QR Code 登录 + 长轮询消息 + 发送） |
| `wechat-adapter.ts` | WeChatNotificationAdapter（企微长轮询） |
| `bot-agent.ts` | Bot Agent 执行与上下文构建 |
| `bot-commands.ts` | 16 个内置斜杠命令（workspace/issue/task/comment/git 操作等） |

**BotAdapter 接口**：
```ts
interface BotAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(envelope: BroadcastEnvelope): Promise<void>;
  hasRecipients(): boolean;
}
```

**内置命令列表**：`/workspace`、`/workspaces`、`/workspac [id]`、`/agents`、`/issues`、`/issue [id]`、`/issue new [title] [desc]`、`/issue start`、`/issue close`、`/issue [id] agent ids`、`/task`、`/comment [msg]`、`/comments`、`/changes`、`/commit [desc/auto]`、`/push`、`/pull`、`/help`

详见 `docs/bot-notification-workflow.md`。

### Agent 编排流程

```
Scheduler (定时 tick)
  -> 发现 draft/changes_requested Issue -> 唤醒 Planner
    -> Planner: ViewCurrentChannelIssue + 分析 -> Task Creator
      -> Task Creator: ViewCurrentChannelIssue + ReplaceIssueTasks -> 依赖调度
        -> Executor(s): ViewCurrentChannelIssue + 执行 -> Hook 触发 Reviewer
          -> Reviewer: ViewCurrentChannelIssue + 审核 -> 依赖调度
            -> 所有 Task done -> Issue completed
            -> Commit Agent: 收集 diff -> 自动生成 conventional commit message

频道 @mention 触发（runMentionedAgent 深度流程，`handler.ts` L205-540）:
  -> 6 阶段执行 + 消息 Parts 构建管线
  -> 支持 AskUserQuestion 阻塞等待用户回答
  -> 支持 TodoWrite 同步到 Channel

Issue 自动化入口重构:
  issue-agent-runner.ts: runIssueAutomation() + shouldForcePlannerFromMentions()
  issue-retry.ts: recoverRunningWorkOnStartup()（启动时恢复未完成的 Issue）
```

### Function Call 工具层

服务器端 function-call 工具抽象，定义在 `AgentFunctionTool` 接口：
- `CreateCurrentChannelIssue`：为当前频道创建并绑定 Issue
- `ViewCurrentChannelIssue`：查看当前 Issue + 评论 + 任务 + 成员 + 可分配 Agent
- `AddCurrentChannelComment`：为当前 Issue 添加评论

详见 `docs/function-call-tools.md`。

### Agent Preset 系统

- **全局模板**：存储在 `~/.agent-spaces-data/agent-templates/{agentId}/`
- **工作空间预设**：存储在 `workspace.agents` 数组 + `{agentspaceDir}/agents/{agentId}/`
- **连接测试**：支持 anthropic-messages / openai-chat-completions / openai-responses / openai-responses-to-anthropic-messages / openai-chat-completions-to-anthropic-messages / gemini-generate-content
- **技能系统**：Markdown 文件存储在 `skills/` 目录，运行时可通过 `allowedTools` 映射 MCP 工具
- **头像**：通过 `POST /api/upload/avatar` 上传 base64 图片
- **角色类型**：scheduler / planner / executor / reviewer / commit / custom / bot

### 用量统计与计费

- **存储**：SQLite（`~/.agent-spaces-data/agents/agents.sqlite`），两张表：`agent_sessions` + `agent_usage`
- **记录时机**：所有 Agent 完成路径（聊天 @agent / issue planner / executor / reviewer / commit agent / bot agent）
- **费用来源优先级**：1) runtime 提供的原始 costUsd；2) LLMModel.cost 配置；3) 内置模型族估算表；4) 默认估算值
- **API**：`GET /api/agents/usage/dashboard?days=30` 返回 Dashboard 聚合数据
- **Token 提取**：优先使用结构化 usage，回退到输出文本解析

详见 `docs/model-usage-accounting.md`。

## 关键依赖与配置

### 运行时依赖

| 依赖 | 用途 |
|------|------|
| `express` (v5) | HTTP 服务与路由 |
| `ws` | WebSocket 服务 |
| `node-pty` | PTY 终端管理 |
| `simple-git` | Git 操作封装 |
| `uuid` | ID 生成 |
| `cors` | 跨域支持 |
| `dotenv` | 环境变量加载 |
| `node:sqlite` (DatabaseSync) | Agent Usage SQLite 存储（Node.js 内置） |
| `@codeany/open-agent-sdk` | Agent 运行时 SDK（进程内执行） |
| `@anthropic-ai/claude-agent-sdk` | Claude Code Agent 运行时 SDK |
| `@openai/codex-sdk` | Codex Agent 运行时 SDK |
| `@larksuiteoapi/node-sdk` | 飞书 Bot SDK（长连接 + 消息收发） |
| `@agent-spaces/shared` | 共享类型（workspace:* 引用） |

### 开发依赖

| 依赖 | 用途 |
|------|------|
| `tsx` | TypeScript 直接运行 + watch |
| `typescript` | 编译 |

### 重要配置

- `"type": "module"` -- 使用 ESM 模块系统
- `postinstall` 脚本自动编译 node-pty native 模块
- JSON body 限制 50MB（支持大文件写入）
- 静态文件服务：`/public` 目录（含头像 `/public/avatars/` 和 provider 图标 `/public/provider-icons/`）

## 数据模型

### 持久化结构

数据存储在 `AGENT_SPACES_DATA_DIR` 目录下，使用 JSON 文件 + SQLite：

```
~/.agent-spaces-data/
  auth.json                         # Secret Key 认证信息
  agents/
    agents.sqlite                   # Agent Session + Usage（SQLite）
  workspaces/
    index.json                      # 所有 Workspace 列表
    {workspaceId}/
      workspace.json                # Workspace 详情（含 notificationSettings）
      prompt.md                     # 工作空间 Prompt（Markdown）
      channels/
        index.json                  # 频道列表
        {channelId}/
          messages.json             # 频道消息
          tool-details.json         # 工具调用详情（懒加载）
      issues/
        index.json                  # 议题列表
        {issueId}.json              # 议题详情
        {issueId}.comments.json     # 议题评论
      tasks/
        index.json                  # 任务列表
        {taskId}.json               # 任务详情
  agent-templates/
    {agentId}/
      agent.json                    # Agent 预设模板
      mcp.json                      # MCP 配置
      skills/
        *.md                        # 技能文件
  llm/
    models.json                     # LLM 模型列表（含 cost 配置）
    providers.json                  # LLM 供应商列表
```

### .agentspace 目录（项目目录内）

创建 Workspace 时自动在 `boundDirs[0]` 下生成：

```
.agentspace/
  claude.md                       # 知识库
  skills/                         # 技能库（全局 + Agent 专属）
  agents/                         # Agent 配置与工作目录
    {agentId}/
      agent.json                  # 工作空间级 Agent 配置
      mcp.json                    # MCP 配置
      skills/
        *.md                      # Agent 专属技能
      .codex/                     # Codex 运行时临时配置目录（自动生成）
        skills/{name}/SKILL.md    # 转换后的 Codex 技能
  tasks/                          # 任务管理
  cache/                          # 缓存
  cache/locks/                    # 锁文件
  logs/                           # 执行记录
```

## 代码结构

```
packages/server/src/
  app.ts                          # Express 入口，路由注册，WebSocket 服务，头像上传，认证中间件，启动恢复
  middleware/
    auth.ts                       # Bearer Token 认证中间件
  routes/
    auth.ts                       # 认证路由（login/check/change-secret）
    workspace.ts                  # Workspace CRUD + Prompt + Clone + Reveal + 通知管理 + 企微二维码
    file.ts                       # 文件系统路由
    folder.ts                     # 文件夹浏览器路由（browse + create）
    channel.ts                    # 频道与消息路由
    issue.ts                      # 议题路由
    task.ts                       # 任务路由
    agent.ts                      # Agent 会话 + Preset CRUD + 连接测试 + Usage Dashboard
    git.ts                        # Git 操作路由
    llm.ts                        # LLM 模型与供应商 CRUD 路由
  services/
    workspace.ts                  # Workspace 服务（含 .agentspace 初始化）
    workspace-prompt.ts           # 工作空间 Prompt 读写服务（Markdown）
    file.ts                       # 文件读写服务
    channel.ts                    # 频道服务
    message.ts                    # 消息服务（游标分页）
    issue.ts                      # 议题服务
    issue-comment.ts              # 议题评论 CRUD 服务
    issue-retry.ts                # Issue 启动恢复（recoverRunningWorkOnStartup）
    task.ts                       # 任务服务
    agent.ts                      # Agent 会话服务 + Preset 管理 + 连接测试 + 模板管理 + Usage Dashboard
    auth-store.ts                 # Secret Key 认证存储（auth.json）
    builtin-tools.ts              # 内置 Function Call 工具（CreateCurrentChannelIssue/ViewCurrentChannelIssue/AddCurrentChannelComment）
    tool-detail.ts                # 工具调用详情持久化（懒加载）
    llm-model-config.ts           # LLM 模型配置读取（思考模式）
    pty.ts                        # PTY 终端会话管理
    notification-hub/             # 通知中心子目录（12 文件）
      index.ts                    # 公开 API 重导出
      types.ts                    # 类型定义、常量、共享状态
      service.ts                  # 服务生命周期管理
      events.ts                   # WS 事件 -> 通知信封映射
      format.ts                   # 消息格式化
      helpers.ts                  # 持久化辅助函数
      lark-api.ts                 # Lark 消息去重、解析
      lark-adapter.ts             # LarkNotificationAdapter
      wechat-api.ts               # WeChat HTTP API + QR Code 登录
      wechat-adapter.ts           # WeChatNotificationAdapter
      bot-agent.ts                # Bot Agent 执行与上下文构建
      bot-commands.ts             # 16 个内置斜杠命令
  storage/
    json-store.ts                 # JSON 文件读写通用工具
    workspace-store.ts            # Workspace 持久化
    issue-store.ts                # Issue 持久化
    task-store.ts                 # Task 持久化
    agent-store.ts                # Agent Session + Usage SQLite 持久化（含费用估算）
    llm-store.ts                  # LLM 模型与供应商持久化
    usage.ts                      # Token usage 输出文本解析
  adapters/
    git.ts                        # simple-git 封装（status, diff, log, clone, commit, push, pull）
    agent-runtime.ts              # Agent 运行时工厂（按 kind 创建运行时，3 种）
    agent-runtime-types.ts        # Agent 运行时接口定义（AgentRuntime, AgentRunResult, AgentRuntimeEvent, AgentFunctionTool, AgentRuntimeKind）
    open-agent-sdk-runtime.ts     # @codeany/open-agent-sdk 运行时实现
    codex-runtime.ts              # @openai/codex-sdk 运行时实现（Codex CLI 包装）
    claude-code-runtime/          # ClaudeCodeRuntime 子模块（7 文件）
      index.ts                    # ClaudeCodeRuntime 主类
      sdk-config.ts               # SDK 配置构建
      adapter-pool.ts             # Bridge 引用计数式复用池
      anthropic-bridge.ts         # HTTP Bridge 服务器
      protocol-converter.ts       # Anthropic <-> OpenAI 协议转换
      message-format.ts           # SDK 消息格式化与事件提取
      types.ts                    # Bridge 类型定义
  agents/
    agent-context.ts              # Agent 上下文接口（broadcast, getSession, updateSessionStatus）
    scheduler-agent.ts            # 调度者（定时 tick 发现 draft/changes_requested Issue）
    planner-agent.ts              # 策划者（分析 Issue + 调用 Task Creator）
    issue-task-controller.ts      # 任务控制器（Task Creator + 依赖调度 + Executor 启动）
    issue-agent-runner.ts         # Issue 自动化入口（runIssueAutomation + shouldForcePlanner + hasActiveIssueAutomation）
    issue-agent-progress.ts       # Agent 进度管理（创建/更新 channel message + issue comment）
    agent-message-parts.ts        # 结构化消息 Parts 构建（chain/tool-detail/usage/text 解析）
    reviewer-agent.ts             # 审核者（审核执行结果）
    commit-agent.ts               # 提交者（自动生成 conventional commit message）
  ws/
    handler.ts                    # WebSocket 事件路由中心（1342 行）+ @mention 触发 Agent + 实时消息 Parts 构建
    terminal-handler.ts           # 终端事件处理
    connection-manager.ts         # WebSocket 连接管理 + 广播
  hooks/
    agent-hooks.ts                # Agent Hook 链（executor 完成 -> reviewer）
  types/
    node-sqlite.d.ts              # node:sqlite 类型声明
```

## 测试与质量

当前无自动化测试。通过 TypeScript 编译和手动 API 测试验证。

## 常见问题 (FAQ)

- **Q: node-pty 编译失败？** A: 运行 `npx node-gyp rebuild --directory=node_modules/node-pty`，需要 Xcode Command Line Tools。
- **Q: 数据存在哪里？** A: 默认 `~/.agent-spaces-data/`，Agent Session/Usage 使用 SQLite（`agents/agents.sqlite`），其余为 JSON 文件。
- **Q: 如何选择 Agent 运行时？** A: 在 Agent Preset 中设置 `runtimeKind`：`open-agent-sdk`（默认）、`claude-code` 或 `codex`。
- **Q: Codex 运行时有什么限制？** A: 详见 `docs/codex-runtime-limitations.md`，主要涉及 maxTurns 不对等、Skills 格式转换、MCP 配置差异等。
- **Q: Anthropic Bridge 是什么？** A: ClaudeCodeRuntime 内置的协议中转层，让 Claude Code SDK 调用 OpenAI Chat/Responses API，详见 `docs/anthropic-bridge.md`。
- **Q: 工具详情如何持久化？** A: 保存到 `tool-details.json`，前端通过 `GET /api/workspaces/:id/channels/:channelId/messages/:messageId/tool-details/:detailId` 懒加载。
- **Q: Agent 连接测试支持哪些供应商？** A: anthropic-messages、openai-chat-completions、openai-responses、openai-responses-to-anthropic-messages、openai-chat-completions-to-anthropic-messages、gemini-generate-content。
- **Q: 如何配置通知？** A: 在项目设置面板中启用通知，选择平台（飞书/企微），配置凭证，选择通知事件和 Bot Agent。
- **Q: 如何添加新的通知平台？** A: 实现 `BotAdapter` 接口，在 `service.ts` 中分发，详见 `docs/bot-notification-workflow.md`。
- **Q: 费用如何计算？** A: 优先使用 runtime 提供的原始 costUsd，否则按 LLMModel.cost 配置计算，详见 `docs/model-usage-accounting.md`。
- **Q: ClaudeCodeRuntime 为什么拆分为 7 个文件？** A: 原 `claude-code-runtime.ts`（1231 行）拆分后职责更清晰：主类/SDK 配置/Bridge 池/HTTP Bridge/协议转换/消息格式化/类型定义。
- **Q: 认证 Secret Key 在哪设置？** A: 首次访问登录页时输入，存储在 `~/.agent-spaces-data/auth.json`。默认为空字符串（无需认证）。

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-05T23:52:43+08:00 | 增量更新 | 认证系统（auth-store + middleware/auth + routes/auth）、通知中心 12 文件（Lark/WeChat 双适配器 + Bot Agent + 16 命令）、Commit Agent（自动 conventional commit）、Issue Runner 重构（issue-agent-runner + issue-retry 启动恢复）、ClaudeCodeRuntime 拆分为 7 文件子模块、SQLite Agent Usage（agent-store 重写为 SQLite，含费用估算 + Dashboard API）、新增 workspace-store/workspace-prompt/llm-model-config/usage/agent-store（SQLite）/folder 路由/git clone SSE/git commit+push+pull/notifications API/wechat QR/prompt API/usage dashboard API、新增依赖 @larksuiteoapi/node-sdk + node:sqlite |
| 2026-05-04T21:04:42+08:00 | 增量更新+补扫 | 三运行时、Anthropic Bridge、runMentionedAgent 深度流程、Issue 自动化编排链路重构、Function Call Tools、工具详情持久化、头像上传 API |
| 2026-05-02T23:43:41 | 增量更新 | 补充双运行时架构、Agent Preset 系统、LLM 管理、API 路由全量更新 |
| 2026-05-02T01:07:33 | 初始化 | init-architect 首次扫描生成 |
