# Changelog

> 本文件只记录"AI 上下文索引"的生成/更新历史，最近 5 条倒序排列。

## 2026-07-27 — Gemini CLI 运行时 + 多 CLI 会话面板 + TS LSP WS 下线

- **背景**: 自 2026-07-18 以来共 107 个 "fix" commit，message 无信息量，需通过实际代码内容判断语义。本期结构性新增极少，集中在三个方向。
- **Gemini CLI 运行时** (`packages/server/src/adapters/gemini-cli-runtime.ts`，422 行): 新增 `GeminiCliRuntime` 实现 `AgentRuntime` 接口，spawn `gemini-cli` 子进程 + stdout JSON 事件解析、附件上下文准备、权限模式、resume 会话；`AgentRuntimeKind` 新增 `'gemini-cli'`；测试 `adapters/gemini-cli-runtime.test.ts`。至此 CLI 适配器覆盖 claude-code/codex/grok/hermes/pi/gemini-cli。
- **`RUNTIME_DESCRIPTORS` 扩张** (`routes/runtime.ts`): 从原 9 个 descriptor 扩至 **20 个 id**——9 个有独立 `runtimeKind` 适配器（claude-code/codex/grok/gemini-cli/hermes/pi/claude-code-sdk/codex-sdk/open-agent-sdk）+ **11 个别名复用既有 runtimeKind**（openclaw/omp/opencode/qwen/cursor/kimi/kiro/kilocode/antigravity/xiaomimimo/githubcopilot）。
- **多 CLI 会话面板** (`packages/web/src/components/cli/`): 全新功能。`cli-panel.tsx` + `cli-launcher.tsx` + `cli-session-list.tsx` + `stores/cli-sessions.ts` + `lib/cli-panel-layout.ts` + `lib/runtime-cli-settings.ts` + `lib/cli-icons.ts` + `locales/{en,zh}/cli.json`。每会话的 flex-layout 独立持久化到 localStorage（`agent-spaces:cli-panel:<id>:layout`）。
- **TypeScript LSP WebSocket 下线**: `/ws/lsp/typescript` 端点已从 `app.ts` 移除，`ws/typescript-lsp.ts` 文件已删除。原五路 upgrade dispatcher 变为三路（`/ws`、`/ws/speech`；后续重构中 `/agent-ws` 与 Colyseus 委托已一并移除）。后续 后续重构时 `/agent-ws` 与 Colyseus 委托一并移除。
- **Mini-app 子系统迭代**: `ws/mini-app-channels.ts`（新增 `miniApp.taskStop` 事件，前端凭 taskId 主动中断 mini-app agent 执行）；`services/mini-app-services.ts` 新增 `startServicesWatcher`（app.ts 启动调用，服务文件热监听）；`services/builtin-tools/mini-app-tools.ts` 本期改动 6 次（全仓库最高）。
- **文档修正**: server `claude/public-interfaces.md` 移除过期 `/ws/lsp/typescript` 行 + 2 个虚构路由（`routes/code-favorites.ts` `routes/task.ts` 实际不存在）。
- **未改源码**: 本次仅同步文档，无源码变更。

## 2026-07-16 — oh-my-pi → pi 迁移核对

