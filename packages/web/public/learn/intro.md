# 认识 Agent Spaces

Agent Spaces 是一个**可视化工作流自动化平台**。用 DAG 拖拽编排工作流，混合调度 AI Agent、代码、数据库、知识库、人机交互与 Mini App 界面节点，把重复的 AI 任务沉淀成可复用、可触发、可观测的自动化流程。

## 核心特点

- **可视化工作流引擎** — 基于 @xyflow/react 的 DAG 编辑器，拖拽 40+ 内置节点连线定义执行流
- **多种触发方式** — cron 定时、Webhook、HTTP API（SSE 流式）、WebSocket 实时、Issue 事件、Agent 工具调用
- **六种 AI 运行时** — Claude Code / OpenAI Codex / LangChain / Open Agent SDK / Hermes / Oh-My-Pi
- **Mini App 交互节点** — 独立轻量应用子系统，可嵌入工作流阻塞收集用户数据
- **完全本地运行** — 代码不离开你的机器，JSON 文件 + SQLite 持久化
- **IDE 级前端 + 多端客户端** — Monaco 代码编辑器、终端、Git、Web + Electron + Flutter

## 核心能力一览

| 能力 | 说明 |
|------|------|
| 工作流引擎 | 可视化 DAG 编排，9 大节点分类（流程控制 / AI / 人机交互 / 展示 / 数据库 / 知识库等） |
| 工作空间 | 绑定本地代码目录，支持文件夹浏览和 Git Clone |
| 代码编辑器 | Monaco + TypeScript LSP（定义跳转 / 引用 / 诊断） |
| 议题管理 | Issue 绑定 Workflow，自动编排执行 |
| 频道聊天 | @mention Agent 触发对话与任务执行 |
| Git 操作 | 可视化分支管理、Worktree 并行开发 |

## 下一步

建议按以下顺序了解：添加 LLM 供应商 → 配置 Agent → Agent Chat → 添加工作区。
