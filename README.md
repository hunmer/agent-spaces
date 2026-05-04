# Agent Spaces

本地多 Agent 协同编程平台。创建工作空间、绑定代码目录，通过调度者、策划者、执行者、审核者四种 Agent 角色实现任务的自动分发、代码修改、审核与合并。

![preview](screenshots/preview.jpg)

## 功能

- **多 Agent 编排** — Scheduler → Planner → Executor → Reviewer 自动化链路，支持任务依赖调度
- **三种 Agent 运行时** — OpenAgentSdk / Claude Code / OpenAI Codex，通过配置切换
- **IDE 级别前端** — Monaco 代码编辑器、xterm.js 终端、FlexLayout 可拖拽布局
- **结构化 AI 消息** — 工具调用链、执行详情、代码 Diff 实时渲染
- **频道聊天** — TipTap 富文本编辑，@mention 直接触发 Agent 执行
- **议题管理** — Issue 创建、状态流转、评论跟踪
- **Git 集成** — 仓库操作面板，分支管理
- **LLM 管理** — 多模型配置，API Key 管理
- **JSON 文件持久化** — 无需数据库，数据存储在 `~/.agent-spaces-data/`

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + TailwindCSS 4 + shadcn/ui + Zustand |
| 编辑器 | Monaco Editor + xterm.js |
| 富文本 | TipTap |
| 布局 | FlexLayout React |
| 后端 | Express 5 + WebSocket (ws) + node-pty |
| Git | simple-git |
| 语言 | TypeScript 5.8+ |
| 包管理 | pnpm monorepo |

## 前置要求

- Node.js >= 20
- pnpm >= 9

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（并行启动 server + web）
pnpm dev
```

- 前端：http://localhost:3000
- 后端：http://localhost:3100

## 构建

```bash
pnpm build
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3100` | 后端端口 |
| `AGENT_SPACES_DATA_DIR` | `~/.agent-spaces-data` | 数据目录 |
| `ANTHROPIC_API_KEY` | - | Claude Code 运行时 API Key |
| `ANTHROPIC_BASE_URL` | - | Claude Code 运行时 API Base URL |
| `CODEX_API_KEY` / `OPENAI_API_KEY` | - | Codex 运行时 API Key |
| `NEXT_PUBLIC_WS_PORT` | `3100` | WebSocket 端口 |

## 项目结构

```
agent-spaces/
├── packages/shared/    # 前后端共享类型定义
├── packages/server/    # Express API + Agent 编排 + WebSocket
└── packages/web/       # Next.js 前端
```

## License

Private
