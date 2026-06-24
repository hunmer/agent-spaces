# 存储层

`src/storage/` 共 24 个文件（22 store + 2 SQL 工具），统一基于 `json-store.ts` 的文件工具或 better-sqlite3 / node:sqlite。数据落在 `~/.agent-spaces-data/`。

## 基础设施 — `json-store.ts`

| 函数 | 作用 |
|------|------|
| `getDataDir()` | 返回 `AGENT_SPACES_DATA_DIR` 或 `~/.agent-spaces-data`（`resolve()` 包裹，防止相对路径让插件 `createRequire` 抛 `ERR_INVALID_ARG_VALUE`） |
| `ensureDir(dir)` | 递归建目录 |
| `readJsonFile<T>(path)` | 不存在返回 `null`，否则 `JSON.parse` |
| `writeJsonFile<T>(path, data)` | 自动建父目录，2 空格缩进写盘 |
| `deleteFile(path)` | 存在则删 |

约定：**每个 JSON store 是无状态的纯函数集合**，service 层调用它读写，本身不缓存。SQLite store 内部用模块级变量做单例连接。

## SQL 安全 — `sql-safety.ts`（纯函数，driver 无关）

被 `mini-app-db.ts`（better-sqlite3）与 `sqlite-store.ts`（node:sqlite）共用，是 SQL 校验的单一真相源。

| 导出 | 作用 |
|------|------|
| `DB_NAME_RE` | `/^[a-zA-Z0-9_-]{1,64}$/` 库名白名单 |
| `MAX_ROWS` | 单查询返回行数上限 10000 |
| `BLOCKED_RE` | 拦截 `ATTACH` / `DETACH` |
| `IDENT_RE` | `/^[A-Za-z_][A-Za-z0-9_]*$/` 标识符白名单 |
| `validateDbName(name)` | 库名校验 |
| `checkSql(sql)` | 危险语句校验 |
| `bindArgs(params)` | 数组按位展开 / 对象包成单参 |
| `validateIdentifier(name, kind)` | 表名/列名校验 |

## 目录式持久化范例 — `workflow-store.ts`

每个 workflow 独立目录，承载版本/日志/配置等多类数据：

```
~/.agent-spaces-data/workflows/
  folders.json                          # 文件夹树（带 order 排序）
  <workflowId>/
    workflow.json                       # DAG 定义（nodes/edges/groups/variables/triggers）
    versions/<versionId>.json           # 历史快照，上限 100
    execution_history/<logId>.json      # 执行日志，上限 100（按 mtime 淘汰最旧）
    plugin_configs/<pluginId>/<scheme>.json
    staging.json                        # 暂存节点（剪贴板）
    operation_history.json              # 撤销/重做栈
    chat.json                           # 工作流 Agent 对话
```

- 旧版扁平文件（`workflows/<id>.json` + `index.json`）首次访问时自动迁移到目录式
- `listAllExecutionLogs(limit)` 跨工作流聚合，回填 workflowName
- 删文件夹级联删子文件夹 + 其下 workflow

## SQLite 三层

| Store 文件 | 驱动 | 落盘路径 | 用途 |
|-----------|------|---------|------|
| `agent-store.ts` | node:sqlite（`DatabaseSync`） | `~/.agent-spaces-data/agents/agents.sqlite`（WAL） | **Agent 会话 + 用量统计**（agent_sessions + agent_usage 双表，**2026-06-24 修正**：并非 Agent preset） |
| `mini-app-db.ts` | better-sqlite3 | `~/.agent-spaces-data/mini-apps/<projectId>/data/db/<dbName>.sqlite` | Mini-app 沙箱项目内嵌数据库（每项目按 db 名分文件，WAL + busy_timeout 5000） |
| `sqlite-store.ts` | node:sqlite（`DatabaseSync`） | `~/.agent-spaces-data/sqlite/<id>.sqlite` | 用户顶层文档/数据数据库，含元数据 `sqlite/databases.json` 与字段元数据表 `__sqlite_field_meta__` |
| `knowledge-base-store.ts` | node:sqlite | `~/.agent-spaces-data/knowledge-bases/knowledge-bases.sqlite` | 知识库（`kbs` + `kb_files` + 嵌入向量），按 workspace 隔离，支持 chunk_size/overlap 配置 |

> `mini-app-db` 与 `sqlite-store` 均暴露 `validateDbName/checkSql/bindArgs`（重导出自 `sql-safety`），保持下游 import 兼容。

## Store 索引（24 文件）

