# 存储层

`src/storage/` 共 21 个 store，统一基于 `json-store.ts` 的文件工具。数据落在 `~/.agent-spaces-data/`。

## 基础设施 — `json-store.ts`

| 函数 | 作用 |
|------|------|
| `getDataDir()` | 返回 `AGENT_SPACES_DATA_DIR` 或 `~/.agent-spaces-data` |
| `ensureDir(dir)` | 递归建目录 |
| `readJsonFile<T>(path)` | 不存在返回 `null`，否则 `JSON.parse` |
| `writeJsonFile<T>(path, data)` | 自动建父目录，2 空格缩进写盘 |
| `deleteFile(path)` | 存在则删 |

约定：**每个 store 是无状态的纯函数集合**，service 层调用它读写，本身不缓存。

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

## Store 索引（21 个）

| Store 文件 | 领域 | 持久化形态 |
|-----------|------|-----------|
| `json-store.ts` | 基础工具 | 无状态 |
| `workflow-store.ts` | Workflow DAG + 版本 + 日志 + 触发器配置 | 目录式（见上） |
| `mini-app-store.ts` | Workflow UI 项目（react/html 文件树） | 项目目录 + 文件 |
| `agent-store.ts` | Agent preset + 配置目录 | JSON + 文件 |
| `workspace-store.ts` | 工作空间 + boundDirs | JSON |
| `issue-store.ts` | Issue 列表 + 状态 | JSON |
| `task-store.ts` | Task（Issue 自动化派生） | JSON |
| `channel-store.ts` | 频道 + 消息 | JSON |
| `chat-store.ts` | 独立 Chat 会话 | JSON |
| `command-store.ts` | 快捷命令 | JSON |
| `kanban-store.ts` | Kanban 看板 | JSON |
| `database-store.ts` | 文档数据库（集合 + 文档） | JSON |
| `code-favorites-store.ts` | 代码收藏 | JSON |
| `worktree-store.ts` | Git worktree | JSON |
| `robot-account-store.ts` | 机器人账号 | JSON |
| `subscription-store.ts` | 订阅（aicode/minimax/zhipu） | JSON |
| `hook-store.ts` | Hook 配置 | JSON |
| `llm-store.ts` | LLM 模型 + 供应商配置 | JSON |
| `speech-recognition-store.ts` | 语音识别配置 | JSON |
| `user-settings-store.ts` | 用户设置 | JSON |
| `npm-settings-store.ts` | npm 镜像/发布设置 | JSON |
| `usage.ts` | Agent 用量统计 | **SQLite**（根 CLAUDE.md 标注，独立于 JSON 体系） |

> 上表未读 store 逐字段抽取，职责据文件名 + service 调用推断。深挖具体字段时建议直接 Read 对应 store 文件（多为 100–300 行的扁平 CRUD）。

## 写入约定

- 全部 `writeJsonFile`（2 空格，UTF-8），无事务、无锁 —— **不适合高并发写**，靠业务层串行调用保证一致
- 删除走 `rmSync(recursive)` 或 `unlinkSync`，无软删
- 无 schema 迁移框架；`workflow-store` 的 `migrateFromLegacyFormat` 是唯一的显式迁移逻辑
