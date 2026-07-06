# Changelog

> 本文件只记录 Server 模块 AI 上下文的更新历史，最近 5 条倒序排列。

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
