# 公共接口

## REST API（server）

所有路由挂载在 `/api/` 下，除健康检查/认证/Inspector/版本端点外均需 Bearer Token 认证。

### 免认证端点

- `GET /api/health` -- 健康检查
- `POST /api/auth/login` -- 认证登录
- `GET /api/auth/check` -- 检查认证状态
- `POST /api/inspector/track` -- DOM Inspector 源码定位
- `GET /api/version` / `GET /api/version/check` -- 版本信息

### 核心资源路由

- `/api/workspaces` -- 工作空间 CRUD + Prompt + Clone + 通知管理
- `/api/workspaces/:id/channels` -- 频道与消息
- `/api/workspaces/:id/issues` -- 议题管理（含 workflowId）
- `/api/workspaces/:id/tasks` -- 任务管理
- `/api/workspaces/:id/agents` -- Agent 会话 + 预设
- `/api/workspaces/:id/git/*` -- Git 操作（status/diff/log/commit/push/pull/高级操作）
- `/api/workspaces/:id/commands` -- 快捷命令 CRUD + run/stop
- `/api/workspaces/:id/databases` -- 文档数据库 + 向量搜索
- `/api/workspaces/:id/kanban` -- Kanban 看板
- `/api/workspaces/:id/worktrees` -- Worktree 并行开发
- `/api/workspaces/:id/code-favorites` -- 代码收藏
- `/api/workspaces/:id/hooks` -- Hook 配置
- `/api/workspaces/:id/notifications` -- 应用内通知
- `/api/workspaces/:id/search` -- 代码搜索
- `/api/workflows` -- Workflow 模板 CRUD + 触发
- `/api/models` / `/api/providers` -- LLM 模型与供应商管理
- `/api/chat/agents` -- Chat Agent CRUD + SSE 流式执行
- `/api/plugins` -- Plugin 插件管理
- `/api/agent-sse/run` -- Agent SSE 流式调用（外部集成）
- `/api/agents/usage/dashboard` -- Agent 用量 Dashboard

### WebSocket 端点

| 端点 | 说明 |
|------|------|
| `/ws?workspaceId=<id>&token=<token>` | 主 WebSocket 连接 |
| `/ws/speech?token=<token>&configId=<id>` | 语音识别流式 WebSocket |
| `/ws/lsp/typescript?workspaceId=<id>&token=<token>` | TypeScript LSP |

### WebSocket 事件（客户端 -> 服务端）

`terminal.create` / `terminal.input` / `terminal.resize` / `terminal.close` / `channel.message` / `channel.stop` / `channel.answer_question` / `agent.start` / `agent.stop` / `chat.message` / `chat.stop`

### WebSocket 事件（服务端 -> 客户端）

`connected` / `terminal.*` / `channel.*` / `agent.*` / `issue.*` / `task.*` / `workflow.*` / `command.*` / `notification.*` / `inspector.jump` / `chat.*`

## 前端页面路由

| 路由 | 说明 |
|------|------|
| `/login` | 登录页 |
| `/` | 首页（Dashboard + 订阅面板） |
| `/workspaces` | 工作空间列表 |
| `/workflows` | Workflow 模板管理 |
| `/workflows/[id]` | Workflow 编辑器 |
| `/workflows/share` | Workflow 分享页 |
| `/workspace/[id]` | 工作空间 IDE 页 |
| `/chat` | Chat 独立对话页 |
| `/settings/*` | 设置页（agents/skills/mcps/models/providers/prompts/output-styles/tools） |
| `/mini-apps` | Workflow UI 模板管理 |
| `/mini-apps/[id]` | Workflow UI 编辑器 |

## SDK（packages/sdk）

39 个 API 模块适配器，通过 `createSDK()` 工厂创建。HttpClient 自动注入 Bearer Token，401/403 触发 `onUnauthorized` 回调。
