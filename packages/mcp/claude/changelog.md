# Changelog

> 本文件只记录 MCP 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-13 — 拆分 claude/ 子目录

- 原 `CLAUDE.md` 为长文档（核心机制/约定/常见任务全塞索引），不符合"索引+详情分离"规范
- 拆分为 `claude/overview.md`（架构/反射机制/workflow 契约缺口）、`conventions.md`（命令/风格/常见任务）、`entrypoints.md`（入口/启动/构建）、`public-interfaces.md`（tools/transport/鉴权）、`testing-and-quality.md`（红绿灯）、`file-map.md`、`faq.md`、`changelog.md`
- `CLAUDE.md` 改为轻量索引
- SDK 模块数核对：当前 39（文档原记 36/339 为历史快照，反射自动同步无需手改）

## 2026-06-27 — 初始化 MCP 模块上下文

- 首次生成 `CLAUDE.md`（长文档形式）
- 扫描范围：package.json、tsconfig、src/ 全部、tests/、scripts/
- SDK 方法数快照：339（36 模块），反射全覆盖
