# Changelog

> 本文件只记录"AI 上下文索引"的生成/更新历史，最近 5 条倒序排列。

## 2026-07-18 — SkyOffice 模块合并 + Grok 运行时

- **背景**: 自 2026-07-16 以来，SkyOffice（多 Agent 可视化办公空间，Colyseus 房间服务）从独立仓库迁移并深度合并进主后端单进程；新增 Grok 运行时适配器
- **SkyOffice 后端** (`packages/server/src/skyoffice/`): Colyseus 0.15 房间服务，因 colyseus 纯 CJS 采用**独立 tsconfig + CJS 隔离编译**（编译到 `dist/skyoffice/`，靠 `dist/skyoffice/package.json` 覆盖上层 ESM）；主后端 `app.ts` 顶部 `import 'reflect-metadata'` + `createRequire` 桥接加载；三路 upgrade 冲突由统一 dispatcher 五路分流（`/ws` `/ws/speech` `/ws/lsp/typescript` `/agent-ws` + Colyseus 委托）
- **SkyOffice 前端** (`packages/web/src/features/skyoffice/`): Phaser + React 集成进主 Web SPA（scenes/components/stores/services），非独立 Vite 项目
- **skyoffice-web 空壳** (`packages/skyoffice-web/`): 仅有 `.gitignore` + 空 `src/`，原 Vite 前端未迁入，标记为**未启用/占位**
- **SkyOffice API**: `/api/skyoffice/rooms`（房间 CRUD，自管 per-room token 鉴权，绕开主全局 Bearer）、`/api/skyoffice/map`（地图数据）、`/skyoffice/colyseus`（Colyseus monitor，**无鉴权**）、Agent WS 路径 `/agent-ws?roomId=...&token=...`；`SKYOFFICE_ENABLED=false` 可关闭
- **Grok 运行时** (`packages/server/src/adapters/grok-runtime.ts`): `AgentRuntimeKind` 新增 `'grok'`，已在 `routes/runtime.ts` 的 `RUNTIME_DESCRIPTORS` 登记（descriptor 8 → 9，label `'Grok CLI'`，含 Windows `.grok/bin/grok.exe` 路径探测）；测试位于 `src/adapters/grok-runtime.test.ts`（非 `test/`）
- **其他**: `packages/electron`（main.ts/preload/server-launcher 更新）、`packages/sdk`（code-favorites/mini-apps 模块更新）、新增 `packages/logs/`（运行时日志，无 package.json，纳入跳过）
- 更新文件：根 `CLAUDE.md`（模块索引 + 扫描状态）+ `claude/changelog.md` + `claude/module-responsibilities.md` + `claude/overview.md` + `claude/public-interfaces.md` + `claude/faq.md` + `claude/testing-and-quality.md`；server `CLAUDE.md` + `claude/module-responsibilities.md` + `claude/public-interfaces.md` + `claude/changelog.md`

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

## 2026-07-06 — 增量更新（Runtime 管理 + Issue 系统 + Notification Hub）

- **server**: 新增 `routes/runtime.ts`（CLI 发现 / SDK 安装 / 版本检测，挂载于 `/api/runtime`，定义 8 个 `RuntimeDescriptor`：claude-code/codex/gemini-cli/hermes/pi/claude-code-sdk/codex-sdk/open-agent-sdk）
- **server**: `adapters/claude-code-runtime/` 成熟为独立子模块（adapter-pool / anthropic-bridge / protocol-converter / message-format / sdk-config）
- **server**: `services/notification-hub/` 多通道推送成型（wechat-adapter / lark-adapter / bot-agent / bot-commands）
- **server**: Issue 系统闭环（`services/issue.ts` + `issue-comment.ts` + `issue-retry.ts` + `agents/issue-agent-runner.ts` + `storage/issue-store.ts`）
- **web**: 新增 `components/issue/`（10 文件：列表/详情/评论/工作流面板）、`components/home/usage-dashboard*`（用量仪表盘 + 会话详情对话框）
- **shared**: `types/issue.ts` 定型（IssueStatus / Issue / IssueComment / CreateIssueInput）
- **sdk**: `issue` 模块扩至 11 方法（CRUD + start/resume/continue/interrupt + 评论管理）
- 更新文件：根 `CLAUDE.md` 扫描状态、`claude/changelog.md`、`claude/module-responsibilities.md`、`claude/public-interfaces.md`；server `CLAUDE.md`、`claude/ai-adapters.md`、`claude/changelog.md`、`claude/public-interfaces.md`；web `CLAUDE.md`、`claude/public-interfaces.md`、`claude/changelog.md`；shared/sdk/templates 各 `claude/changelog.md`

