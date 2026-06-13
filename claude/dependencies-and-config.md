# 依赖与配置

## 依赖关系图

```
shared (无依赖)
  ^
  |
sdk --> shared
  ^
  |
web --> sdk --> shared
  |
  +--> [API 代理] --> server --> shared
  ^
  |
flutter --> [InAppWebView] --> web
  |
  +--> [HTTP/WS] --> server

templates (无依赖，纯静态资源)
dom-inspector-hook (无依赖，独立 npm 包)
```

## 根项目依赖

- `concurrently` -- 并行启动 server + web
- `cross-env` -- 跨平台环境变量
- `typescript` 5.8+ -- 编译

## server 关键依赖

| 依赖 | 用途 |
|------|------|
| express (v5) | HTTP 服务与路由 |
| ws | WebSocket 服务 |
| node-pty | PTY 终端管理 |
| simple-git | Git 操作封装 |
| zod (v4) | Schema 校验 |
| better-sqlite3 | SQLite 存储（mini-app-db） |
| node:sqlite | SQLite 存储（Agent Usage） |
| yauzl | ZIP 解压（mini-app 导入） |
| multer | 文件上传（mini-app 资源） |
| uuid | ID 生成 |
| @codeany/open-agent-sdk | OpenAgent 运行时 |
| @anthropic-ai/claude-agent-sdk | Claude Code 运行时 |
| @openai/codex-sdk | Codex 运行时 |
| langchain + @langchain/* | LangChain 运行时 |
| @larksuiteoapi/node-sdk | 飞书 Bot SDK |
| @modelcontextprotocol/sdk | MCP SDK |
| typescript-language-server | TypeScript LSP |
| vscode-ws-jsonrpc | LSP WebSocket 桥接 |

## web 关键依赖

| 依赖 | 用途 |
|------|------|
| next (16.2) | React 全栈框架 |
| react / react-dom (19.2) | UI 库 |
| flexlayout-react | 可拖拽面板布局 |
| @xyflow/react + @dagrejs/dagre | DAG 编辑器 |
| zustand (5) | 状态管理 |
| @monaco-editor/react + monaco-languageclient | 代码编辑器 + LSP |
| @xterm/xterm | 终端模拟器 |
| @tiptap/* | 富文本编辑器 |
| next-intl | i18n |
| cmdk | Command Palette |
| shadcn + radix-ui | UI 组件 |
| recharts | 图表（用量仪表盘） |

## flutter 关键依赖

| 依赖 | 用途 |
|------|------|
| flutter_inappwebview | WebView 引擎 |
| flutter_riverpod | 状态管理 |
| go_router | 路由 |
| awesome_notifications | 本地通知 |
| docking | 多窗口布局 |
| dartssh2 | SSH 终端 |
| easy_localization | i18n |
| shared_preferences | 持久化 |

## 构建顺序

1. `shared` -- tsc 编译
2. `sdk` -- tsc 编译（依赖 shared）
3. `server` -- tsc 编译（依赖 shared）
4. `web` -- next build（依赖 sdk -> shared）
5. `copy-web.mjs` / `copy-package.mjs` -- 拷贝产物

## 配置文件

| 文件 | 用途 |
|------|------|
| `package.json` | 根项目配置 + scripts（v0.2.6） |
| `pnpm-workspace.yaml` | pnpm workspace 定义 |
| `.gitignore` | Git 忽略规则 |
| `packages/*/tsconfig.json` | TypeScript 配置 |
| `packages/web/next.config.ts` | Next.js 配置 |
| `packages/web/components.json` | shadcn/ui 配置 |
| `packages/flutter/pubspec.yaml` | Flutter 依赖配置 |
| `Dockerfile.server` | Docker 构建文件 |
| `docker-compose.yml` | Docker Compose 配置 |
