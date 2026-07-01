# Changelog

## 2026-07-01 — 增量更新（Agent 用量会话详情 + Workflow context）

- **server**: 新增 `GET /api/agents/sessions/:agentSessionId/detail`（`getSessionDetail` 聚合 session + usage + 消息时间线）；`agent-store` 新增 `getAgentSessionById` / `getLatestAgentUsageBySessionId`
- **server**: `execution-manager` 注入 `__WORKFLOW__` 上下文对象 + `inferWorkflowSource`（cron/hook/api/agent-tools/web），变量模板新增 `{{__WORKFLOW__.key}}`
- **shared**: 新增类型 `AgentUsageSessionMessage` / `AgentUsageSessionDetail`；`WorkflowExecuteRequest` 与 `workflow:execute` 事件新增 `source` 字段
- **sdk**: `agent` 模块新增 `sessionDetail()` 方法（10→11 方法）
- **web**: 变量选择器新增"工作流信息"分组（`__WORKFLOW__` 字段树）；`usage-dashboard-session-dialog.tsx` 会话详情对话框（未跟踪）
- 更新文件：`server/claude/architecture.md`、`server/claude/public-interfaces.md`、`shared/claude/data-model.md`、`sdk/claude/public-interfaces.md`

## 2026-06-27 — 初始化项目 AI 上下文

- 首次生成根级 `CLAUDE.md` + `claude/*.md`（11 个详情文件）
- 识别并生成 9 个模块的 `CLAUDE.md` + `claude/*.md`
- 覆盖模块：web, server, electron, sdk, shared, templates, dom-inspector-hook, flutter, documents
- 扫描范围：根目录结构、所有 package.json、主要入口文件、路由/服务/存储/API
- 跳过：`node_modules/`、`.next/`、`dist/`、`out/`、`release/`、运行时数据目录
