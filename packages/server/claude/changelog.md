# Changelog

> 本文件只记录 Server 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-18 — 深挖 SkyOffice 房间 + Grok 协议（新增 2 个详情文件）

- 精读 `skyoffice/rooms/SkyOffice.ts`（135 行，房间生命周期 + 5 类 message handler + Dispatcher 命令模式）、`rooms/schema/OfficeState.ts`（Player/Agent/ChatMessage schema）、`broadcast/Bridge.ts`（Agent 广播 → 房间状态的核心枢纽：dispatch 路由 7 种 AgentBroadcastType + 椅子占用机制 + bizRoomId↔colyseusRoomId 映射）
- 精读 `adapters/grok-runtime.ts`（345 行）：spawn 子进程 + streaming-json 按行解析、text/thought/end/error 事件 schema、缓冲 flush 策略、自定义模型 config.toml 生成、normalizeGrokEndpoint 按 provider 归一化 backend、env_key 区分（XAI_API_KEY 原生 / AGENT_SPACES_GROK_API_KEY 自定义）
- 新建 `claude/skyoffice.md`：双源实体模型（Player=sessionId vs Agent=业务agentId）、Bridge dispatch 路由表、椅子占用算法、Agent 广播协议 JSON 示例、相对原版的裁剪清单、前端集成指引
- 新建 `claude/grok-runtime.md`：CLI 参数表、JSON 事件 schema、usage/cost 归一化、结果判定逻辑、config.toml 模板、backend 归一化表、环境变量、日志规范
- 更新 `CLAUDE.md` 文件索引：+grok-runtime.md +skyoffice.md 两行

## 2026-07-18 — SkyOffice 合并 + Grok 运行时

- **SkyOffice**（`src/skyoffice/`）：Colyseus 0.15 房间服务合并进主后端单进程。因 colyseus 纯 CJS，采用独立 `tsconfig.json` + CJS 隔离编译（输出 `dist/skyoffice/`，靠 `dist/skyoffice/package.json` 覆盖上层 ESM）。主后端 `app.ts` 顶部 `import 'reflect-metadata'` + `createRequire(import.meta.url)` 桥接加载 `attachSkyOffice` / `mountSkyOfficeRoutes` / `getColyseusUpgradeHandler`。三路 upgrade 冲突由 `app.ts` 统一 dispatcher 五路分流（`/ws`、`/ws/speech`、`/ws/lsp/typescript`、`/agent-ws` + Colyseus 委托）
- **SkyOffice API**：`/api/skyoffice/rooms`（CRUD，自管 per-room token，**在主 authMiddleware 之前挂载**）、`/api/skyoffice/map`（地图数据）、`/skyoffice/colyseus`（monitor，**无鉴权**）；Agent WS `/agent-ws?roomId=...&token=...`；Viewer 连 `/<colyseusRoomId>`；`SKYOFFICE_ENABLED=false` 可关闭
- **Grok 运行时**（`adapters/grok-runtime.ts`）：`AgentRuntimeKind` 新增 `'grok'`，spawn 子进程 + JSON 事件流，支持 baseURL/resume/maxTurns/tools/permission/thinking；已在 `RUNTIME_DESCRIPTORS` 登记（descriptor 8 → 9）；测试 `src/adapters/grok-runtime.test.ts`
- 更新文件：`CLAUDE.md`（功能描述 + 约定 + 扫描状态）、`claude/ai-adapters.md`（+Grok 章节 + Runtime 管理 descriptor 8→9）、`claude/module-responsibilities.md`（adapters 表 +Grok、+SkyOffice 子目录）、`claude/public-interfaces.md`（+SkyOffice REST/WS）、`claude/changelog.md`

## 2026-07-13 — 深挖 team-runtime.ts + 增量核对

- 新增 `claude/team-runtime.md`：team-runtime.ts（1379 行）全量精读，覆盖成员调度（preset/chat/custom 三分流）、消息路由（postTeamRuntimeMessage → dispatchTeamReply）、handoff 机制、任务管理（owner/非 owner 责任 + 工具入口）、工具装配、事件广播、会话生命周期、文件级持久化模型
- 修正 Team 服务文件数：9 → 8
- `services/builtin-tools/` 补全：12 文件（含 `agent-tools.ts`，含 workflow-editor/ 子目录）
- services 总数 99 → 100；路由数确认 42
- 更新 `CLAUDE.md`（新增 team-runtime 索引行/约定 Team 文件数/扫描状态补 team-runtime 全文）

## 2026-07-13 — 增量核对（Team 文件数修正 + builtin-tools 补全）

- 修正 Team 服务文件数：9 → 8（team/team-manage/team-membership/team-message/team-inbox/team-runtime/team-internal/team-types）
- `services/builtin-tools/` 补全：12 文件（新增 `agent-tools.ts`，含 workflow-editor/ 子目录）
- services 总数 99 → 100；路由数确认 42
- 更新 `CLAUDE.md`（约定 Team 文件数/扫描状态）、`claude/module-responsibilities.md`（路由数/服务数/builtin-tools 列表/team 文件数）

## 2026-07-10 — Team 多 Agent 协作系统

- 新增 Team 协作子系统：`services/team*.ts`（8 文件：team/team-manage/team-membership/team-message/team-inbox/team-runtime/team-internal/team-types）
- `routes/team.ts` 挂载 3 个 API：`/api/teams`（团队 CRUD/成员/邀请/角色/解散）、`/api/team-inbox`（收件箱查询/删除/状态）、`/api/team-messages`（消息发送/更新/删除/评论/运行时回送）
- `services/builtin-tools/team-tools.ts`：Agent 可调用的团队协作工具集
- `services/chat-run.ts` + `routes/chat-run.ts`：聊天运行模块
- 路由总数 40+ → 42；services 总数 90+ → 99
- 更新 `CLAUDE.md`（功能描述/约定补 Team/扫描状态）、`claude/public-interfaces.md`（team/chat-run 路由）、`claude/module-responsibilities.md`（Team 子域 + chat-run）


