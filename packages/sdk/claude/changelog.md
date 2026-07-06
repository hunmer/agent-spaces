# Changelog

> 本文件只记录 SDK 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-06 — 模块清单盘点

- `src/modules/` 共 39 个 API 模块（200+ 方法）
- 近期增强：`issue`（11 方法：CRUD + start/resume/continue/interrupt + 评论）、`agent`（11 方法，含 `sessionDetail`）、`chat`（17 方法）、`workflow`（18 方法）
- 新增域：external-import / model-catalog / robot-accounts / agent-commands / agent-store 等
- 更新 `CLAUDE.md`（模块数 35+→39、约定补全模块覆盖域）

## 2026-06-27 — 初始化 SDK 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（4 个详情文件）
- 扫描范围：package.json、src/index.ts、src/modules/ 列表
