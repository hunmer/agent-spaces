# 对外接口

## Web 页面路由

| 路由 | 用途 |
|---|---|
| `/` | 首页（工作区列表/仪表盘） |
| `/login` | 登录页 |
| `/chat` | 聊天界面 |
| `/workspace/:id` | 工作区详情 |
| `/workspaces` | 工作区列表 |
| `/workflows` | 工作流列表 |
| `/workflows/:id` | 工作流编辑器 |
| `/workflows/share` | 工作流分享 |
| `/mini-apps` | Mini Apps 列表 |
| `/mini-apps/:id` | Mini App 详情 |
| `/mini-apps-preview/:id` | Mini App 预览 |
| `/settings` | 设置主页 |
| `/settings/agents` | Agent 配置 |
| `/settings/providers` | LLM 提供商 |
| `/settings/mcps` | MCP 服务器 |
| `/settings/skills` | 技能管理 |
| `/settings/tools` | 工具管理 |
| `/settings/prompts` | Prompt 模板 |
| `/settings/output-styles` | 输出样式 |
| `/settings/data-files` | 数据文件 |
| `/settings/models` | 模型管理 |

## Server REST API

所有 API 路由前缀 `/api/`，以下为主要路由模块：

| 路由前缀 | 职责 |
|---|---|
| `/api/auth` | 认证（登录/Token） |
| `/api/workspaces` | 工作区 CRUD |
| `/api/workspaces/:id/files` | 文件管理 |
| `/api/workspaces/:id/channels` | 频道管理 |
| `/api/workspaces/:id/issues` | Issue 管理 |
| `/api/workspaces/:id/commands` | 命令管理 |
| `/api/workspaces/:id/agents` | Agent 管理 |
| `/api/workspaces/:id/tasks` | 任务管理 |
| `/api/workspaces/:id/git` | Git 操作 |
| `/api/workspaces/:id/search` | 全文搜索 |
| `/api/workspaces/:id/knowledge-bases` | 知识库 |
| `/api/workspaces/:id/worktrees` | Worktree |
| `/api/workspaces/:id/notifications` | 通知 |
| `/api/workspaces/:id/hooks` | Webhook/Hook |
| `/api/workspaces/:id/code-favorites` | 代码收藏 |
| `/api/workflows` | Workflow CRUD + 执行 + Hook |
| `/api/plugins` | 插件管理 |
| `/api/mini-apps` | Mini App 管理 |
| `/api/runtime` | 运行时发现/安装/更新（CLI/SDK） |
| `/api/sqlite` | SQLite 查询 |
| `/api/agent-sse` | Agent SSE 流 |
| `/api/agents` | Agent 模板 |
| `/api/chat` | 聊天会话 |
| `/api/skills` | 技能 |
| `/api/prompt-templates` | Prompt 模板 |
| `/api/output-styles` | 输出样式 |
| `/api/mcps` | MCP 服务器 |
| `/api/npm-settings` | NPM 配置 |
| `/api/subscriptions` | 订阅管理 |
| `/api/speech-recognition` | 语音识别 |
| `/api/agent-commands` | Agent 命令 |
| `/api/robot-accounts` | 机器人账号 |
| `/api/import` | 数据导入 |
| `/api/data` | 数据管理 |
| `/api/upload` | 文件上传 |
| `/api/fonts` | 字体管理 |
| `/api/health` | 健康检查 |
| `/api/inspector/track` | Inspector 跳转（无认证） |
| `/api/skyoffice/rooms` | SkyOffice 房间 CRUD（自管 per-room token，**在主 authMiddleware 之前挂载**，绕开主全局 Bearer） |
| `/api/skyoffice/map` | SkyOffice 地图数据（chairs 等） |
| `/skyoffice/colyseus` | Colyseus monitor（**无鉴权，生产需加防护**） |

## WebSocket 端点

| 路径 | 用途 |
|---|---|
| `/ws` | 主 WebSocket（聊天/终端/Agent 执行流），需 workspaceId + token |
| `/ws/speech` | 语音识别流，需 token + configId |
| `/ws/lsp/typescript` | TypeScript LSP 代理，需 workspaceId + token |
| `/agent-ws` | SkyOffice Agent 广播 WS（`?roomId=...&token=...`，由 `broadcastServer` 处理 + per-room token 鉴权） |
| `/<colyseusRoomId>` | SkyOffice Colyseus 房间 Viewer 连接（无 token，仅需 roomId） |

## SDK 接口

`createSDK()` 返回 35+ API 模块，主要模块：

```typescript
sdk.workspace.list() / .get(id) / .create() / .update()
sdk.agent.list() / .get(id) / .create() / .update()
sdk.chat.sessions() / .messages() / .send()
sdk.workflow.list() / .get(id) / .execute()
sdk.git.status(wsId) / .commit() / .diff()
sdk.llm.providers / .models / .chat()
// ... 等 35+ 模块
```
