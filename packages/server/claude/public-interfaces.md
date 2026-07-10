# Server 模块 — 对外接口

## REST API 路由

所有路由前缀 `/api/`，在 `src/app.ts` 中注册。

### 无认证端点

| 端点 | 说明 |
|---|---|
| `GET /api/health` | 健康检查 |
| `POST /api/inspector/track` | Inspector 跳转（接收 path/line/column） |
| `POST /api/agent-sse/*` | Agent SSE 流 |

### 需认证端点（auth 中间件后）

| 路由模块 | 挂载路径 | 路由文件 |
|---|---|---|
| Workspace | `/api/workspaces` | `routes/workspace.ts` |
| File | `/api/workspaces/:id/files` | `routes/file.ts` |
| Channel | `/api/workspaces/:id/channels` | `routes/channel.ts` |
| Issue | `/api/workspaces/:id/issues` | `routes/issue.ts` |
| Command | `/api/workspaces/:id/commands` | `routes/command.ts` |
| Agent | `/api/workspaces/:id/agents`, `/api/agents`（含 `GET /api/agents/sessions/:agentSessionId/detail` 会话详情下钻） | `routes/agent.ts` |
| Task | `/api/workspaces/:id/tasks` | `routes/task.ts` |
| Git | `/api/workspaces/:id/git` | `routes/git.ts` |
| Search | `/api/workspaces/:id/search` | `routes/search.ts` |
| Knowledge Base | `/api/workspaces/:id/knowledge-bases` | `routes/knowledge-base.ts` |
| Worktree | `/api/workspaces/:id/worktrees` | `routes/worktree.ts` |
| Notification | `/api/workspaces/:id/notifications` | `routes/notification.ts` |
| Hook | `/api/workspaces/:id/hooks` | `routes/hooks.ts` |
| Code Favorites | `/api/workspaces/:id/code-favorites` | `routes/code-favorites.ts` |
| Workflow | `/api/workflows` | `routes/workflow.ts` |
| Plugin | `/api/plugins` | `routes/plugin.ts` |
| Mini App | `/api/mini-apps` | `routes/mini-apps.ts` |
| Runtime | `/api/runtime`（discover-cli / install-cli / check-sdk-updates） | `routes/runtime.ts` |
| SQLite | `/api/sqlite` | `routes/sqlite.ts` |
| LLM | `/api/` (多个子路由) | `routes/llm.ts` |
| Auth | `/api/auth` | `routes/auth.ts` |
| Skill | `/api/skills` | `routes/skill.ts` |
| Prompt Template | `/api/prompt-templates` | `routes/prompt-template.ts` |
| Output Style | `/api/output-styles` | `routes/output-style.ts` |
| MCP | `/api/mcps` | `routes/mcp.ts` |
| NPM Settings | `/api/npm-settings` | `routes/npm-settings.ts` |
| Subscription | `/api/subscriptions` | `routes/subscription.ts` |
| Speech | `/api/speech-recognition` | `routes/speech-recognition.ts` |
| Agent Commands | `/api/agent-commands` | `routes/agent-commands.ts` |
| Robot Account | `/api/robot-accounts` | `routes/robot-account.ts` |
| Import | `/api/import` | `routes/import.ts` |
| Data | `/api/data` | `routes/data.ts` |
| Version | `/api/` | `routes/version.ts` |
| Chat | `/api/chat` | `routes/chat.ts` |
| Chat Run | `/api/chat-run` | `routes/chat-run.ts` |
| Team | `/api/teams`（团队 CRUD/成员/邀请/解散）| `routes/team.ts` |
| Team Inbox | `/api/team-inbox`（收件箱查询/删除/状态更新）| `routes/team.ts` |
| Team Messages | `/api/team-messages`（消息发送/更新/删除/评论/运行时回送）| `routes/team.ts` |
| Upload | `/api/upload`, `/api/upload/avatar` | 内联 |
| Font | `/api/fonts` | 内联 |
| User Settings | `/api/user/settings` | 内联 |
| Git Config | `/api/git-config` | 内联 |

## WebSocket 端点

| 路径 | 处理器 | 参数 |
|---|---|---|
| `/ws` | `ws/handler.ts` → handleConnection | workspaceId, token |
| `/ws/speech` | `routes/speech-recognition.ts` → handleSpeechStream | token, configId |
| `/ws/lsp/typescript` | `ws/typescript-lsp.ts` → handleTypeScriptLspConnection | workspaceId, token |

## 静态文件

| 路径 | 来源 |
|---|---|
| `/public/*` | `public/` 目录 |
| `/static/*` | `public/` + `{DATA_DIR}/public/` |
| `/agents-store/*` | `packages/templates/` |
| `/*` (生产) | `web/` 静态导出（SPA fallback） |
