# Changelog

> 本文件只记录 SDK 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-10 — 新增 team 模块

- 新增 `src/modules/team.ts`，导出 `createTeamApi`，在 `src/index.ts` 注册为 `sdk.team`
- team 模块覆盖：团队 CRUD / 成员管理（邀请/角色/移除）/ 消息（发送/更新/删除/评论）/ 收件箱（查询/状态/删除）/ 运行时（查询/回送消息）
- 模块总数 39 → 40
- 更新 `CLAUDE.md`（模块数/覆盖域补 team/扫描状态）、`claude/overview.md`（模块列表补 team）

## 2026-07-06 — 模块清单盘点

- `src/modules/` 共 39 个 API 模块（200+ 方法）
- 近期增强：`issue`（11 方法：CRUD + start/resume/continue/interrupt + 评论）、`agent`（11 方法，含 `sessionDetail`）、`chat`（17 方法）、`workflow`（18 方法）
- 新增域：external-import / model-catalog / robot-accounts / agent-commands / agent-store 等
- 更新 `CLAUDE.md`（模块数 35+→39、约定补全模块覆盖域）

## 2026-06-27 — 初始化 SDK 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（4 个详情文件）
- 扫描范围：package.json、src/index.ts、src/modules/ 列表
