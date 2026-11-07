# Changelog

> 本文件只记录 Shared 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-10 — 新增 team.ts 类型

- 新增 `src/types/team.ts`：Team 协作域完整类型定义
  - 实体：Team / TeamMembership / TeamMessage / TeamInboxItem / TeamRuntime / TeamComment
  - 枚举：TeamStatus(active/archived/dissolved) / TeamVisibility / TeamRole(owner/admin/member/observer) / TeamMembershipStatus / TeamMessageType(direct/broadcast) / TeamPriority / TeamInboxStatus / TeamExecutionStatus / TeamRuntimeStatus / TeamCommentVisibility
- 类型文件总数 27 → 30
- 更新 `CLAUDE.md`（约定补 team.ts/扫描状态）、`claude/overview.md`（清单补 team.ts）

## 2026-07-06 — 类型清单盘点

- `src/types/` 共 27 个类型文件，Workflow 域已细分为 8 个文件（workflow / workflow-execution / workflow-composite / workflow-plugin / workflow-shortcut / workflow-ws / workflow-node-factory / workflow-errors）
- 关键域类型：agent / channel / issue / llm / notification / knowledge-base / hooks / worktree / subscription / speech / tool
- 上次迭代新增：`AgentUsageSessionMessage` / `AgentUsageSessionDetail`、`WorkflowExecuteRequest.source`
- 更新 `CLAUDE.md`（约定/扫描状态）

## 2026-06-27 — 初始化 Shared 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（3 个详情文件）
- 扫描范围：package.json、src/index.ts、src/types/ 列表
