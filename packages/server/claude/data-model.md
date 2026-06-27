# Server 模块 — 数据模型

## 存储层

### SQLite 存储

主数据库通过 `sqlite-store.ts` 管理，使用 better-sqlite3。

### JSON 文件存储

`json-store.ts` 提供 `getDataDir()` 返回数据目录路径，部分配置用 JSON 文件存储。

### Store 文件清单

| 文件 | 管理数据 |
|---|---|
| `sqlite-store.ts` | 数据库连接 |
| `json-store.ts` | JSON 存储基础 |
| `agent-store.ts` | Agent 配置 |
| `chat-store.ts` | 聊天会话/消息 |
| `command-store.ts` | 命令记录 |
| `issue-store.ts` | Issue |
| `task-store.ts` | 任务 |
| `code-favorites-store.ts` | 代码收藏 |
| `database-store.ts` | 数据库配置 |
| `hook-store.ts` | Hook |
| `knowledge-base-store.ts` | 知识库 |
| `llm-store.ts` | LLM 配置 |
| `mini-app-store.ts` | Mini App |
| `mini-app-db.ts` | Mini App 数据库 |
| `npm-settings-store.ts` | NPM 配置 |
| `robot-account-store.ts` | 机器人账号 |
| `speech-recognition-store.ts` | 语音识别配置 |
| `subscription-store.ts` | 订阅 |
| `usage.ts` | 使用统计 |
| `sql-safety.ts` | SQL 安全检查 |

### 共享类型

跨前后端类型定义在 `packages/shared/src/types/`，Server 和 Web 均引用。
