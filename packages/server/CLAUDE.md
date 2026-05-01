[根目录](../../CLAUDE.md) > [packages](../) > **server**

# @agent-spaces/server

## 模块职责

Express 5 后端服务，提供 REST API、WebSocket 实时通信、Agent 编排引擎、PTY 终端管理、文件系统操作和 Git 操作能力。作为整个平台的核心运行时，管理 Workspace 生命周期、Issue/Task 状态机、Agent 会话调度和数据持久化。

## 入口与启动

- **入口文件**：`src/app.ts`
- **启动命令**：`pnpm dev`（tsx watch 热重载）或 `pnpm start`（编译后运行）
- **默认端口**：`3100`（可通过 `PORT` 环境变量修改）
- **数据目录**：`~/.agent-spaces-data`（可通过 `AGENT_SPACES_DATA_DIR` 修改）

## 对外接口

### REST API 路由表

所有路由挂载在 `/api/workspaces/:id/` 下（workspace 相关路由除外）：

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/workspaces` | GET/POST | 列出/创建工作空间 |
| `/api/workspaces/:id` | GET/PUT/DELETE | 获取/更新/删除工作空间 |
| `/api/workspaces/:id/files/tree` | GET | 获取文件树（支持 `?path=` 参数） |
| `/api/workspaces/:id/files/content` | GET/PUT | 读取/写入文件内容 |
| `/api/workspaces/:id/channels` | GET/POST | 列出/创建频道 |
| `/api/workspaces/:id/channels/:channelId/messages` | GET/POST | 获取/发送消息 |
| `/api/workspaces/:id/issues` | GET/POST | 列出/创建议题 |
| `/api/workspaces/:id/issues/:issueId` | GET/PUT | 获取/更新议题 |
| `/api/workspaces/:id/issues/:issueId/start` | POST | 启动议题（draft -> planned） |
| `/api/workspaces/:id/agents` | GET | 列出 Agent 会话 |
| `/api/workspaces/:id/agents/start` | POST | 启动 Agent 会话 |
| `/api/workspaces/:id/agents/:agentId/stop` | POST | 停止 Agent 会话 |
| `/api/workspaces/:id/tasks` | GET | 列出任务（支持 `?issueId=` 过滤） |
| `/api/workspaces/:id/tasks/:taskId` | GET | 获取任务 |
| `/api/workspaces/:id/tasks/:taskId/retry` | POST | 重试任务 |
| `/api/workspaces/:id/tasks/:taskId/cancel` | POST | 取消任务 |
| `/api/workspaces/:id/git/status` | GET | Git 状态 |
| `/api/workspaces/:id/git/diff` | GET | Git diff（支持 `?path=` 参数） |
| `/api/workspaces/:id/git/log` | GET | Git 日志 |

### WebSocket 事件

连接地址：`ws://localhost:3100/ws?workspaceId=<id>`

**客户端 -> 服务端事件**（5 个）：
- `terminal.create` / `terminal.input` / `terminal.resize` / `terminal.close`
- `channel.message` / `agent.start` / `agent.stop`

**服务端 -> 客户端事件**（16 个）：
- `connected` -- 连接确认
- `terminal.created` / `terminal.output` / `terminal.closed`
- `channel.message` / `channel.updated`
- `agent.started` / `agent.status_changed` / `agent.output` / `agent.completed` / `agent.error`
- `issue.created` / `issue.updated` / `issue.status_changed`
- `task.created` / `task.updated` / `task.status_changed` / `task.output`

### Agent 编排流程

```
Scheduler (10s 轮询)
  -> 发现未完成 Issue -> 唤醒 Planner
  -> Planner: Issue -> 分解 Task -> 分配 Executor
    -> Executor: mock 执行 -> Hook 触发 Reviewer
      -> Reviewer: mock 审核 -> approve/changes_requested
        -> 更新 Issue 状态
```

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

## 数据模型

### 持久化结构

数据存储在 `AGENT_SPACES_DATA_DIR` 目录下，全部使用 JSON 文件：

```
~/.agent-spaces-data/
  workspaces/
    index.json                    # 所有 Workspace 列表
    {workspaceId}/
      workspace.json              # Workspace 详情
      channels/
        index.json                # 频道列表
        {channelId}/
          messages.json           # 频道消息
      issues/
        index.json                # 议题列表
        {issueId}.json            # 议题详情
      tasks/
        index.json                # 任务列表
        {taskId}.json             # 任务详情
      agents/
        index.json                # Agent 会话列表
        {sessionId}.json          # Agent 会话详情
```

### .agentspace 目录（项目目录内）

创建 Workspace 时自动在 `boundDirs[0]` 下生成：

```
.agentspace/
  claude.md                       # 知识库
  skills/                         # 技能库
  agents/                         # Agent 配置
  tasks/                          # 任务管理
  cache/                          # 缓存
  cache/locks/                    # 锁文件
  logs/                           # 执行记录
```

## 代码结构

```
packages/server/src/
  app.ts                          # Express 入口，路由注册，WebSocket 服务
  routes/
    workspace.ts                  # Workspace CRUD 路由
    file.ts                       # 文件系统路由
    channel.ts                    # 频道与消息路由
    issue.ts                      # 议题路由
    task.ts                       # 任务路由
    agent.ts                      # Agent 会话路由
    git.ts                        # Git 操作路由
  services/
    workspace.ts                  # Workspace 服务（含 .agentspace 初始化）
    file.ts                       # 文件读写服务
    channel.ts                    # 频道服务
    message.ts                    # 消息服务（游标分页）
    issue.ts                      # 议题服务
    task.ts                       # 任务服务
    agent.ts                      # Agent 会话服务
    pty.ts                        # PTY 终端会话管理
  storage/
    json-store.ts                 # JSON 文件读写通用工具
    workspace-store.ts            # Workspace 持久化
    issue-store.ts                # Issue 持久化
    task-store.ts                 # Task 持久化
    agent-store.ts                # AgentSession 持久化
  adapters/
    git.ts                        # simple-git 封装（status, diff, log）
    agent-runtime.ts              # Agent 运行时适配器（Mock 实现）
  agents/
    agent-context.ts              # Agent 上下文接口
    scheduler-agent.ts            # 调度者（10s 轮询）
    planner-agent.ts              # 策划者（分解任务 + 启动执行者）
    reviewer-agent.ts             # 审核者（审核执行结果）
  ws/
    handler.ts                    # WebSocket 事件路由
    terminal-handler.ts           # 终端事件处理
    connection-manager.ts         # WebSocket 连接管理 + 广播
  hooks/
    agent-hooks.ts                # Agent Hook 链（执行者完成 -> 审核者）
```

## 测试与质量

当前无自动化测试。通过 TypeScript 编译和手动 API 测试验证。

## 常见问题 (FAQ)

- **Q: node-pty 编译失败？** A: 运行 `npx node-gyp rebuild --directory=node_modules/node-pty`，需要 Xcode Command Line Tools。
- **Q: 数据存在哪里？** A: 默认 `~/.agent-spaces-data/`，可通过环境变量修改。
- **Q: Agent 运行时是真实的吗？** A: 当前为 `MockAgentRuntime`，返回确定性模拟结果。设计为可替换为真实 SDK 实现。

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-02T01:07:33 | 初始化 | init-architect 首次扫描生成 |
