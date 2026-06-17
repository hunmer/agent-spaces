[根目录](../../CLAUDE.md) > [packages](../) > **web**

# @agent-spaces/web

Next.js 16 前端应用，提供多 Agent 协同编程平台的用户界面。290+ 源文件，44 个 Zustand Store 文件（含 workflow-editor/ 12 子文件 + search-commands/ 7 子文件），34 个 i18n 命名空间，200+ 组件。包含登录认证、工作空间管理、Monaco 代码编辑器（TypeScript LSP）、xterm.js 终端、TipTap 富文本聊天、@xyflow/react Workflow DAG 编辑器、Mini-app 编辑器、Git 面板、Issue 管理、Kanban 看板、文档数据库、用量仪表盘、Command Palette 等核心功能。通过 Zustand 管理全局状态，WebSocket 实现实时数据同步。

**重要提示**：本项目使用的 Next.js 版本存在 Breaking Changes，详见 `AGENTS.md`。UI 设计规范参考 `DESIGN.md`。

## 约定的规则

- Next.js App Router，`"use client"` 指令
- Zustand `create` 函数式写法管理状态
- CSS 使用 TailwindCSS，UI 组件基于 shadcn/ui@base-ui（base-nova 风格）
- API 调用统一通过 @agent-spaces/sdk（`src/lib/sdk.ts` 单例）
- i18n 使用 next-intl，翻译文件按命名空间拆分（`src/locales/{en,zh}/*.json`，34 命名空间）
- 组件按功能域分组（`components/chat/`、`components/git/` 等）
- 路径别名：`@/*` -> `./src/*`
- 字体：DM Sans（UI）、Outfit（标题）、Poppins（中间层标题）

## 文件索引

| 文件 | 说明 |
|------|------|
| [claude/overview.md](claude/overview.md) | 总览、核心功能、布局架构、技术栈 |
| [claude/conventions.md](claude/conventions.md) | 编码约定、组件组织、API 调用规范 |
| [claude/stores.md](claude/stores.md) | 44 个 Zustand Store 文件索引（含子目录） |
| [claude/component-groups.md](claude/component-groups.md) | 组件目录索引（按功能域分组，20+ 子目录） |
| [claude/lib-index.md](claude/lib-index.md) | 工具库索引（src/lib/ 下 37 文件） |
| [claude/changelog.md](claude/changelog.md) | 变更记录 |

## 入口与启动

- **入口文件**：`src/app/layout.tsx`（根布局） + `src/app/page.tsx`（首页）
- **启动命令**：`pnpm dev`（自定义 server.mjs，3000 端口）
- **构建命令**：`pnpm build`
- **API 代理**：`next.config.ts` rewrites -> localhost:3100
- **布局链**：ThemeProvider -> LocaleProvider -> AuthGuard -> AppShell -> CommandPalette

## 关键目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `src/app/` | 29 | Next.js 页面（login/settings/workflows/chat/workspace/mini-apps） |
| `src/components/` | 200+ | React 组件（按功能域分组，20+ 子目录） |
| `src/stores/` | 44 | Zustand Store（含 workflow-editor/ 12 + search-commands/ 7） |
| `src/lib/` | 37 | 工具库（含 workflow-nodes/ 10 + monaco-* 5） |
| `src/locales/` | 68 | i18n 翻译（34 命名空间 x 2 语言） |
| `src/hooks/` | 4 | React Hooks |

## 组件分组概览

| 分组 | 文件数 | 说明 |
|------|--------|------|
| workflow/ | 86 | DAG 编辑器（画布/节点/属性/执行/display-node-views） |
| sidebar/ | 56 | 侧边栏（含 settings/ 14 + skills-dialog/ 10） |
| chat/ | 40 | 聊天（消息/输入/成员/工具时间线/只读代码块） |
| editor/ | 21 | Monaco 编辑器（含移动端适配/搜索/收藏） |
| git/ | 20 | Git 面板（提交/差异/日志/设置/gitignore） |
| ui/ | 28 | shadcn/ui 基础组件 |
| common/ | 15 | 通用组件（picker/dialog/floating-ball/console） |
| database/ | 15 | 文档数据库（Notion 编辑器/向量搜索/AI 对话） |
| issue/ | 13 | 议题管理 |
| layout/ | 13 | 布局（app-shell/workspace-shell/command-palette/auth-guard） |
| home/ | 10 | 首页（用量仪表盘/订阅面板） |
| terminal/ | 8 | 终端 |
| composer/ | 8 | Composer 编辑器（TipTap 扩展） |
| timeline/ | 4 | 版本更新日志 |
| settings/ | 5 | 设置面板 |
| kanban/ | 5 | Kanban 看板 |
| worktree/ | 2 | Worktree 面板 |

## 扫描状态

- **更新时间**：2026-06-13 16:57:29
- **已扫描范围**：全部 Store、主要组件目录、工具库、页面路由、i18n 命名空间、新增组件组（home/timeline/layout/common/settings）
- **覆盖率**：约 92%
- **主要缺口**：`components/sidebar/` 56 文件未逐一展开、`components/workflow/` 86 文件中部分 hook/utils 未深抽
