# Changelog

> 本文件只记录 Documents 模块 AI 上下文的更新历史，最近 5 条倒序排列。

## 2026-07-06 — 文档定位重构（工作流主导）

- 产品定位从「本地多 Agent 协同编程平台」全面改为「可视化工作流自动化平台」
- `docusaurus.config.ts` tagline 改为「可视化工作流自动化平台」
- `src/pages/index.tsx` 首页 title/description 重写
- `src/components/HomepageFeatures` 六个特性卡重写（工作流引擎排首位）
- `docs/intro.mdx` 重写开篇定位 + 能力表（拆分为「工作流引擎（核心）」与「其他能力」两表）
- `docs/features/workflow.mdx` 补全：9 类 40+ 节点体系、6 种触发方式、执行形态、复合节点与子流程、节点状态与断点
- `sidebars.ts` 功能介绍重排：workflow + mini-app 提前到首位（仅次于 workspace）
- 更新 `CLAUDE.md` 扫描状态

## 2026-06-27 — 初始化 Documents 模块上下文

- 首次生成 `CLAUDE.md` + `claude/*.md`（3 个详情文件）
- 扫描范围：package.json、docusaurus.config.ts、目录结构
