# Web 模块 — 依赖与配置

## 关键运行时依赖

| 依赖 | 版本 | 用途 |
|---|---|---|
| `next` | 16.2.4 | 框架 |
| `react` / `react-dom` | 19.2.4 | UI 库 |
| `@agent-spaces/sdk` | workspace:* | API 层 |
| `zustand` | 5.0.12 | 状态管理 |
| `@xyflow/react` | 12.10.2 | 流程图 |
| `monaco-editor` | 0.55.1 | 代码编辑器 |
| `@tiptap/*` | 3.22+ | 富文本编辑器 |
| `@xterm/xterm` | 6.0.0 | 终端 |
| `cmdk` | 1.1.1 | 命令面板 |
| `mermaid` | 11.15.0 | 图表渲染 |
| `recharts` | 3.8.0 | 数据可视化 |
| `dexie` | 4.4.3 | IndexedDB |
| `next-intl` | 4.11.0 | 国际化 |
| `radix-ui` | 1.4.3 | UI 原子组件 |
| `tailwind-merge` | 3.5.0 | CSS 类合并 |

## 配置文件

| 文件 | 用途 |
|---|---|
| `next.config.ts` | Next.js（rewrites、静态导出、Monaco 缓存策略） |
| `server.mjs` | Dev server |
| `eslint.config.mjs` | ESLint |
| `postcss.config.mjs` | PostCSS |
| `inspect-source-loader.cjs` | Webpack dev loader（react-dev-inspector） |
