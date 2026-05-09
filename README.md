# Agent Spaces

本地多 Agent 协同编程平台。创建工作空间、绑定代码目录，通过可视化 Workflow 编辑器编排 Agent 执行流程，或在频道聊天中 @mention Agent 直接触发执行。支持六种 Agent 角色、三种 Agent 运行时、飞书/企微 Bot 通知、用量统计仪表盘、中英文切换。

![preview](screenshots/preview.jpg)

## 功能

- **可视化 Workflow 编排** — DAG 拓扑编辑器，拖拽 Agent 节点、连线定义依赖，替代硬编码 pipeline
- **六种 Agent 角色** — agent / scheduler / task_creator / bot + 自定义角色，各司其职
- **三种 Agent 运行时** — OpenAgentSdk / Claude Code / OpenAI Codex，通过配置切换
- **IDE 级别前端** — Monaco 代码编辑器、xterm.js 终端、FlexLayout 可拖拽布局
- **结构化 AI 消息** — 工具调用链、执行详情、代码 Diff 实时渲染
- **频道聊天** — TipTap 富文本编辑，@mention 直接触发 Agent 执行
- **议题管理** — Issue 创建、选择 Workflow 模板、自动编排 Task 执行
- **Git 集成** — 仓库操作面板，分支管理，Commit Agent 自动提交
- **通知中心** — 飞书/企业微信 Bot 推送 + Native 通知（Tauri/Browser），远程操控
- **LLM 管理** — 多模型配置，API Key 管理，Anthropic Bridge 协议中转
- **用量统计仪表盘** — Token 消耗趋势、费用估算、按模型统计
- **i18n 国际化** — 中英文切换，52 个组件已完成改造
- **多服务器支持** — 配置和切换多个后端服务器实例
- **认证系统** — 基于 Secret Key 的 Bearer Token 认证
- **JSON 文件持久化 + SQLite** — 无需外部数据库

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | >= 20 |
| 包管理 | pnpm | >= 9 |
| 语言 | TypeScript | 5.8+ |
| 前端框架 | Next.js | 16 (App Router) |
| UI 库 | shadcn/ui + TailwindCSS 4 | - |
| 布局引擎 | FlexLayout React | 0.9 |
| DAG 编辑器 | @xyflow/react + @dagrejs/dagre | 12.10 / 3.0 |
| 状态管理 | Zustand | 5 |
| 代码编辑 | Monaco Editor | 4.7 |
| 终端 | xterm.js | 6 |
| 富文本编辑 | TipTap | 3.22 |
| i18n | next-intl | 4.11 |
| 后端框架 | Express | 5 |
| WebSocket | ws | 8 |
| PTY | node-pty | 1.1 |
| Git 操作 | simple-git | 3.36 |
| 数据库 | node:sqlite (SQLite) | 内置 |
| Schema 校验 | zod | 4 |
| Agent SDK 1 | @codeany/open-agent-sdk | ^0.2.1 |
| Agent SDK 2 | @anthropic-ai/claude-agent-sdk | ^0.2.126 |
| Agent SDK 3 | @openai/codex-sdk | ^0.128.0 |
| 飞书 SDK | @larksuiteoapi/node-sdk | ^1.62.1 |
| 图表 | Recharts | 3.8 |

## 下载客户端

支持 macOS、Windows、iOS 客户端，前往 [GitHub Release](https://github.com/hunmer/agent-spaces/releases) 下载对应平台的安装包。

## 自部署

> 如果只需要使用客户端，无需阅读以下内容。

### 前置要求

- Node.js >= 20
- pnpm >= 9

### 一键安装（推荐）

```bash
npm i @agent-spaces/server -g
agent-spaces-server
```

启动后访问 http://localhost:3100 。

### 开发模式

```bash
# 安装依赖
pnpm install

# 开发模式（并行启动 server + web）
pnpm dev
```

- 前端：http://localhost:3000
- 后端：http://localhost:3100

### 生产包部署

```bash
# 本机或 CI 构建
pnpm build

# 将 packages/server/dist 上传到服务器后，在 dist 目录内执行
npm run setup
npm run start
```

生产包会在 `npm run setup` 时安装运行依赖；`npm run start` 会在 `PORT` 指定端口启动 API、WebSocket 和已打包的前端页面，默认访问 http://localhost:3100。

> **Claude Code 部署注意**：由于 Claude Code 对 root/sudo 权限和 `/root` 目录有安全限制，工程目录尽量不要放在 `/root` 下。建议部署到普通用户可读写的目录，例如 `/home/agent-spaces/app` 或 `/opt/agent-spaces` 并将目录 owner 设置为运行用户。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3100` | 后端服务端口 |
| `HOST` | `0.0.0.0` | 后端服务监听地址 |
| `AGENT_SPACES_DATA_DIR` | `~/.agent-spaces-data` | 数据存储目录 |
| `ANTHROPIC_API_KEY` | - | ClaudeCodeRuntime 使用的 API Key |
| `ANTHROPIC_BASE_URL` | - | ClaudeCodeRuntime 使用的 API Base URL |
| `CLAUDE_CODE_MODEL` | - | Claude Code SDK 覆盖模型名（仅 Anthropic Bridge 模式） |
| `NEXT_PUBLIC_WS_PORT` | `3100` | 前端 WebSocket 连接端口 |
| `CODEX_API_KEY` / `OPENAI_API_KEY` | - | CodexRuntime 使用的 API Key |
| `CODEX_HOME` | - | Codex 配置目录 |
| `SERVER_URL` | `http://localhost:3100` | 前端 SSR 时连接后端的 URL |

## 项目结构

```
agent-spaces/
├── packages/shared/    # 前后端共享类型定义（13 文件）
├── packages/server/    # Express API + Agent 编排 + WebSocket（73 文件）
└── packages/web/       # Next.js 前端（168 文件）
```

## License

Private
