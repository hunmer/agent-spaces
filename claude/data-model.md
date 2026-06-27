# 数据模型

## 存储架构

Server 使用 **SQLite (better-sqlite3)** 作为主存储，辅以 **JSON 文件**存储配置和运行时数据。

### Storage 层（packages/server/src/storage/）

| Store 文件 | 管理的数据 |
|---|---|
| `sqlite-store.ts` | SQLite 数据库连接管理 |
| `json-store.ts` | JSON 文件存储基础（getDataDir） |
| `agent-store.ts` | Agent 配置 |
| `chat-store.ts` | 聊天会话/消息 |
| `command-store.ts` | 命令记录 |
| `issue-store.ts` | Issue 数据 |
| `task-store.ts` | 任务数据 |
| `code-favorites-store.ts` | 代码收藏 |
| `database-store.ts` | 数据库配置 |
| `hook-store.ts` | Hook 配置 |
| `knowledge-base-store.ts` | 知识库 |
| `llm-store.ts` | LLM 配置 |
| `mini-app-store.ts` | Mini App 数据 |
| `mini-app-db.ts` | Mini App 数据库 |
| `npm-settings-store.ts` | NPM 配置 |
| `robot-account-store.ts` | 机器人账号 |
| `speech-recognition-store.ts` | 语音识别配置 |
| `subscription-store.ts` | 订阅信息 |
| `usage.ts` | 使用量统计 |
| `sql-safety.ts` | SQL 安全检查 |

### 前端状态管理（packages/web/src/stores/）

30+ Zustand stores，主要分类：

| Store | 职责 |
|---|---|
| `agent.ts` | Agent 状态 |
| `chat.ts` | 聊天状态 |
| `editor.ts` | 编辑器状态 |
| `llm.ts` | LLM 配置状态 |
| `workflow-editor/crud.ts` | Workflow CRUD |
| `workflow-editor/edit.ts` | Workflow 编辑 |
| `terminal.ts` | 终端状态 |
| `git.ts` | Git 状态 |
| `notification.ts` | 通知状态 |
| `task.ts` | 任务状态 |
| `issue.ts` | Issue 状态 |
| `command.ts` | 命令状态 |
| `channel.ts` | 频道状态 |
| `command-palette.ts` | 命令面板 |
| `search-commands/` | 搜索命令（多模块） |

### 共享类型（packages/shared/src/types/）

30+ 类型定义文件，覆盖所有领域模型的接口：
- `agent.ts`, `channel.ts`, `command.ts`, `issue.ts`, `task.ts`
- `workflow.ts`, `workflow-execution.ts`, `workflow-plugin.ts`, `workflow-composite.ts`
- `workspace.ts`, `worktree.ts`, `git.ts`, `file.ts`
- `llm.ts`, `tool.ts`, `hooks.ts`, `knowledge-base.ts`
- `events.ts`, `search.ts`, `notification.ts`, `subscription.ts`
- `speech.ts`, `sqlite.ts`, `database.ts`, `code-favorites.ts`

### 运行时数据目录

`packages/server/agent-spaces-data/` — 运行时生成，包含：
- 插件数据
- 工作流数据（JSON）
- 上传文件
