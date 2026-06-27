# packages/web (`@agent-spaces/web`)

Next.js 16 前端 SPA，React 19 + Zustand 状态管理。提供聊天、代码编辑器（Monaco + LSP）、Workflow 可视化编辑器（ReactFlow）、Mini Apps、设置管理等界面。支持 `NEXT_STATIC_EXPORT=1` 纯静态导出，嵌入 Electron/Flutter 桌面/移动壳。

## 约定

- 通过 `@agent-spaces/sdk` 调用后端 API，不直接 fetch。
- 组件按功能域放在 `src/components/` 子目录。
- 状态集中在 `src/stores/`，使用 Zustand。
- 国际化用 next-intl，配置在 `src/i18n/`。

## 文件索引

| 文件 | 用途 | 何时阅读 |
|---|---|---|
| [架构总览](claude/overview.md) | 架构、运行模式、设计取舍 | 首次接触 |
| [入口与启动](claude/entrypoints.md) | server.mjs、next.config.ts | 需要启动/构建 |
| [页面路由](claude/public-interfaces.md) | 所有 page.tsx 路由 | 需要找页面 |
| [组件与状态](claude/module-responsibilities.md) | 组件目录、Store 列表 | 需要定位组件/状态 |
| [依赖与配置](claude/dependencies-and-config.md) | UI 库、构建配置 | 排查依赖问题 |
| [文件索引](claude/file-map.md) | 完整目录结构 | 需要找文件 |
| [变更记录](claude/changelog.md) | 更新历史 | 了解变更 |

## 扫描状态

- **更新时间**: 2026-06-27
- **已扫描**: package.json、入口文件、路由、组件目录、Store 列表
- **跳过**: node_modules, .next, public/monaco
