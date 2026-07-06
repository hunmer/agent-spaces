# Agent Spaces

可视化工作流（Workflow）平台。用 DAG 拖拽编排工作流，混合调度 AI Agent、代码、数据库、知识库、人机交互与 Mini App 界面节点，把重复的 AI 任务沉淀成可复用、可触发、可观测的自动化流程。一个工作流可以由定时任务、Webhook、HTTP API、Issue 事件或 Agent 工具调用触发，也可以作为子流程嵌套进别的工作流。

核心是**节点化的可视化工作流引擎**：AI 协同、代码执行、Mini App 界面都只是工作流里的一类节点，而非独立产品。

![preview1](screenshots/preview1.png)
![preview2](screenshots/preview2.png)

## 功能

### 工作流引擎（核心）

- **可视化 DAG 编排** — @xyflow/react 拓扑编辑器，拖拽节点、连线定义执行流，替代硬编码 pipeline
- **40+ 内置节点，9 大分类**：
  - **流程控制** — start / end / switch 分支 / loop+loop_body 循环（支持并发）/ variable_aggregate 汇聚 / set·get·delete_variable / run_code（JS）/ run_python / loop_break
  - **AI** — agent_run 调用 Agent（六种角色 × 六种运行时，含权限模式 default/dontAsk/acceptEdits/plan/auto/bypassPermissions）
  - **人机交互** — alert / prompt 输入 / form 表单（阻塞等待用户回应）
  - **展示** — gallery_preview 图库 / music_player / table_display / code_render（React/HTML）/ markdown / sticky_note / file_display
  - **数据库（SQLite）** — query / insert / update / delete / raw
  - **知识库** — kb_add / kb_query / kb_delete（向量检索）
  - **工具/字符串** — flatten_array / pluck_array_key / merge_arrays / parse_json / string_concat / string_split
  - **Mini App 节点** — show_miniapp 在流程中弹出 Mini App 界面，阻塞收集用户提交数据
  - **插件节点** — 插件可动态注册自定义节点（服务端/客户端/双端执行）
- **复合节点与子流程** — loop 是 compound 复合节点（含作用域边界），sub_workflow 可嵌套调用其他工作流
- **多种触发方式** — cron 定时、Webhook（hook）、HTTP API（SSE 流式）、WebSocket 实时、Issue 自动编排、Agent 工具调用
- **多种执行/输出形态** — WebSocket 事件流、HTTP SSE 流式响应、Webhook SSE 回调、断点调试、暂停/恢复/停止、断线快照恢复
- **工程化能力** — 工作流分组（group）、版本管理、发布开关（published）、工作流级变量、容错模式（ignore/stop）、节点断点、节点禁用/跳过、执行日志

### Mini Apps

- 独立的轻量 React/HTML 应用子系统，可单独运行；也可通过 `show_miniapp` 节点嵌入工作流作为交互界面
- 独立项目结构、独立 agent 配置、独立 services 运行时，Zip 导入导出
- 工作流调用时通过 WS 双向通信，阻塞等待用户在 Mini App 内提交数据

### AI Agent 与协同

- **六种 Agent 角色** — agent / scheduler / task_creator / bot + 自定义角色
- **六种 Agent 运行时** — Claude Code / OpenAI Codex / LangChain / Open Agent SDK / Hermes / Oh-My-Pi，配置切换
- **运行时管理** — 一键发现/安装/更新本地 CLI 与 SDK（claude-code/codex/gemini-cli/hermes/oh-my-pi 等），版本检测
- **频道聊天** — TipTap 富文本，@mention 直接触发 Agent 执行
- **议题管理** — Issue 绑定工作流模板，自动编排执行，含评论时间线、失败重试、状态流转
- **Hook 系统** — Agent 工具调用前后的钩子（shell/webhook/script），per-tool-call 粒度
- **持久上下文** — 自动加载 CLAUDE.md/AGENTS.md 注入 Agent 运行时
- **Agent SSE API** — HTTP SSE 流式调用，支持外部集成

### 工作空间与开发工具

