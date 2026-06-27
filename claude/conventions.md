# 开发约定

## 包管理

- 使用 **pnpm** workspace monorepo。
- 根目录 `pnpm-workspace.yaml` 定义 `packages/*` 和 `documents`。
- 包间依赖使用 `workspace:*` 协议。

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发（Web + Server 并行）
pnpm --filter @agent-spaces/web dev      # Web 前端 :3000
pnpm --filter @agent-spaces/server dev    # Server :3100

# 构建
pnpm --filter @agent-spaces/web build     # Next.js 构建
pnpm --filter @agent-spaces/server build  # tsc 编译
pnpm run copy-package                     # 为 Docker/发布准备 dist/package.json
pnpm run copy-web                         # 复制 Web 静态输出到 Server/Electron/Flutter

# Docker
docker compose up                          # 启动 Server 容器

# 测试
pnpm --filter @agent-spaces/server test    # 运行 Server 测试

# 代码检查
pnpm --filter @agent-spaces/web lint       # ESLint
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Next.js 16 + React 19 |
| 状态管理 | Zustand |
| UI 组件 | Radix UI + shadcn/ui + Tailwind CSS 4 |
| 编辑器 | Monaco Editor |
| 图表/流程图 | ReactFlow (xyflow) + Mermaid |
| 后端框架 | Express 5 |
| 数据库 | SQLite (better-sqlite3) |
| AI SDK | LangChain, Claude Agent SDK, OpenAI Codex SDK, MCP SDK |
| 实时通信 | WebSocket (ws) |
| 桌面 | Electron 31 |
| 移动 | Flutter (WebView 嵌入) |
| 文档 | Docusaurus 3 |
| 国际化 | next-intl (Web), easy_localization (Flutter) |

## 代码风格

- TypeScript strict mode。
- ESM 优先 (`"type": "module"`)。
- 组件目录按功能域划分（chat/editor/workflow/settings/...）。
- Store 文件集中在 `src/stores/`。

## 禁止事项

- 不要在 `packages/web/` 中直接调用后端 API，必须通过 `@agent-spaces/sdk`。
- 不要修改 `packages/server/agent-spaces-data/`（运行时数据目录，非源码）。
- 不要在 AGENTS.md 或 CLAUDE.md 中写入大量详情，详情放 `claude/*.md`。
