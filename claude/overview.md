# Agent Spaces -- 项目总览

Agent Spaces 是一个**本地多 Agent 协同编程平台**。用户在本地创建工作空间，绑定代码目录，通过可视化 Workflow 编辑器（DAG 拓扑）编排 Agent 执行流程，或直接通过频道聊天 @mention Agent 触发执行。

## 核心定位

- **本地优先**：所有数据存储在本地（JSON 文件 + SQLite），无需外部数据库
- **多 Agent 协同**：支持 6 种 Agent 运行时（OpenAgentSdk / ClaudeCode / Codex / LangChain / Hermes / OhMyPi）
- **可视化编排**：基于 @xyflow/react 的 DAG 编辑器，支持循环/分支/变量/断点/恢复
- **Mini-app 子系统**：React/HTML 沙箱项目 + 沙箱服务编译 + Agent 运行时 + 客户端 RPC + SQLite 数据库
- **IDE 级体验**：Monaco 编辑器 + TypeScript LSP + xterm.js 终端 + Git 操作
- **多平台**：Web 前端 + Flutter 移动端壳应用

## 项目规模

| 指标 | 数值 |
|------|------|
| pnpm 包数量 | 7（含 dom-inspector-hook） |
| 后端源文件（server/src） | 185+ 个 .ts 文件 |
| 前端源文件（web/src） | 290+ 个 .ts/.tsx 文件 |
| Flutter 源文件 | 46 个 .dart + 2 测试文件 |
| Agent 模板 | 184 预设 + 6 Chat Agent + 66+ Skill + 120+ Plugin |
| 状态管理 Store | 44 个文件（web，含子目录） |
| REST API 路由文件 | 37 个（server） |
| i18n 命名空间 | 34 个 |
| 项目文档 | 45+ 个 .md 文件 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js >= 20 |
| 包管理 | pnpm >= 9（当前 10.17.1） |
| 语言 | TypeScript 5.8+ |
| 前端框架 | Next.js 16.2 (App Router) |
| 后端框架 | Express 5 |
| 状态管理 | Zustand 5 (web) / Riverpod 2 (flutter) |
| 代码编辑器 | Monaco Editor + TypeScript LSP |
| DAG 编辑器 | @xyflow/react 12 + @dagrejs/dagre 3 |
| 终端 | xterm.js 6 + node-pty |
| 数据存储 | JSON 文件 + SQLite (better-sqlite3 + node:sqlite) |
| 移动端 | Flutter 3.10+ |

## 数据流

```
用户 -> Web 前端 (Next.js) -> REST API / WebSocket -> Express 后端
                                                           |
                                                +----------+----------+
                                                |                     |
                                          Agent 运行时           Mini-app 子系统
                                          (6 种适配器)          (沙箱 + Agent + RPC)
                                                |                     |
                                          工具调用 / 文件操作     SQLite / 配置广播
                                                |
                                    本地文件系统 / Git / SQLite
```

## 版本

当前版本：0.2.6
