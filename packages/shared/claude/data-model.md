# 数据模型

本包仅定义类型接口，不包含数据模型的实现或持久化逻辑。实际数据操作在 server 包的 `storage/` 和 `services/` 层。

## 核心实体关系

```
Workspace
  |-- AgentConfig (1:N, 通过 workspace 内 agents 数组关联)
  |-- Channel (1:N, workspaceId)
  |-- Issue (1:N, workspaceId)
  |-- WorktreeInfo (1:N, workspaceId)
  |-- DatabaseMeta (1:N, workspaceId)
  |-- KanbanBoard (1:N, workspaceId)

Channel
  |-- Message (1:N, channelId)
  |-- TodoItem (1:N, channel.todos)
  |-- Issue (1:1, channel.issueId)

Issue
  |-- IssueComment (1:N, issueId)
  |-- Task (1:N, issueId)
  |-- Workflow (1:1, issue.workflowId)

Task
  |-- AgentSession (1:1?, task.assignedAgentId)
  |-- TaskResult (1:1, task.result)

AgentSession
  |-- AgentUsageRecord (1:N, agentSessionId)
  |-- AgentUsageSessionDetail (聚合视图: session + usage + messages[])

Workflow
  |-- WorkflowNode (1:N)
  |-- WorkflowEdge (1:N)
  |-- WorkflowGroup (1:N)
  |-- WorkflowTrigger (1:N)
  |-- ExecutionLog (1:N, workflowId)
  |-- WorkflowVersion (1:N, workflowId)

DatabaseMeta
  |-- DocNode (1:N, databaseId, 树形结构 parentId)
  |-- DatabaseNodeVersion (1:N, nodeId)

KanbanBoard
  |-- KanbanColumn (1:N)
  |-- KanbanTask (1:N)
```

## 状态枚举汇总

| 实体 | 状态类型 | 值 |
|------|----------|------|
| Issue | `IssueStatus` | `draft` / `in_progress` / `completed` / `stopped` / `archived` / `error` |
| Task | `TaskStatus` | `pending` / `running` / `reviewing` / `waiting_review` / `retrying` / `done` / `failed` / `cancelled` |
| Agent | `AgentSessionStatus` | `idle` / `active` / `blocked` / `completed` / `crashed` |
| Message | `Message['status']` | `pending` / `streaming` / `waiting_for_user` / `completed` / `error` |
| Todo | `TodoItem['status']` | `pending` / `in_progress` / `completed` |
| Workflow Engine | `EngineStatus` | `idle` / `running` / `paused` / `completed` / `error` |
| Workflow Node | `NodeRunState` | `normal` / `disabled` / `skipped` |
| Workflow Execution | `ExecutionLog['status']` | `running` / `completed` / `paused` / `error` |
| Workflow Step | `ExecutionStep['status']` | `running` / `completed` / `error` / `skipped` |
| Worktree | `WorktreeStatus` | `active` / `merged` / `deleted` |
| Command Process | `CommandProcess['status']` | `running` / `stopping` |
| Git File | `GitFileStatus['status']` | `modified` / `added` / `deleted` / `renamed` / `untracked` / `conflicted` |

## 时间戳格式

本包存在两种时间戳格式：

| 格式 | TypeScript 类型 | 使用场景 |
|------|----------------|----------|
| ISO 8601 字符串 | `string` | 大多数模型（Workspace, Issue, Task, Agent, Channel, Command 等） |
| Unix 毫秒 | `number` | Workflow 相关模型（Workflow, WorkflowFolder, ExecutionLog, DocNode, KanbanBoard 等） |

这是历史原因：原始 agent-spaces 模型使用 ISO 字符串，后来整合的 WorkFox Workflow 引擎使用 epoch 毫秒。

## ID 策略

所有实体使用 `string` 类型 ID，由 server 层生成（通常为 UUID 或 nanoid）。`FileNode` 使用文件路径作为自然标识。

## AgentConfig 关键字段

`AgentConfig` 是 Agent 预设的核心类型，关键字段：

- `role`: Agent 角色（内置 4 种 + 自定义）
- `runtimeKind`: 6 种运行时选择
- `modelProvider`: 6 种模型供应商协议
- `tools`: 启用的内置工具列表（`BuiltInAgentToolName[]`，共 35 个可选）
- `mcps`: MCP 服务器配置（JSON 对象）
- `skills`: 技能 markdown 文件名列表
- `templateId`: 标识由哪个模板创建（用于导入去重）

## MessagePart 结构化消息

AI 消息通过 `parts` 字段实现 11 种结构化展示：

| type | 用途 | 关键字段 |
|------|------|----------|
| `text` | 最终结论文本 | `text` |
| `user_message` | 用户消息 | `text`, `senderName` |
| `reasoning` | 思考过程 | `text`, `duration`, `status` |
| `chain` | 统一 chain 容器 | `chains: MessageChain[]` |
| `terminal` | 命令/终端输出 | `command`, `output`, `status` |
| `error` | 错误信息 | `title`, `message` |
| `confirmation` | 工具权限确认 | `title`, `description`, `approval` |
| `context` | 上下文窗口/token 使用 | `usedTokens`, `maxTokens`, `modelId`, `usage`, `agentContext` |
| `subagent` | Agent 自主调用的子 agent | `name`, `model`, `instructions`, `output`, `tools` |
| `ask_user_question` | Agent 向用户提问 | `question`, `choices`, `status`, `answer` |

## Workflow DAG 模型

Workflow 使用松耦合的节点/边模型：

- `WorkflowNode.type`: 字符串类型标识（如 `'agent'`, `'command'`, `'loop'`, `'delay'` 等）
- `WorkflowNode.data`: `Record<string, unknown>` 宽松数据容器，具体结构由节点类型决定
- `WorkflowNode.composite`: 复合节点元数据（rootId, parentId, role, generated, hidden, scopeBoundary）
- `WorkflowEdge`: source -> target 有向边，支持 sourceHandle/targetHandle 多端口

### 复合节点

循环节点（loop）通过 composite 元数据实现子节点嵌套：
- `LOOP_NODE_TYPE = 'loop'`: 循环节点类型
- `LOOP_BODY_NODE_TYPE = 'loop_body'`: 循环体节点类型
- `LOOP_BREAK_NODE_TYPE = 'loop_break'`: 循环中断节点类型
