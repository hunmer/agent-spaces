# 路由索引

37 个路由文件，提供 REST API 端点。

| 路由文件 | 端点前缀 | 说明 |
|----------|----------|------|
| auth.ts | /api/auth | 认证（login/check/change-secret） |
| workspace.ts | /api/workspaces | 工作空间 CRUD + Prompt + Clone + 通知管理 |
| channel.ts | /api/workspaces/:id/channels | 频道与消息 |
| issue.ts | /api/workspaces/:id/issues | 议题管理（含 workflowId） |
| task.ts | /api/workspaces/:id/tasks | 任务管理 |
| agent.ts | /api/workspaces/:id/agents | Agent 会话 + 预设 |
| agent-sse.ts | /api/agent-sse | Agent SSE 流式调用 |
| agent-commands.ts | /api/workspaces/:id/agent-commands | Agent 命令管理 |
| workflow.ts | /api/workflows | Workflow 模板 CRUD |
| mini-app.ts | /api/mini-apps | Workflow UI CRUD |
| workflow-hook.ts | /api/workflow-hook | Workflow Webhook Hook（SSE） |
| command.ts | /api/workspaces/:id/commands | 快捷命令 CRUD + run/stop |
| git.ts | /api/workspaces/:id/git | Git 操作 |
| llm.ts | /api/models, /api/providers | LLM 模型与供应商 |
| search.ts | /api/workspaces/:id/search | 代码搜索 |
| database.ts | /api/workspaces/:id/databases | 文档数据库 + 向量搜索 |
| kanban.ts | /api/workspaces/:id/kanban | Kanban 看板 |
| worktree.ts | /api/workspaces/:id/worktrees | Worktree 并行开发 |
| plugin.ts | /api/plugins | Plugin 插件管理 |
| chat.ts | /api/chat/agents | Chat Agent CRUD |
| chat-run.ts | /api/chat/agents/:id/run | Chat Agent SSE 执行 |
| file.ts | /api/workspaces/:id/files | 文件系统 |
| folder.ts | /api/folder | 文件夹浏览器 |
| code-favorites.ts | /api/workspaces/:id/code-favorites | 代码收藏 |
| prompt-template.ts | /api/prompt-templates | Prompt 模板 |
| hooks.ts | /api/workspaces/:id/hooks | Hook 配置 |
| output-style.ts | /api/output-styles | 输出风格模板 |
| subscription.ts | /api/subscriptions | 订阅管理 |
| speech-recognition.ts | /api/speech-recognition | 语音识别 |
| skill.ts | /api/skills | 技能管理 |
| mcp.ts | /api/mcps | MCP 配置 |
| notification.ts | /api/workspaces/:id/notifications | 应用内通知 |
| version.ts | /api/version | 版本检查与自更新 |
| robot-account.ts | /api/workspaces/:id/robot-accounts | Robot Account |
| import.ts | /api/import | 数据导入（cc-switch） |
| data.ts | /api/data | 数据导入/导出（ZIP） |
| npm-settings.ts | /api/npm-settings | NPM 配置 |
