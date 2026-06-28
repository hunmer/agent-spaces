# Chat 系统能力说明

## 概述

Chat 是 Agent Spaces 的独立 AI 对话系统（`/chat` 路由），提供轻量级多 Agent 对话体验。与工作空间内的频道聊天解耦，Chat 页面专注于一对一的 AI Agent 对话场景。

## 架构

```
┌──────────────┬───────────────────────────┬──────────────┐
│  Workspace   │     ChatPanel              │  RightPanel  │
│  Switcher    │     (对话面板)              │  (Agent 配置) │
│  + Sessions  │                            │              │
│  (280px)     │  Messages + Streaming      │  Skills/MCP  │
│              │  + Send/Stop/Clear          │  /Tools      │
│  ──────────  │                            │              │
│  [+ 新对话]   │                            │              │
│              │                            │              │
│  Session 1   │                            │              │
│  Session 2   │                            │              │
│  ...         │                            │              │
│  ──────────  │                            │              │
│  [管理 Agents]│                            │              │
└──────────────┴───────────────────────────┴──────────────┘
```

三栏布局：左侧 Workspace/Session 列表，中间对话面板，右侧 Agent 配置面板。

## 核心概念

### ChatAgent（全局 Agent）

独立于工作空间的 Agent Preset 体系。每个 ChatAgent 拥有独立的模型、供应商、API Key 配置。

| 字段 | 说明 |
|------|------|
| `name` | Agent 名称 |
| `avatar` | 头像 |
| `systemPrompt` | 系统提示词 |
| `provider` | 供应商（openai-chat-completions / anthropic-messages / gemini-generate-content） |
| `model` | 模型（如 gpt-4o-mini、claude-sonnet-4-6） |
| `apiKey` | API Key |
| `baseURL` | 自定义 API 地址 |
| `mcps` | MCP 服务器配置 |
| `skills` | 技能文件列表 |
| `tools` | 启用的内置工具 |
| `outputStyle` | 输出风格模板 |
| `workingDir` | 工作目录 |

固定使用 LangChain 运行时（`runtimeKind = 'langchain'`），支持 OpenAI / Anthropic / Google 三种供应商。

### ChatWorkspace（工作空间）

组织 Agent 的容器。每个 Workspace 通过 `agentIds` 引用全局 Agent，内部维护 flat session 列表。

### ChatSession（会话）

每次对话为一个 Session，绑定一个 Agent。支持标题、归档。

### ChatMessage（消息）

按 Session 隔离的消息记录，支持流式输出和思考过程。

## 当前能力

### 1. 多 Workspace 管理

- 创建/编辑/删除 Workspace
- Workspace 切换，自动加载对应 Session 列表
- Workspace 内引用全局 Agent（通过 agentIds）

### 2. Session 管理

- 选择 Agent 创建新 Session
- 删除 Session（含消息）
- 归档/取消归档 Session
- Session 按 `updatedAt` 倒序排列

### 3. SSE 流式对话

- 通过 `POST /api/chat/sessions/:sessionId/run` 发起 SSE 流式执行
- 流式事件：`output`（文本）、`thinking`（思考过程）、`tool_use`（工具调用）、`tool_result`（工具结果）、`completed`（完成）、`error`（错误）
- 前端 AbortController 支持中断请求
- 自动加载最近 20 条消息作为对话历史

### 4. 消息重新生成

- 支持从指定 Agent 消息重新生成（regenerate）
- 自动定位上一条用户消息，截断后续历史

### 5. 内置 Function Call 工具

Agent 可调用 5 类内置工具：

| 工具类 | 说明 |
|--------|------|
| Command | 命令执行 |
| Database | 文档数据库 CRUD |
| Kanban | 看板任务管理 |
| Workspace Files | 当前 Chat Workspace 文件枚举、搜索、读写、删除、移动 |
| Workflow Execution | Workflow 执行和查询 |

工具通过 `agent.tools` 字段配置启用/禁用。

### 6. 技能与 MCP 支持

- 每个 Agent 可配置独立的 Skills（Markdown 技能文件）
- 支持 MCP 服务器配置（工具桥接）
- 技能文件写入 Agent 的配置目录（`chat-templates/{agentId}/skills/`）

### 7. 输出风格