| Store 文件 | 领域 | 持久化形态 |
|-----------|------|-----------|
| `json-store.ts` | 基础工具 | 无状态 |
| `sql-safety.ts` | SQL 安全校验工具 | 无状态 |
| `workflow-store.ts` | Workflow DAG + 版本 + 日志 + 触发器配置 | 目录式（见上） |
| `mini-app-store.ts` | Workflow UI 项目（react/html 文件树 + manifest） | 项目目录 + 文件 |
| `mini-app-db.ts` | Mini-app 沙箱内嵌 SQLite | **SQLite**（better-sqlite3，按项目分文件） |
| `sqlite-store.ts` | 用户顶层文档数据库 | **SQLite**（node:sqlite）+ `databases.json` 元数据 |
| `knowledge-base-store.ts` | 知识库（向量搜索） | **SQLite**（node:sqlite，WAL） |
| `agent-store.ts` | **Agent 会话 + Usage 统计**（agent_sessions + agent_usage 表） | **SQLite**（node:sqlite，WAL） |
| `chat-store.ts` | Chat 独立页（Agent preset + 会话 + 工作区） | JSON + 目录 |
| `workspace-store.ts` | 工作空间 + boundDirs | JSON |
| `issue-store.ts` | Issue 列表 + 状态 | JSON |
| `task-store.ts` | Task（Issue 自动化派生） | JSON |
| `command-store.ts` | 快捷命令 | JSON |
| `database-store.ts` | 文档数据库（Notion 风格，集合 + 文档） | JSON |
| `code-favorites-store.ts` | 代码收藏 | JSON |
| `worktree-store.ts` | Git worktree | JSON |
| `robot-account-store.ts` | 机器人账号 | JSON |
| `subscription-store.ts` | 订阅（aicode/minimax/zhipu） | JSON |
| `hook-store.ts` | Hook 配置 | JSON |
| `llm-store.ts` | LLM 模型 + 供应商配置 | JSON |
| `speech-recognition-store.ts` | 语音识别配置 | JSON |
| `user-settings-store.ts` | 用户设置 | JSON |
| `npm-settings-store.ts` | npm 镜像/发布设置 | JSON |
| `usage.ts` | 从 CLI 输出文本中正则提取 token usage（input/output/total/cached/reasoning） | 无状态纯函数 |

## 关键 store 字段抽样（2026-06-24 补全）

> 详细字段见根 `claude/data-model.md` 的"Store 字段抽样"章节。这里只列要点。

### agent-store.ts（SQLite，**2026-06-24 修正**）

**注意**：此文件名为 `agent-store` 但**不是 Agent preset 存储**，而是 Agent 会话与用量统计。Agent preset 实际分散在 `chat-templates/`（chat-store 管理）和 `agent-templates/`（目录式，无独立 store 文件）。

- `agent_sessions`：id(PK) / workspace_id / agent_config_id / role / status / current_task_id? / process_id? / started_at / last_activity_at / error?。索引 `(workspace_id, last_activity_at DESC)`。`insertSession` 走 `INSERT ... ON CONFLICT(id) DO UPDATE` 实现 UPSERT。
- `agent_usage`：21 列。包含 5 类 token 计数（input/output/cached_input/reasoning/total）+ 3 类成本（input/output/total cost_usd）+ runtime/model/summary/error/duration_ms。UNIQUE(agent_session_id, completed_at)。
- 成本估算 fallback：`estimateCost()` 用 `getModelPrices()` 按模型名 substring 匹配（gpt-4o/5、sonnet/haiku/opus、gemini），未命中按 1/3 USD/M；可被 llm-store 的 `cost.inputPerMillion/outputPerMillion` 覆盖。
- `getAgentUsageDashboard(days=30)`：返回 totals + daily（按天补零）+ byModel（成本降序前 5）+ recent（前 6）。

### chat-store.ts（ChatAgent preset + 会话）

ChatAgent 字段（30+）：包含运行时配置（runtimeKind: 'langchain'? / model / modelProvider? / providerId?）、凭据（apiKey/baseURL/apiBase/provider **运行时不持久化**，通过 `toStoredChatAgent` 剥离）、能力（mcps / skills / tools / outputStyle / temperature / maxTokens）。消息支持 thinking / usage / toolCalls / timeline 结构化字段。`migrateToWorkspaces()` 可将旧 single-agent 消息迁移到 workspace+session 结构。

### workspace-store / issue-store / task-store（扁平 CRUD 范式）

三者同构：`index.json` 列表 + `{id}.json` 详情双写，纯函数无锁无事务。delete 操作 issue/task 会 unlink 详情文件，workspace 不会（仅重写 index）。

## 写入约定

- 全部 `writeJsonFile`（2 空格，UTF-8），无事务、无锁 —— **不适合高并发写**，靠业务层串行调用保证一致
- SQLite 全部启用 `journal_mode = WAL` + `busy_timeout = 5000`
- 删除走 `rmSync(recursive)` 或 `unlinkSync`，无软删
- 无 schema 迁移框架；`workflow-store` 的 `migrateFromLegacyFormat` 是 JSON 侧唯一的显式迁移逻辑；`chat-store.migrateToWorkspaces` 是第二处显式迁移；SQLite 侧用 `CREATE TABLE IF NOT EXISTS` 做轻量演进
