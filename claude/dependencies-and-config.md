# 依赖与配置

## 关键依赖

### packages/web
- **Next.js 16.2.4** + React 19.2.4
- **@agent-spaces/sdk** (workspace 依赖)
- Monaco Editor 0.55.1 + monaco-languageclient
- ReactFlow (xyflow) 12.10.2
- Zustand 5.0.12
- Radix UI + shadcn/ui + Tailwind CSS 4
- xterm.js 6.0.0
- next-intl 4.11.0
- Dexie 4.4.3（IndexedDB）
- Mermaid 11.15.0
- recharts 3.8.0

### packages/server
- **Express 5.1.0** + ws 8.18.2
- **@agent-spaces/shared** (workspace 依赖)
- better-sqlite3 12.10.0
- LangChain 1.4.0 + @langchain/anthropic + @langchain/openai + @langchain/google-genai
- @anthropic-ai/claude-agent-sdk 0.2.126
- @openai/codex-sdk 0.128.0
- @modelcontextprotocol/sdk 1.29.0
- @codeany/open-agent-sdk 0.2.1
- node-pty 1.1.0
- simple-git 3.36.0
- @larksuiteoapi/node-sdk 1.62.1
- zod 4.0.0
- node-cron 4.2.1

### packages/electron
- **Electron 31**
- @electron-toolkit/utils
- electron-store + electron-updater
- @agent-spaces/shared (workspace 依赖)

### packages/sdk
- @agent-spaces/shared (workspace 依赖)
- 无外部运行时依赖

## 配置文件

| 文件 | 用途 |
|---|---|
| `pnpm-workspace.yaml` | pnpm workspace 定义 |
| `docker-compose.yml` | Server Docker 配置 |
| `.github/workflows/docker-build.yml` | Docker 镜像构建 CI |
| `.github/workflows/release.yml` | GitHub Release |
| `.github/workflows/deploy-docs.yml` | 文档部署 |
| `AGENTS.md` | AI Agent 工作指令 |
| `packages/web/next.config.ts` | Next.js 配置 |
| `packages/web/server.mjs` | Web dev server |
| `packages/web/eslint.config.mjs` | Web ESLint |
| `packages/electron/main.ts` | Electron 主进程入口 |
| `packages/templates/pack-mini-apps.mjs` | Mini App 打包 |
| `packages/templates/generate-index.mjs` | 索引生成 |
| `documents/docusaurus.config.ts` | Docusaurus 配置 |

## 环境变量

### Server
| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3100 | 服务端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `AGENT_SPACES_DATA_DIR` | ~/.agent-spaces-data | 数据目录 |
| `CORS_ORIGIN` | * | CORS 允许源 |
| `SERVER_URL` | http://localhost:3100 | Web 代理目标 |

### Web
| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 开发端口 |
| `HOSTNAME` | 0.0.0.0 | 监听地址 |
| `NEXT_STATIC_EXPORT` | (未设置) | 设为 1 启用静态导出 |
| `SERVER_URL` | http://localhost:3100 | API 代理目标 |
