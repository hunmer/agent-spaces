# Changelog

> 本文件只记录"AI 上下文索引"的生成/更新历史，最近 5 条倒序排列。

## 2026-07-27 — Gemini CLI 运行时 + 多 CLI 会话面板 + TS LSP WS 下线

- **背景**: 自 2026-07-18 以来共 107 个 "fix" commit，message 无信息量，需通过实际代码内容判断语义。本期结构性新增极少，集中在三个方向。
- **Gemini CLI 运行时** (`packages/server/src/adapters/gemini-cli-runtime.ts`，422 行): 新增 `GeminiCliRuntime` 实现 `AgentRuntime` 接口，spawn `gemini-cli` 子进程 + stdout JSON 事件解析、附件上下文准备、权限模式、resume 会话；`AgentRuntimeKind` 新增 `'gemini-cli'`；测试 `adapters/gemini-cli-runtime.test.ts`。至此 CLI 适配器覆盖 claude-code/codex/grok/hermes/pi/gemini-cli。
- **`RUNTIME_DESCRIPTORS` 扩张** (`routes/runtime.ts`): 从原 9 个 descriptor 扩至 **20 个 id**——9 个有独立 `runtimeKind` 适配器（claude-code/codex/grok/gemini-cli/hermes/pi/claude-code-sdk/codex-sdk/open-agent-sdk）+ **11 个别名复用既有 runtimeKind**（openclaw/omp/opencode/qwen/cursor/kimi/kiro/kilocode/antigravity/xiaomimimo/githubcopilot）。
- **多 CLI 会话面板** (`packages/web/src/components/cli/`): 全新功能。`cli-panel.tsx` + `cli-launcher.tsx` + `cli-session-list.tsx` + `stores/cli-sessions.ts` + `lib/cli-panel-layout.ts` + `lib/runtime-cli-settings.ts` + `lib/cli-icons.ts` + `locales/{en,zh}/cli.json`。每会话的 flex-layout 独立持久化到 localStorage（`agent-spaces:cli-panel:<id>:layout`）。
- **TypeScript LSP WebSocket 下线**: `/ws/lsp/typescript` 端点已从 `app.ts` 移除，`ws/typescript-lsp.ts` 文件已删除。原五路 upgrade dispatcher 变为四路（`/ws`、`/ws/speech`、`/agent-ws` + Colyseus 委托）。
- **Mini-app 子系统迭代**: `ws/mini-app-channels.ts`（新增 `miniApp.taskStop` 事件，前端凭 taskId 主动中断 mini-app agent 执行）；`services/mini-app-services.ts` 新增 `startServicesWatcher`（app.ts 启动调用，服务文件热监听）；`services/builtin-tools/mini-app-tools.ts` 本期改动 6 次（全仓库最高）。
- **已清理模块**: `packages/tauri`（原疑似废弃，本期确认已删除）、`packages/skyoffice-web`（原空壳占位，本期确认已删除）。
- **文档修正**: server `claude/public-interfaces.md` 移除过期 `/ws/lsp/typescript` 行 + 2 个虚构路由（`routes/code-favorites.ts` `routes/task.ts` 实际不存在）。
- 更新文件：根 `CLAUDE.md`（模块索引移除 skyoffice-web、扫描状态）+ `claude/changelog.md` + `claude/overview.md` + `claude/module-responsibilities.md`；server `CLAUDE.md` + `claude/ai-adapters.md` + `claude/public-interfaces.md` + `claude/module-responsibilities.md` + `claude/changelog.md`；web `CLAUDE.md` + `claude/module-responsibilities.md` + `claude/changelog.md`
- **未改源码**: 本次仅同步文档，无源码变更。

## 2026-07-18 — SkyOffice 模块合并 + Grok 运行时

- **背景**: 自 2026-07-16 以来，SkyOffice（多 Agent 可视化办公空间，Colyseus 房间服务）从独立仓库迁移并深度合并进主后端单进程；新增 Grok 运行时适配器
- **SkyOffice 后端** (`packages/server/src/skyoffice/`): Colyseus 0.15 房间服务，因 colyseus 纯 CJS 采用**独立 tsconfig + CJS 隔离编译**（编译到 `dist/skyoffice/`，靠 `dist/skyoffice/package.json` 覆盖上层 ESM）；主后端 `app.ts` 顶部 `import 'reflect-metadata'` + `createRequire` 桥接加载；三路 upgrade 冲突由统一 dispatcher 五路分流（`/ws` `/ws/speech` `/ws/lsp/typescript` `/agent-ws` + Colyseus 委托）
- **SkyOffice 前端** (`packages/web/src/features/skyoffice/`): Phaser + React 集成进主 Web SPA（scenes/components/stores/services），非独立 Vite 项目
- **skyoffice-web 空壳** (`packages/skyoffice-web/`): 仅有 `.gitignore` + 空 `src/`，原 Vite 前端未迁入，标记为**未启用/占位**
- **SkyOffice API**: `/api/skyoffice/rooms`（房间 CRUD，自管 per-room token 鉴权，绕开主全局 Bearer）、`/api/skyoffice/map`（地图数据）、`/skyoffice/colyseus`（Colyseus monitor，**无鉴权**）、Agent WS 路径 `/agent-ws?roomId=...&token=...`；`SKYOFFICE_ENABLED=false` 可关闭
- **Grok 运行时** (`packages/server/src/adapters/grok-runtime.ts`): `AgentRuntimeKind` 新增 `'grok'`，已在 `routes/runtime.ts` 的 `RUNTIME_DESCRIPTORS` 登记（descriptor 8 → 9，label `'Grok CLI'`，含 Windows `.grok/bin/grok.exe` 路径探测）；测试位于 `src/adapters/grok-runtime.test.ts`（非 `test/`）
- **其他**: `packages/electron`（main.ts/preload/server-launcher 更新）、`packages/sdk`（code-favorites/mini-apps 模块更新）、新增 `packages/logs/`（运行时日志，无 package.json，纳入跳过）
- 更新文件：根 `CLAUDE.md`（模块索引 + 扫描状态）+ `claude/changelog.md` + `claude/module-responsibilities.md` + `claude/overview.md` + `claude/public-interfaces.md` + `claude/faq.md` + `claude/testing-and-quality.md`；server `CLAUDE.md` + `claude/module-responsibilities.md` + `claude/public-interfaces.md` + `claude/changelog.md`
- **深挖补充（同日）**: 精读 SkyOffice 房间全链路（SkyOffice.ts/OfficeState.ts/Bridge.ts）+ Grok runtime 全量（345 行）；server 新建 `claude/skyoffice.md`（双源实体模型/Bridge dispatch 路由/椅子占用/广播协议）+ `claude/grok-runtime.md`（CLI 参数/JSON 事件 schema/config.toml/backend 归一化）；server `CLAUDE.md` 文件索引 +2 行

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

