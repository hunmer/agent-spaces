[根目录](../../CLAUDE.md) > [packages](../) > **shared**

# @agent-spaces/shared

## 模块职责

前后端共享的 TypeScript 类型定义包。定义了所有核心数据模型、WebSocket 事件契约和接口类型，供 server 和 web 包共同引用。

## 入口与启动

- **入口文件**：`src/index.ts` -- 汇总导出所有类型
- **构建命令**：`pnpm build`（编译到 `dist/`）
- **消费方式**：server 和 web 通过 `import type { ... } from '@agent-spaces/shared'` 引用

## 对外接口

### 数据模型类型

| 类型文件 | 导出类型 | 说明 |
|----------|----------|------|
| `types/workspace.ts` | `Workspace`, `AgentConfig`, `CreateWorkspaceInput` | 工作空间模型及 Agent 配置 |
| `types/issue.ts` | `Issue`, `IssueStatus`, `CreateIssueInput` | 议题模型（9 种状态） |
| `types/task.ts` | `Task`, `TaskStatus`, `TaskResult` | 任务模型（7 种状态） |
| `types/agent.ts` | `AgentSession`, `AgentSessionStatus` | Agent 会话模型（5 种状态） |
| `types/channel.ts` | `Channel`, `Message`, `Attachment` | 频道与消息模型 |
| `types/file.ts` | `FileNode` | 文件树节点（递归结构） |
| `types/git.ts` | `GitFileStatus`, `GitStatusResult`, `GitLogEntry`, `GitDiffResult` | Git 操作结果类型 |
| `types/llm.ts` | `LLMModel`, `LLMProvider` | LLM 模型与供应商配置 |

### AgentConfig 详情

`AgentConfig` 是 Agent 预设的核心类型，包含：
- `role`: 'scheduler' | 'planner' | 'executor' | 'reviewer' | 'custom'
- `runtimeKind`: 'open-agent-sdk' | 'claude-code'（运行时类型选择）
- `modelProvider`: 'anthropic-messages' | 'openai-chat-completions' | 'openai-responses' | 'gemini-generate-content'
- `modelId`: 模型 ID（如 `claude-sonnet-4-6`）
- `apiBase` / `apiKey`: API 端点与密钥
- `mcps`: MCP 服务器配置（JSON 对象，`{ mcpServers: { "server-name": {} } }`）
- `skills`: 技能 markdown 文件名列表
- `sandboxDirs`: 沙箱目录列表
- `systemPrompt`: 系统提示词
- `temperature` / `maxTokens`: 生成参数
- `enabled`: 是否启用

### WebSocket 事件类型

| 类型文件 | 导出类型 | 说明 |
|----------|----------|------|
| `types/events.ts` | `WSEvent<T>` | WebSocket 事件基础结构 |
| `types/events.ts` | `ClientEventMap` | 客户端->服务端事件映射（7 个事件） |
| `types/events.ts` | `ServerEventMap` | 服务端->客户端事件映射（20 个事件） |
| `types/events.ts` | `Terminal*Payload` | 终端事件载荷（6 个类型） |
| `types/events.ts` | `Agent*Payload` | Agent 状态/输出/完成事件载荷 |
| `types/events.ts` | `Issue/Task*Payload` | 议题/任务状态变更事件载荷 |

### 状态枚举

```
IssueStatus:  draft | planned | in_progress | review_pending | changes_requested | approved | completed | archived | error
TaskStatus:   pending | running | waiting_review | retrying | done | failed | cancelled
AgentStatus:  idle | active | blocked | completed | crashed
```

## 关键依赖与配置

- **依赖**：无运行时依赖，仅 `typescript` 作为开发依赖
- **构建**：ESNext 模块 + ES2022 target + bundler 模块解析
- **产物**：`dist/index.js` + `dist/index.d.ts`（类型声明）

## 数据模型

本包不包含数据模型实现，仅定义类型接口。实际数据操作在 server 包的 `storage/` 和 `services/` 层。

## 测试与质量

当前无独立测试。类型正确性通过 server 和 web 的 TypeScript 编译间接验证。

## 常见问题 (FAQ)

- **Q: 为什么用 `workspace:*` 引用？** A: pnpm monorepo 内部包引用方式，指向本地 workspace 中的同名包。
- **Q: 修改类型后需要做什么？** A: 运行 `pnpm --filter @agent-spaces/shared build` 重新编译，server/web 会自动获得新类型。

## 相关文件清单

```
packages/shared/
  package.json
  tsconfig.json
  src/
    index.ts                    # 汇总导出
    types/
      index.ts                  # 类型汇总导出
      workspace.ts              # Workspace + AgentConfig + CreateWorkspaceInput
      issue.ts                  # Issue + IssueStatus
      task.ts                   # Task + TaskStatus + TaskResult
      agent.ts                  # AgentSession + AgentSessionStatus
      channel.ts                # Channel + Message + Attachment
      file.ts                   # FileNode
      git.ts                    # Git 操作结果类型
      events.ts                 # WebSocket 事件契约（7个客户端事件 + 20个服务端事件）
      llm.ts                    # LLMModel + LLMProvider
```

## 变更记录 (Changelog)

| 时间 | 操作 | 说明 |
|------|------|------|
| 2026-05-02T23:43:41 | 增量更新 | 补充 llm.ts 类型、AgentConfig 详细字段、WebSocket 事件数量更新（7 客户端 + 20 服务端） |
| 2026-05-02T01:07:33 | 初始化 | init-architect 首次扫描生成 |
