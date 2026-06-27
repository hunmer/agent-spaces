# Changelog

## 2026-06-27 — 初始化项目 AI 上下文

- 首次生成根级 `CLAUDE.md` + `claude/*.md`（11 个详情文件）
- 识别并生成 9 个模块的 `CLAUDE.md` + `claude/*.md`
- 覆盖模块：web, server, electron, sdk, shared, templates, dom-inspector-hook, flutter, documents
- 扫描范围：根目录结构、所有 package.json、主要入口文件、路由/服务/存储/API
- 跳过：`node_modules/`、`.next/`、`dist/`、`out/`、`release/`、运行时数据目录
