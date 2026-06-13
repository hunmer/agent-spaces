# 编码约定

## 通用约定

- TypeScript strict 模式，ESNext 模块
- 后端使用 ESM（`"type": "module"`），导入路径带 `.js` 后缀
- 前端使用 Next.js App Router + `"use client"` 指令
- 状态管理统一使用 Zustand（`create` 函数式写法）
- 组件使用函数式组件 + hooks
- CSS 使用 TailwindCSS utility classes
- UI 组件基于 shadcn/ui（base-nova 风格）
- API 路由按资源分组，遵循 RESTful 规则
- 前端 API 调用统一通过 @agent-spaces/sdk
- 认证使用 Bearer Token
- 时间戳使用 ISO 字符串（Workflow 子树用 Unix 毫秒）
- 状态字段使用联合字面量类型（非 `enum`）

## 后端约定

- JSON body 限制 50MB
- 路由文件放在 `src/routes/`
- 服务层文件放在 `src/services/`
- 存储层文件放在 `src/storage/`
- 适配器文件放在 `src/adapters/`
- WebSocket 事件命名：`domain.action`（如 `terminal.create`, `agent.status_changed`, `miniApp.configChanged`）
- JSON 持久化使用 `json-store.ts` 通用工具（`readJsonFile` / `writeJsonFile` / `ensureDir` / `getDataDir`）
- SQLite 使用 `better-sqlite3`（mini-app-db）+ `node:sqlite`（Agent Usage）
- zod 用于后端请求校验
- 越界保护：文件路径 `safeSrcPath`、SQL `checkSql` + `validateDbName`

## Mini-app 沙箱约定

- 沙箱服务（`src/services/*.js`）和 API（`src/api.js`）不依赖外部模块
- 编译时剥离 import 行，ESM `export default` 转 CJS `module.exports =`
- `new Function('module', 'exports', code)` 在沙箱求值
- 配置读写通过 `MiniAppServiceContext`（readConfig / writeConfig / updateConfig），写后自动广播 `miniApp.configChanged`
- 客户端 RPC：服务端 `requestMiniAppClient` 广播 `miniApp.clientRequest`，客户端响应 `miniApp.clientResponse`

## 前端约定

- 页面放在 `src/app/` 下（Next.js App Router）
- 组件放在 `src/components/` 下按功能域分组
- Store 放在 `src/stores/`
- 工具库放在 `src/lib/`
- i18n 使用 next-intl，翻译文件按命名空间拆分（34 命名空间）
- WebSocket 客户端使用 `lib/ws.ts` 中的 `WorkspaceWS` 类
- 路径别名：`@/*` -> `./src/*`

## 命名规范

- 文件名：kebab-case（`agent-runtime.ts`、`use-workflow-editor.ts`）
- 组件文件名：kebab-case（`code-editor.tsx`、`git-panel.tsx`）
- Store 文件名：kebab-case（`workflow-editor.ts`、`content-usage-report.ts`）
- 目录名：kebab-case（`notification-hub/`、`code-favorites/`）
- 路由目录名：kebab-case 或 `[dynamic]`
- i18n 命名空间：camelCase（`commandPalette`、`outputStyles`、`mini-apps`）

## 数据持久化

- JSON 文件：Workspace/Issue/Task/Channel/Message/Workflow/Command/Subscription/MiniApp 等
- SQLite：Agent Session/Usage + Kanban Board + DocNode Database + Mini-app DB
- 存储根目录：`~/.agent-spaces-data/`
- 工作空间元数据：项目目录下 `.agentspace/`
- Mini-app 项目数据：`~/.agent-spaces-data/mini-apps/{projectId}/`
