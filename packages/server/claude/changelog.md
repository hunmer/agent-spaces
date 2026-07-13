# Changelog

> 本文件只记录 Server 模块 AI 上下文的更新历史，最近 5 条倒序排列。

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

## 2026-07-06 — Runtime 管理 + Notification Hub + Issue 系统成型

- 新增 `routes/runtime.ts`（discover-cli / install-cli / check-sdk-updates，8 个 RuntimeDescriptor），挂载 `/api/runtime`
- `adapters/claude-code-runtime/` 成熟为独立子模块（adapter-pool / anthropic-bridge / protocol-converter / message-format / sdk-config / types）
- `services/notification-hub/` 多通道推送成型（wechat / lark / bot-agent / bot-commands）
- Issue 系统闭环：`services/issue.ts` + `issue-comment.ts` + `issue-retry.ts` + `agents/issue-agent-runner.ts` + `storage/issue-store.ts`
- 路由总数 30+ → 40+（新增 runtime / chat-run / model-catalog / notifications-global / external-import / workflow-hook / workflow-settings）
- 更新 `CLAUDE.md`（约定/扫描状态）、`claude/ai-adapters.md`（新增 Runtime 管理 + notification-hub 章节）、`claude/public-interfaces.md`（runtime 路由）

## 2026-06-27 — 初始化 Server 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（9 个详情文件）
- 扫描范围：package.json、app.ts、路由/服务/存储/适配器/ws/agents 目录
- 跳过：node_modules, dist, agent-spaces-data, public
