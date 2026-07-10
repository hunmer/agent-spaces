# Changelog

> 本文件只记录 Web 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-10 — Team 协作 + Chat/Sidebar 重构

- 新增 `app/teams/page.tsx` 路由（Team 多 Agent 协作入口）
- 新增 `components/teams/`（8 文件：create-team-dialog / team-card / team-chat-panel / team-inbox-dialog / team-management-page / member-select-panel / team-member-list / team-member-row）
- `components/chat/` 大幅重构（61 文件变更，消息列表/输入/Agent 面板）
- `components/sidebar/` 重构（55 文件变更）
- locales 新增 `en/teams.json` + `zh/teams.json`，agent/chat/common 等多文件扩充
- 更新 `CLAUDE.md`（功能描述补 Team/扫描状态）、`claude/public-interfaces.md`（teams 路由）、`claude/module-responsibilities.md`（teams 组件目录）

## 2026-07-06 — Issue 系统 + Usage Dashboard + Runtime Tab

- 新增 `components/issue/`（10 文件：issue-list / issue-detail / issue-detail-comments / issue-detail-workflow-panel / issue-detail-info-panel / issue-message / create-issue-dialog / comment-navigator / collect-mention-ids / issue-status-colors）
- 新增 `components/home/usage-dashboard*`（dashboard / table / charts / session-dialog / skeleton / utils）+ subscription 面板
- `components/sidebar/settings/` 新增 `runtime-tab.tsx`（运行时发现/安装/更新）
- 新增 `app/notifications/page.tsx` 全局通知中心路由
- locales en/zh 持续扩充（agent/issue/projectSettings 等近 5 次迭代高频改动）
- 更新 `CLAUDE.md`（功能描述/约定/扫描状态）、`claude/public-interfaces.md`（补 notifications 路由）

## 2026-06-27 — 初始化 Web 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（7 个详情文件）
- 扫描范围：package.json、入口文件、路由、组件目录、Store 列表、lib 工具
- 跳过：node_modules, .next, public/monaco