- **背景**: 用户提示 oh-my-pi 已迁移到 pi，本次为迁移后文档同步核对
- **源码事实**: `adapters/oh-my-pi-runtime.ts` → `adapters/pi-runtime.ts`；`AgentRuntimeKind = 'pi'`；`routes/runtime.ts` 中 descriptor `id:'pi'`/`label:'Pi SDK'`/`runtimeKind:'pi'`/`packageName:'@earendil-works/pi-coding-agent'`；`services/agent.ts` 与 `ws/agent-prompt.ts` 均使用 `'pi'`
- **文档修正**: 将旧名 `Oh-My-Pi` 更新为 `Pi`/`Pi SDK`（根 `claude/overview.md`、`claude/module-responsibilities.md`、`claude/faq.md`；`packages/server/CLAUDE.md` 核心能力描述）
- **残留确认**: `oh-my-pi` 字样仅存在于 `server/dist/`、`.next/`、`electron/renderer/_next/`、`flutter/assets/web/_next/`、`tauri/web/_next/` 等构建产物，属正常跳过项，源码无残留
- **跳过范围扩充**: `packages/tauri`（无 package.json/Cargo.toml，仅 target 缓存 + 旧 web，疑似废弃）、`packages/logs`（运行时日志）
- **未改源码**: 本次仅同步文档，无源码变更
- 更新文件：根 `CLAUDE.md`（扫描状态）+ `claude/changelog.md` + `claude/overview.md` + `claude/module-responsibilities.md` + `claude/faq.md` + `packages/server/CLAUDE.md`

## 2026-07-13 — 增量核对 + MCP 拆分

- **mcp**: 原 `CLAUDE.md` 长文档拆分为 `claude/*.md`（8 个详情文件），`CLAUDE.md` 改为轻量索引；SDK 覆盖由反射自动同步（当前 39 模块）
- **server**: 修正 Team 服务文件数 9→8；`builtin-tools/` 补全为 12 文件（含 `agent-tools.ts`）；services 99→100；路由确认 42
- **web**: `components/teams/` 扩充 8→13 文件（新增 detail-panel/hover-card/list-panel/selector/management-utils + chat/team-message-card）；Store 数修正 23→44（含 workflow-editor/ 12 + search-commands/ 7 + 顶层 25）；新增 `stores/confirm.ts` + `layout/global-confirm-dialog.tsx`
- **sdk**: 模块数核对 40→39（与实际 `src/modules/` 文件数及 `index.ts` 注册数一致）；`overview.md` 模块列表修正（移除不存在的 task/modelCatalog，补全 externalImport/workflowSettings）
- 根 `CLAUDE.md`：Mermaid 图与模块表补 mcp 节点；扫描状态 9/9→10/10
- 更新文件：根 `CLAUDE.md` + `claude/changelog.md`；server `CLAUDE.md` + `claude/module-responsibilities.md` + `claude/changelog.md`；web `CLAUDE.md` + `claude/module-responsibilities.md` + `claude/changelog.md`；sdk `CLAUDE.md` + `claude/overview.md` + `claude/changelog.md`；mcp `CLAUDE.md`（重写）+ `claude/*.md`（新建 8 文件）

## 2026-07-10 — 增量更新（Team 多 Agent 协作系统）

- **shared**: 新增 `types/team.ts`（Team / TeamMembership / TeamMessage / TeamInboxItem / TeamRuntime / TeamComment + 角色与状态枚举）；类型文件 27 → 30
- **server**: 新增 Team 协作子系统 `services/team*.ts`（9 文件）+ `routes/team.ts`（3 挂载点 `/api/teams` `/api/team-inbox` `/api/team-messages`）+ `builtin-tools/team-tools.ts`；新增 `services/chat-run.ts` + `routes/chat-run.ts`；路由 40+ → 42，services 90+ → 99
- **sdk**: 新增 `modules/team.ts`（`createTeamApi`，团队/成员/消息/收件箱/运行时）；模块 39 → 40
- **web**: 新增 `app/teams/page.tsx` + `components/teams/`（8 文件）；`components/chat/`（61 文件）与 `components/sidebar/`（55 文件）大幅重构；locales 新增 teams.json
- 更新文件：根 `CLAUDE.md`（功能描述/扫描状态）、`claude/changelog.md`；server `CLAUDE.md` + `claude/public-interfaces.md` + `claude/module-responsibilities.md` + `claude/changelog.md`；web `CLAUDE.md` + `claude/public-interfaces.md` + `claude/module-responsibilities.md` + `claude/changelog.md`；sdk `CLAUDE.md` + `claude/overview.md` + `claude/changelog.md`；shared `CLAUDE.md` + `claude/overview.md` + `claude/changelog.md`