- **IDE 级前端** — Monaco 代码编辑器（TypeScript LSP 定义跳转/引用/诊断）、xterm.js 终端、FlexLayout 可拖拽布局
- **Git 集成** — 仓库操作面板、分支管理、Commit Agent 自动提交、Worktree
- **通知中心** — 飞书/企业微信 Bot 推送 + Native 通知，远程操控
- **LLM 管理** — 多模型配置、API Key 管理、Anthropic Bridge 协议中转
- **用量统计仪表盘** — Token 消耗趋势、费用估算、按模型/会话统计
- **文档数据库** — Notion 风格树形文档系统，Notion/Markdown 双编辑器，回收站
- **代码搜索** — ripgrep 优先 + Node.js 回退，正则/文件模式/大小写
- **其余** — Kanban 看板、Prompt 模板、输出风格、快捷命令、代码收藏、订阅管理（智谱/MiniMax/AI Code）、语音识别（腾讯 WebSocket）、Command Palette（Ctrl+K）、DOM Inspector（Alt+Shift 跳转源码）
- **i18n 国际化** — 中英文切换
- **认证系统** — 基于 Secret Key 的 Bearer Token 认证，JSON 文件持久化 + SQLite，无需外部数据库

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | >= 20 |
| 包管理 | pnpm | >= 9 |
| 语言 | TypeScript | 5.8+ |
| 前端框架 | Next.js | 16.2 (App Router) |
| UI 库 | shadcn/ui (base-nova) + TailwindCSS 4 | - |
| 布局引擎 | FlexLayout React | 0.9 |
| DAG 编辑器 | @xyflow/react | 12.10 |
| DAG 布局 | @dagrejs/dagre | 3.0 |
| 状态管理 | Zustand | 5 |
| 代码编辑 | Monaco Editor | 0.55 |
| Monaco LSP 客户端 | monaco-languageclient | 10.7 |
| TypeScript LSP 服务端 | typescript-language-server | 5.2 |
| 终端 | xterm.js (@xterm/xterm) | 6 |
| 富文本编辑 | TipTap | 3.22 |
| i18n | next-intl | 4.11 |
| Command Palette | cmdk | 1.1 |
| 后端框架 | Express | 5 |
| WebSocket | ws | 8 |
| PTY | node-pty | 1.1 |
| Git 操作 | simple-git | 3.36 |
| 数据库 | node:sqlite (SQLite) | 内置 |
| Schema 校验 | zod | 4 |
| Agent SDK 1 | @codeany/open-agent-sdk | ^0.2.1 |
| Agent SDK 2 | @anthropic-ai/claude-agent-sdk | ^0.2.126 |
| Agent SDK 3 | @openai/codex-sdk | ^0.142.0 |
| Agent SDK 4 | langchain + @langchain/openai + @langchain/anthropic + @langchain/google-genai | ^1.4.0 |
| Agent 运行时 | Hermes / Oh-My-Pi（自研） | - |
| 飞书 SDK | @larksuiteoapi/node-sdk | ^1.62.1 |
| 图表 | Recharts | 3.8 |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable | ^6.3.1 |
| 拖放面板 | react-resizable-panels | - |
| 移动端框架 | Flutter | ^3.10.1 |
| 移动端状态管理 | flutter_riverpod | ^2.6.1 |
| 移动端 WebView | flutter_inappwebview | ^6.1.5 |
| 移动端通知 | awesome_notifications | ^0.11.0 |

## 下载客户端

支持 macOS、Windows、iOS 客户端，前往 [GitHub Release](https://github.com/hunmer/agent-spaces/releases) 下载对应平台的安装包。

## 自部署

> 如果只需要使用客户端，无需阅读以下内容。

### 前置要求

- Node.js >= 20
- pnpm >= 9

### 一键安装（推荐）

```bash
npm i @agent-spaces/server -g -registry https://registry.npmmirror.com
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

### Docker 构建

```bash
pnpm build:docker
```

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
| `CORS_ORIGIN` | `*` | CORS 允许的来源 |

## 项目结构

```
agent-spaces/
├── packages/shared/         # 前后端共享类型定义（29 文件）
├── packages/server/         # Express API + Agent 编排 + WebSocket（215 文件）
├── packages/web/            # Next.js 前端（645 文件）
├── packages/sdk/            # 前端统一 API SDK（39 模块）
├── packages/electron/       # Electron 桌面壳（macOS/Windows/Linux）
├── packages/flutter/        # Flutter 多平台客户端（46 文件）
├── packages/templates/      # 插件/技能/Mini App/Workflow 模板资源
└── packages/dom-inspector-hook/  # 开发工具 Hook（DOM → 源码跳转）
```

## License

Private
