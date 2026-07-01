# 对外接口

本包是纯类型定义包，对外接口即导出的类型、接口、常量和工具函数。

## 核心数据模型

### Workspace 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `Workspace` | interface | 工作空间（id, name, boundDirs, agentspaceDir, 通知设置, Hook 开关, Worktree 标记） |
| `CreateWorkspaceInput` | interface | 创建工作空间输入（name, boundDirs） |
| `AgentConfig` | interface | Agent 预设配置（含 role/runtimeKind/modelProvider/tools/mcps/skills 等 25+ 字段） |
| `BuiltInAgentRole` | type | 内置角色：`'agent' \| 'scheduler' \| 'task_creator' \| 'bot'` |
| `AgentRole` | type | 角色类型：`BuiltInAgentRole \| (string & {})` |
| `NotificationProvider` | type | 通知平台：`'lark' \| 'wechat' \| 'native'` |
| `NotificationEventKey` | type | 通知事件：`'issue_started' \| 'issue_completed' \| ...` |
| `WorkspaceNotificationSettings` | interface | 通知设置（飞书/企微/Native 三平台配置） |
| `RobotAccount` | interface | Robot Account 凭证 |

### Issue 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `Issue` | interface | 议题（9 种状态，含 workflowId 绑定、连续运行、重试控制、分支/PR 追踪） |
| `IssueStatus` | type | `'draft' \| 'in_progress' \| 'completed' \| 'stopped' \| 'archived' \| 'error'` |
| `IssueComment` | interface | 评论（含 source: user/agent_progress、metadata 含 agent 运行时信息） |
| `CreateIssueInput` | interface | 创建输入（title, description, status?, members?, workflowId?） |

### Task 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `Task` | interface | 任务（8 种状态，含依赖关系、沙箱目录、执行日志、diff 文件、重试控制） |
| `TaskStatus` | type | `'pending' \| 'running' \| 'reviewing' \| 'waiting_review' \| 'retrying' \| 'done' \| 'failed' \| 'cancelled'` |
| `TaskResult` | interface | 任务结果（success, summary, artifacts, error） |

### Agent 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `AgentSession` | interface | Agent 运行时会话（5 种状态） |
| `AgentSessionStatus` | type | `'idle' \| 'active' \| 'blocked' \| 'completed' \| 'crashed'` |
| `AgentUsageRecord` | interface | 单次执行用量记录（tokens + 费用 + 耗时） |
| `AgentUsageDashboard` | interface | Dashboard 聚合数据（totals/daily/byModel/recent） |
| `BUILTIN_AGENT_IDS` | const | 内置 Agent ID 集合：`'agent-generator' \| 'commit-agent' \| 'title-generator'` |
| `isBuiltinAgent(id)` | function | 判断是否为内置 Agent |

### Channel / Message 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `Channel` | interface | 频道（4 种类型：general/issue/agent/mini-apps，含 Todo、草稿、归档） |
| `Message` | interface | 消息（5 种类型，含 Parts/附件/回复/代码引用/metadata） |
| `MessagePart` | type | 11 种结构化消息类型（text/user_message/reasoning/chain/terminal/error/confirmation/context/subagent/ask_user_question） |
| `MessageChain` | interface | chain 容器内单条链（工具步骤/消息） |
| `MessageApproval` | interface | 工具权限确认 |
| `MessageMetadata` | interface | 消息元数据（Agent 会话/运行时/模型/耗时/阶段） |
| `Attachment` | interface | 附件 |
| `TodoItem` | interface | 待办事项（3 种状态） |

## 基础设施类型

### WebSocket 事件

| 导出 | 类型 | 说明 |
|------|------|------|
| `WSEvent<T>` | interface | WebSocket 事件基础结构（event, workspaceId, timestamp, data） |
| `ClientEventMap` | type | 客户端->服务端事件映射（13 个事件：终端/频道消息/Agent 控制/Workflow 执行） |
| `ServerEventMap` | type | 服务端->客户端事件映射（35+ 个事件：终端/频道/Agent/Issue/Task/Workflow/Command/Notification/Worktree） |
| `ClientEventName` | type | 客户端事件名集合 |
| `ServerEventName` | type | 服务端事件名集合 |

### Git 操作

| 导出 | 类型 | 说明 |
|------|------|------|
| `GitFileStatus` | interface | 文件状态（6 种 + staged/conflicted 标记） |
| `GitStatusResult` | interface | Git 状态摘要（branch, files, ahead/behind, insertions/deletions, headHash） |
| `GitLogEntry` | interface | 提交日志（hash, message, author, date, parents, refs） |
| `GitDiffResult` | interface | 差异结果（含二进制/新增/删除/冲突标记） |
| `GitBranch` | interface | 分支（name, current） |
| `GitOperationEntry` | interface | Git 操作历史 |

