# packages/server (`@agent-spaces/server`)

Express 5 后端服务，REST API + WebSocket，SQLite 存储。核心能力：多 AI Agent 运行时适配（Claude Code/Codex/Grok/LangChain/Hermes/Pi/Open Agent SDK）、Runtime 安装与版本管理、Workflow 可视化执行引擎、Issue 任务系统、Team 多 Agent 协作（成员/角色/消息/收件箱/运行时编排）、**SkyOffice 多 Agent 可视化办公空间**（Colyseus 0.15 房间服务）、实时通信（聊天/终端/LSP）、知识库 + 向量嵌入、Git 操作、MCP 工具集成、Notification Hub 通知推送（微信/飞书 Bot）。

## 约定

- 入口 `src/app.ts`，所有路由在此注册。
- 存储层在 `src/storage/`，业务逻辑在 `src/services/`。
- AI 运行时适配器在 `src/adapters/`，`claude-code-runtime` 是独立子模块；新增运行时需实现统一接口。
- Runtime 管理（CLI 发现/SDK 安装）集中在 `routes/runtime.ts`。
- Issue 系统跨 `services/issue*.ts` + `agents/issue-agent-runner.ts` + `storage/issue-store.ts`。
- Team 协作系统跨 `services/team*.ts`（8 文件：team/team-manage/team-membership/team-message/team-inbox/team-runtime/team-internal/team-types）+ `routes/team.ts`（3 挂载点 `/api/teams` `/api/team-inbox` `/api/team-messages`）+ `builtin-tools/team-tools.ts`。
- **SkyOffice**（`src/skyoffice/`）：Colyseus 0.15 房间服务，因 colyseus 纯 CJS 采用**独立 tsconfig + CJS 隔离编译**（输出到 `dist/skyoffice/`，靠 `dist/skyoffice/package.json` 覆盖上层 ESM）；`app.ts` 顶部 `import 'reflect-metadata'` + `createRequire(import.meta.url)` 桥接加载；`/api/skyoffice/*` 在主 authMiddleware **之前**挂载，自管 per-room token 鉴权；upgrade 事件由 `app.ts` 统一 dispatcher 五路分流；`SKYOFFICE_ENABLED=false` 可关闭。**不要并入主 tsc**（装饰器 + ESM/CJS 冲突）。
- WebSocket 处理在 `src/ws/`。
- 运行时数据目录 `agent-spaces-data/` 勿手动修改。
- 路由前缀 `/api/`，`/api/inspector/track` 为唯一无认证端点。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [架构总览](claude/overview.md) | 架构、运行时形态 | 首次接触 |
| [入口与启动](claude/entrypoints.md) | app.ts 入口、启动流程 | 需要启动/理解初始化 |
| [对外接口](claude/public-interfaces.md) | REST API、WebSocket 端点 | 需要调用/新增接口 |
| [模块职责](claude/module-responsibilities.md) | 路由/服务/存储/适配器分类 | 需要定位功能 |
| [AI 运行时适配器](claude/ai-adapters.md) | 各 Agent SDK 适配详情 + Runtime 管理 | 需要新增/修改运行时 |
| [Team 运行时编排](claude/team-runtime.md) | Team 多 Agent 调度/消息路由/handoff/任务/会话生命周期 | 改 Team 协作逻辑 |
| [数据模型](claude/data-model.md) | Storage 层、领域模型 | 需要改数据结构 |
| [测试与质量](claude/testing-and-quality.md) | 测试覆盖 | 需要运行/补充测试 |
| [文件索引](claude/file-map.md) | 完整目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-07-18
- **已扫描**: package.json、app.ts、全部路由（42 个）、services（100 文件，含 team 系列/notification-hub/issue/builtin-tools）、storage（20+ store）、adapters（含 claude-code-runtime 子模块 + grok-runtime）、ws、agents、**team-runtime.ts 全文（1379 行）**、**skyoffice/ 子目录（Colyseus 房间服务，含 index.ts/api/broadcast/rooms/types/examples）**
- **跳过**: node_modules, dist, agent-spaces-data, public