- Agent 可绑定 OutputStyle 模板
- 运行时自动注入到 systemPrompt

### 8. 工作目录

- 每个 Agent 可配置 `workingDir`（工作目录）
- 支持浏览 Agent 工作目录的文件树（`GET /api/chat/agents/:id/workspace/tree`）

### 9. Agent 管理

- CRUD：创建/编辑/删除 Agent
- 从 Agent Preset 导入到 Chat（Agent Picker）
- 独立配置：名称、头像、描述、模型、供应商、API Key、系统提示词、技能、MCP、工具

### 10. 数据迁移

- 首次使用自动创建 "Default" Workspace
- 旧版扁平 Agent 列表数据自动迁移到新 Workspace + Session 结构
- 迁移在 `chat-store` 的 `init()` 中自动执行

## API 端点

### Workspace

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/workspaces` | 列出所有 Workspace |
| POST | `/api/chat/workspaces` | 创建 Workspace |
| PUT | `/api/chat/workspaces/:id` | 更新 Workspace |
| DELETE | `/api/chat/workspaces/:id` | 删除 Workspace（含 Sessions） |

### Session

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/workspaces/:wsId/sessions` | 列出 Sessions |
| POST | `/api/chat/workspaces/:wsId/sessions` | 创建 Session |
| PATCH | `/api/chat/workspaces/:wsId/sessions/:id` | 更新 Session（标题/归档） |
| DELETE | `/api/chat/workspaces/:wsId/sessions/:id` | 删除 Session |

### Messages

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/sessions/:sessionId/messages?workspaceId=` | 列出 Session 消息 |
| DELETE | `/api/chat/sessions/:sessionId/messages?workspaceId=` | 清空 Session 消息 |

### Agent

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/chat/agents` | 列出所有 Agent |
| POST | `/api/chat/agents` | 创建 Agent |
| PUT | `/api/chat/agents/:id` | 更新 Agent |
| DELETE | `/api/chat/agents/:id` | 删除 Agent |
| GET | `/api/chat/agents/:id/workspace/tree` | Agent 工作目录文件树 |

### 执行

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/sessions/:sessionId/run` | SSE 流式执行（Session 模式） |
| POST | `/api/chat/agents/:id/run` | SSE 流式执行（Agent 直连模式，兼容旧版） |

## 存储结构

```
~/.agent-spaces-data/
  chat-templates/{agentId}/        # Agent 配置
    agent.json
    mcp.json
    skills/*.md
  chat/
    workspaces.json                # Workspace 列表
    workspaces/{workspaceId}/
      sessions.json                # Session 列表
      sessions/{sessionId}/
        messages.json              # 消息历史
```

## 前端组件

| 组件 | 说明 |
|------|------|
| `page.tsx` | Chat 页面主组件（三栏布局 + URL 状态同步） |
| `chat-agent-list.tsx` | Workspace 切换 + Session 列表 |
| `chat-panel.tsx` | 对话面板容器 |
| `inline-chat-panel.tsx` | 对话面板（消息列表 + 流式输出 + 发送/停止/清除） |
| `chat-message-bubble.tsx` | 消息气泡 |
| `chat-right-panel.tsx` | 右侧 Agent 配置面板 |
| `add-chat-agent-dialog.tsx` | Agent 创建/编辑对话框 |
| `add-member-dialog.tsx` | 添加成员（创建 Session）对话框 |
| `chat-agent-picker-dialog.tsx` | Agent 选择器（从 Preset 导入） |
| `chat-composer-input.tsx` | 对话输入组件 |

## 与频道聊天的区别

| 维度 | Chat 页面 | 频道聊天 |
|------|-----------|----------|
| 位置 | `/chat` 独立页面 | 工作空间 IDE 内 FlexLayout 面板 |
| Agent 体系 | 独立 ChatAgent（全局） | Agent Preset（工作空间级） |
| 运行时 | 固定 LangChain | 六种运行时可配置 |
| 传输协议 | SSE | WebSocket |
| 对话模型 | Session（一对一） | Channel（多 Agent @mention） |
| 上下文 | 对话历史 | 频道消息流 + 持久上下文 |
| 工具 | Command/Database/Kanban/Workspace Files/Workflow | Issue/Command/Database/Kanban/Workflow |