### LLM 模型

| 导出 | 类型 | 说明 |
|------|------|------|
| `LLMModel` | interface | 模型定义（含成本/思考模式/视觉/推理/嵌入能力标记） |
| `LLMProvider` | interface | 供应商配置（apiBase, apiKey） |
| `LLMModelCost` | interface | 成本配置（inputPerMillion, outputPerMillion） |
| `LLMThinkingEffort` | type | 思考强度：`'low' \| 'medium' \| 'high'` |

### 内置工具

| 导出 | 类型 | 说明 |
|------|------|------|
| `BUILT_IN_AGENT_TOOLS` | const | 35 个内置 Agent 工具声明（Issue 操作 3 个、终端 1 个、快捷命令 3 个、数据库 10 个、Kanban 5 个、文件 5 个、Workflow 5 个） |
| `BuiltInAgentToolName` | type | 工具名联合类型 |

## Workflow 子系统

### 核心模型

| 导出 | 类型 | 说明 |
|------|------|------|
| `Workflow` | interface | Workflow 主模型（节点/边/分组/触发器/文件夹/Agent 配置/插件/布局快照） |
| `WorkflowTemplate` | type | `= Workflow`（向后兼容别名，`@deprecated`） |
| `WorkflowNode` | interface | 节点（type + data 宽松耦合，含 composite 元数据、断点、运行状态） |
| `WorkflowEdge` | interface | 边（source -> target，含 composite 元数据、handle） |
| `WorkflowGroup` | interface | 分组（含子节点/子分组/布局/锁定/禁用/保存状态） |
| `WorkflowTrigger` | type | 触发器（cron 定时 / hook 事件） |
| `WorkflowFolder` | interface | 文件夹（树形结构，parentId） |
| `WorkflowVersion` | interface | 版本快照 |
| `NodeTypeDefinition` | interface | 节点类型定义（用于编辑器注册，含属性/handle/输出/复合定义） |

### 执行系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `ExecutionEventChannel` | type | 11 种执行事件通道 |
| `ExecutionEventMap` | interface | 执行事件映射（workflow 级 + node 级 + log + context） |
| `ExecutionLog` | interface | 执行日志（含 steps 快照） |
| `ExecutionStep` | interface | 执行步骤（含 input/output/error/logs） |
| `ExecutionSnapshot` | interface | 执行快照（nodes/edges/groups） |
| `ExecutionRecoveryState` | interface | 执行恢复状态 |
| `EngineStatus` | type | 引擎状态：`'idle' \| 'running' \| 'paused' \| 'completed' \| 'error'` |
| `WorkflowExecuteRequest` | interface | 执行请求（workflowId + input + snapshot + startNodeId） |
| `WorkflowDebugNodeRequest` | interface | 单节点调试请求 |

### 错误体系

| 导出 | 类型 | 说明 |
|------|------|------|
| `BackendErrorCode` | type | 16 种错误码 |
| `BackendErrorShape` | interface | 结构化错误（code, message, details, retryable） |
| `ErrorEnvelope` | interface | 错误信封（id, channel, type, error） |
| `createErrorShape()` | function | 错误形状工厂函数 |

### 插件系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `PluginInfo` | interface | 插件元信息（含 entries 多入口） |
| `PluginMeta` | interface | 插件运行时元信息（含启用状态、图标路径） |
| `PluginRuntimeType` | type | 运行时类型：`'server' \| 'client' \| 'both'` |
| `PluginConfigField` | interface | 配置字段定义 |
| `AgentToolDefinition` | interface | Agent 工具定义 |
| `resolvePluginEntryFile()` | function | 解析插件入口文件 |
| `resolvePluginEntryFiles()` | function | 解析插件入口文件列表 |
| `LOCAL_BRIDGE_WORKFLOW_NODES` | const | 本地桥接节点定义（delay） |
| `isLocalBridgeWorkflowNode()` | function | 判断是否为本地桥接节点 |

### 复合节点

| 导出 | 类型 | 说明 |
|------|------|------|
| `LOOP_NODE_TYPE` | const | `'loop'` -- 循环节点类型 |
| `findWorkflowNode()` | function | 节点查找 |
| `getCompositeRootId()` | function | 获取复合根 ID |
| `findCompositeChildren()` | function | 查找复合子节点 |
| `isNodeDescendantOf()` | function | 判断后代关系 |
| `getNearestScopeAnchorId()` | function | 获取最近作用域锚点 |
| `getNodesForExecutionScope()` | function | 获取执行作用域内节点 |
| `createDefaultEmbeddedWorkflow()` | function | 创建默认嵌入式 Workflow |
| `normalizeEmbeddedWorkflow()` | function | 规范化嵌入式 Workflow |

