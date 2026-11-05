# packages/web (`@agent-spaces/web`)

## 约定

- 通过 `@agent-spaces/sdk` 调用后端 API，不直接 fetch。
- 组件按功能域放在 `src/components/` 子目录（chat/workflow/issue/home/sidebar/settings/cli/...）。
- 状态集中在 `src/stores/`，使用 Zustand（26 顶层 store + workflow-editor/ 12 + search-commands/ 7，含 `issue.ts` / `cli-sessions.ts`）。
- 国际化用 next-intl，配置在 `src/i18n/`，文案在 `src/locales/{en,zh}/`。
- 设置页子路由在 `src/app/settings/*`，对应 `components/sidebar/settings/*` 各 Tab。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [架构总览](claude/overview.md) | 架构、运行模式、设计取舍 | 首次接触 |
| [入口与启动](claude/entrypoints.md) | server.mjs、next.config.ts | 需要启动/构建 |
| [页面路由](claude/public-interfaces.md) | 所有 page.tsx 路由 | 需要找页面 |
| [组件与状态](claude/module-responsibilities.md) | 组件目录、Store 列表 | 需要定位组件/状态 |
| [Chat 架构](claude/chat-architecture.md) | 聊天组件链路、消息渲染、数据流 | 改聊天/消息渲染 |
| [依赖与配置](claude/dependencies-and-config.md) | UI 库、构建配置 | 排查依赖问题 |
| [文件索引](claude/file-map.md) | 完整目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-07-27
- **本期变更**: 新增 `components/cli/`（cli-panel/cli-launcher/cli-session-list）+ `stores/cli-sessions.ts` + `lib/cli-panel-layout.ts` + `lib/runtime-cli-settings.ts` + `lib/cli-icons.ts` + `locales/{en,zh}/cli.json`；`lib/ui-exports.ts` 高频重构
- **跳过**: node_modules, .next, out, public/monaco
