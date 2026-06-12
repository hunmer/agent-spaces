# 变更记录

## 2026-06-09 -- 全量重新扫描

- 完整读取全部 28 个源文件
- 重新生成 claude/ 子目录下全部 11 个详情文件
- 重新生成 CLAUDE.md 索引文件
- 覆盖率：100%（所有源文件均已扫描）

## 已识别的重要类型变更（相对旧 CLAUDE.md）

### tool.ts
- `BUILT_IN_AGENT_TOOLS` 从 3 个工具扩展到 **35 个工具**：
  - 新增终端输出（ReadTerminalOutput）
  - 新增快捷命令操作（ListQuickCommands, RunQuickCommand, StopQuickCommand）
  - 新增数据库 CRUD（ListDatabases, ListDatabaseNodes, SearchDatabaseNodes, QueryDatabaseVectors, ReadDatabaseNode, ListDatabaseNodeVersions, CreateDatabaseNode, WriteDatabaseNode, DeleteDatabaseNode, MoveDatabaseNode, UpdateDatabaseNodeMeta）
  - 新增 Kanban 操作（ListKanbanBoards, ViewKanbanBoard, CreateKanbanBoard, UpdateKanbanBoard, DeleteKanbanBoard）
  - 新增文件操作（ListWorkspaceFiles, SearchWorkspaceFiles, ReadWorkspaceFile, WriteWorkspaceFile, DeleteWorkspacePath, MoveWorkspacePath）
  - 新增 Workflow 操作（list_workflows, search_workflow, execute_workflow_sync, execute_workflow_async, get_workflow_result, get_workflow_latest_result）

### agent.ts
- 新增 `BUILTIN_AGENT_IDS` 常量集合（agent-generator, commit-agent, title-generator）
- 新增 `isBuiltinAgent()` 判断函数

### workspace.ts
- `AgentConfig` 新增 `backgroundUrl` 字段（个人资料背景图）

### task.ts
- `TaskStatus` 新增 `reviewing` 状态（共 8 种状态，旧文档记录为 7 种）

### channel.ts
- `MessagePart` 新增 `user_message` 类型（含 senderName）
- `MessagePart` 新增 `error` 类型（含 title, message）
- `Channel.type` 新增 `'mini-apps'` 类型
- `Message` 新增 `replies` 字段（`MessageReply[]`）
- `Message` 新增 `codeRef` 字段
- 新增 `MessageReply` 接口
- 新增 `MessageAgentContext` 接口（含 persistentContext）
- 新增 `MessageAgentOutputItem` 接口
- 新增 `MessagePersistentContextSummary` / `MessagePersistentInstructionFile` 接口
- `Channel` 新增 `archived` 字段
- `Channel` 新增 `draft` 字段（草稿内容）

### events.ts
- `ClientEventMap` 从 9 个事件扩展到 **13 个**：
  - 新增 `channel.stop`、`channel.answer_question`
  - 新增 `workflow:execute`、`workflow:pause`、`workflow:resume`、`workflow:stop`
  - 新增 `workflow:debug-node`、`workflow:get-execution-recovery`、`workflow:interaction`
- `ServerEventMap` 大幅扩展，新增大量 workflow/command/notification/worktree 事件
- 新增 MiniAppMessageContext 接口
- 新增 Terminal 相关 payload 类型

### git.ts
- 新增 `GitBranch` 接口
- 新增 `GitOperationEntry` 接口

### hooks.ts
- `ClaudeHookEventName` 从约 5 种扩展到 **21 种**

### notification.ts
- `NotificationType` 新增 `'channel_agent_completed'`

### workflow.ts
- Workflow 模型完全重构为 Unified Workflow Types：
  - `WorkflowTemplate` 标记为 `@deprecated`，改为 `Workflow` 的类型别名
  - 节点/边采用松耦合设计（`type: string, data: Record<string, unknown>`）
  - 新增 WorkflowGroup、WorkflowTrigger、EmbeddedWorkflow、WorkflowVersion
  - 新增 NodeTypeDefinition（含 CompoundNodeDefinition）
  - 新增 ExecutionInputPreset
  - 新增 WorkflowAgentToolCall / WorkflowAgentTimelineItem / WorkflowAgentChatMessage
  - 新增 StagedNode / OperationEntry

### workflow-ws.ts
- 全新的 WebSocket 协议文件，定义了 50+ 个 Channel Contract
- 包含完整的交互类型系统（10 种交互类型）
- 包含 Dashboard 统计接口

### workflow-plugin.ts
- 新增 `PluginMeta` 接口（运行时元信息）
- 新增 `AgentToolDefinition` 接口
- 新增 `resolvePluginEntryFile()` / `resolvePluginEntryFiles()` 函数
- 新增 `LOCAL_BRIDGE_WORKFLOW_NODES`（delay 节点）
- 新增 `isLocalBridgeWorkflowNode()` / `getLocalBridgeWorkflowNode()` 函数