### 快捷键

| 导出 | 类型 | 说明 |
|------|------|------|
| `ShortcutAction` | interface | 快捷动作定义 |
| `ShortcutBinding` | interface | 快捷键绑定 |
| `SHORTCUT_ACTIONS` | const | 8 种预设快捷动作 |
| `getMergedBindings()` | function | 合并自定义绑定与默认绑定 |

### WebSocket 协议

| 导出 | 类型 | 说明 |
|------|------|------|
| `WorkflowChannelMap` | interface | 50+ 个 Workflow Channel Contract（CRUD/版本/日志/插件/Dashboard/暂存/触发器） |
| `InteractionRequest` | interface | 交互请求（10 种交互类型） |
| `InteractionResponse` | interface | 交互响应 |
| `WSClientHello` / `WSServerHello` | interface | 握手协议 |

## 辅助功能类型

### 快捷命令

| 导出 | 类型 | 说明 |
|------|------|------|
| `QuickCommand` | interface | 命令定义（含 env/shell/autoRestart） |
| `CommandProcess` | interface | 运行中进程 |
| `CommandProcessEvent` | interface | 进程生命周期事件 |

### 订阅管理

| 导出 | 类型 | 说明 |
|------|------|------|
| `SubscriptionProvider` | type | 供应商：`'zhipu' \| 'minimax' \| 'aicode'` |
| `SubscriptionConfig` | interface | 供应商配置 |
| `SubscriptionQuota` | interface | 配额查询结果 |
| `SubscriptionLimit` | interface | 单项配额 |

### 代码搜索

| 导出 | 类型 | 说明 |
|------|------|------|
| `CodeSearchResult` | interface | 搜索结果（file, line, column, text） |
| `FileSearchResult` | interface | 文件搜索结果 |
| `SearchCodeOptions` | interface | 搜索选项（query, regex, caseSensitive, filePattern） |

### 应用内通知

| 导出 | 类型 | 说明 |
|------|------|------|
| `NotificationType` | type | 通知类型：5 种 |
| `AppNotification` | interface | 通知对象 |

### 语音识别

| 导出 | 类型 | 说明 |
|------|------|------|
| `SpeechRecognitionProvider` | type | 供应商：`'tencent'` |
| `SpeechRecognitionConfig` | interface | 语音识别配置 |
| `SpeechRecognitionResult` | interface | 识别结果 |
| `TencentSpeechCredentials` | type | 腾讯语音凭证 |

### 代码收藏

| 导出 | 类型 | 说明 |
|------|------|------|
| `CodeFavorite` | interface | 代码收藏（位置范围 + 标签 + 代码片段） |

### Hook 系统

| 导出 | 类型 | 说明 |
|------|------|------|
| `HookConfig` | interface | Hook 配置 |
| `HookRule` | interface | 钩子规则（3 种动作类型） |
| `ClaudeHookEventName` | type | 21 种 Claude Hook 事件名 |

### 文档数据库

| 导出 | 类型 | 说明 |
|------|------|------|
| `DatabaseMeta` | interface | 数据库元信息 |
| `DocNode` | interface | 文档节点（Notion 风格，树形结构） |
| `DatabaseNodeVersion` | interface | 节点版本历史（增量补丁） |
| `DatabaseVectorStats` | interface | 向量索引统计 |
| `DatabaseVectorIndexResult` | interface | 索引构建结果 |
| `DatabaseVectorSearchResult` | interface | 向量搜索结果 |
| `PRESET_COVERS` | const | 7 种预设封面渐变色 |

### Kanban 看板

| 导出 | 类型 | 说明 |
|------|------|------|
| `KanbanBoard` | interface | 看板（含列和任务） |
| `KanbanColumn` | interface | 列 |
| `KanbanTask` | interface | 任务（含优先级/截止日期） |
| `KanbanPriority` | type | 优先级：`'low' \| 'medium' \| 'high'` |
| `KanbanLayoutMode` | type | 布局：`'horizontal' \| 'vertical'` |

### Git Worktree

| 导出 | 类型 | 说明 |
|------|------|------|
| `WorktreeInfo` | interface | Worktree 完整信息 |
| `WorktreeStatus` | type | 状态：`'active' \| 'merged' \| 'deleted'` |
| `CreateWorktreeInput` | interface | 创建输入 |
