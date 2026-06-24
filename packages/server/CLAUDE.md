[根目录](../../CLAUDE.md) > [packages](../) > **server**

# @agent-spaces/server

Express 5 后端服务，185+ 个 TypeScript 源文件。提供 REST API（37 个路由文件）、WebSocket 实时通信（10 个处理器）、认证中间件、六运行时 Agent 编排引擎、Workflow DAG 执行引擎、Mini-app 沙箱子系统（5 文件架构 + SQLite）、Plugin 插件系统、通知中心（飞书/企微/Native）、Hook 系统、PTY 终端、Git 操作、SQLite Agent Usage 统计。作为整个平台的核心运行时，管理 Workspace 生命周期、Issue/Task 状态机、Agent 会话调度和数据持久化。

## 约定的规则

- ESM 模块（`"type": "module"`），导入路径带 `.js` 后缀
- 路由文件放在 `src/routes/`，按资源分组
- 服务层文件放在 `src/services/`
- 存储层文件放在 `src/storage/`
- 适配器文件放在 `src/adapters/`
- JSON body 限制 50MB
- zod 用于后端请求校验
- 除健康检查/认证/Inspector/版本端点外均需 Bearer Token 认证
- WebSocket 认证通过 `token` 查询参数
- 越界保护：文件路径 `safeSrcPath`、SQL `checkSql` + `validateDbName`（详见 [claude/storage.md](claude/storage.md)）

## 文件索引

| 文件 | 说明 |
|------|------|
| [claude/overview.md](claude/overview.md) | 总览、核心架构、大文件列表 |
| [claude/route-index.md](claude/route-index.md) | 37 个 REST API 路由索引 |
| [claude/architecture.md](claude/architecture.md) | Agent 运行时架构、Workflow 引擎、Issue 自动化、通知中心 |
| [claude/storage.md](claude/storage.md) | 存储层 24 文件索引（22 store + 2 SQL 工具）、SQLite 三层、关键 store 字段抽样、数据目录布局、写入约定 |
| [claude/changelog.md](claude/changelog.md) | 变更记录 |

## 入口与启动

- **入口文件**：`src/app.ts`
- **启动命令**：`pnpm dev`（tsx watch）或 `pnpm start`
- **默认端口**：3100（PORT 环境变量）
- **数据目录**：`~/.agent-spaces-data`
- **启动流程**：Express -> auth -> 路由 -> HTTP -> WebSocket -> Issue 重试恢复（`issue-retry.ts`）-> 通知恢复

## 关键目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `src/routes/` | 37 | REST API 路由 |
| `src/services/` | 78 | 业务逻辑（含 mini-app 5 文件 + 子目录） |
| `src/storage/` | 24 | 持久化层（22 store + 2 SQL 工具，含 SQLite 三层） |
| `src/adapters/` | 16 | Agent 运行时 + Git |
| `src/agents/` | 10 | Agent 编排 |
| `src/ws/` | 10 | WebSocket 处理 |

## Mini-app 子系统架构（5 文件）

| 文件 | 职责 |
|------|------|
| `mini-apps.ts` | CRUD + 文件管理 + ZIP 导入（yauzl）|
| `mini-app-services.ts` | 沙箱服务编译（剥离 import + ESM->CJS + new Function）+ configs 读写广播 |
| `mini-app-agent.ts` | Agent 运行时创建 + API JS 编译 + 工具注入 + 客户端 RPC |
| `mini-app-tasks.ts` | 进程内任务缓存（projectId 维度，TTL 10 分钟清理终态） |
| `mini-app-client-rpc.ts` | 客户端 RPC（request/response 配对，5s 超时） |

## 扫描状态

- **更新时间**：2026-06-24 09:27:10
- **已扫描范围**：全部路由、服务、适配器、存储层（24 文件）、WebSocket 处理器、mini-app 子系统、新增辅助服务
- **覆盖率**：约 96%（从 95% 提升）
- **本次新增（2026-06-24）**：`storage/` 关键 store 字段深挖 —— 修正 `agent-store.ts` 误描述（实为 SQLite Agent Usage 统计，非 Agent preset）；补充 chat-store 全字段（ChatAgent 30+ 字段含运行时不持久化的凭据剥离、ChatMessage 结构化 thinking/usage/toolCalls/timeline、WorkspaceTabState）、workspace/issue/task store 扁平 CRUD 范式（index.json + {id}.json 双写）、workflow-store 目录式布局、agent-store 双表结构 + 成本估算 fallback + Dashboard 聚合逻辑。详见 [claude/storage.md](claude/storage.md) "关键 store 字段抽样" 章节
- **主要缺口**：`storage/` 其余 10 个 JSON store（command/code-favorites/worktree/robot-account/subscription/hook/llm/speech/user-settings/npm-settings）字段未逐一抽取（多为扁平 CRUD，按需 Read 即可）、`notification-hub/` bot-agent/service 细节
