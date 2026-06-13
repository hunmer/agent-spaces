# 入口与启动

## 根项目

- **入口**：`package.json` scripts
- **开发启动**：`pnpm dev`（并行启动 server + web）
  - server: http://localhost:3100
  - web: http://localhost:3000（自动代理 /api/* 和 /ws 到 server）
- **构建**：`pnpm build`（shared -> sdk -> server -> web -> copy）
- **Docker 构建**：`pnpm build:docker`
- **Docker 部署**：`pnpm up`（docker compose up -d --build）
- **Lint**：`pnpm lint`（pnpm -r lint）
- **发布**：`pnpm publish`（构建 shared + server 后发布到 npm）
- **清理**：`pnpm clean`

## packages/shared

- **入口文件**：`src/index.ts`
- **构建命令**：`pnpm build`（tsc 编译到 dist/）
- **消费方式**：server 和 web 通过 `import type { ... } from '@agent-spaces/shared'` 引用

## packages/sdk

- **入口文件**：`src/index.ts` -- 导出 `createSDK()` 工厂函数
- **构建命令**：`pnpm build`（tsc 编译到 dist/）
- **消费方式**：web 包 `src/lib/sdk.ts` 创建单例

## packages/server

- **入口文件**：`src/app.ts`
- **启动命令**：`pnpm dev`（tsx watch 热重载）或 `pnpm start`（编译后运行）
- **默认端口**：3100（PORT 环境变量）
- **数据目录**：`~/.agent-spaces-data`（AGENT_SPACES_DATA_DIR 环境变量）
- **启动流程**：Express 初始化 -> auth 中间件 -> 路由注册 -> HTTP Server -> WebSocket Server -> Issue 重试恢复（`issue-retry.ts`）-> 持久化通知服务恢复

## packages/web

- **入口文件**：`src/app/layout.tsx` + `src/app/page.tsx`
- **启动命令**：`pnpm dev`（自定义 server.mjs，3000 端口）
- **API 代理**：`next.config.ts` rewrites 将 `/api/*` 和 `/ws` 代理到后端
- **布局链**：ThemeProvider -> LocaleProvider -> AuthGuard -> AppShell -> CommandPalette

## packages/flutter

- **入口文件**：`lib/main.dart`
- **启动命令**：`flutter run`
- **测试命令**：`flutter test`（2 个测试文件：widget_test + webdav_url_test）
- **路由**：GoRouter（7 条路由：/ /bookmarks /settings /about /home /terminal-credentials /file-source-credentials）

## packages/templates

- **索引入口**：各子目录 `index.json`
- **索引生成**：`pnpm generate-index`
- **本地服务**：`pnpm serve`（http-server 3101 端口）

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3100 | 后端服务端口 |
| HOST | 0.0.0.0 | 后端服务监听地址 |
| AGENT_SPACES_DATA_DIR | ~/.agent-spaces-data | 数据存储目录 |
| ANTHROPIC_API_KEY | - | ClaudeCodeRuntime API Key |
| CODEX_API_KEY / OPENAI_API_KEY | - | CodexRuntime API Key |
| NEXT_PUBLIC_WS_PORT | 3100 | 前端 WebSocket 连接端口 |
| SERVER_URL | http://localhost:3100 | 前端 SSR 连接后端 URL |
| CORS_ORIGIN | * | CORS 允许的来源 |
