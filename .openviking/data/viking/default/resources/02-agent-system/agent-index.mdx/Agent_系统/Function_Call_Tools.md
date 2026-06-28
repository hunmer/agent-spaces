## Function Call Tools

Agent 通过 Function Call Tools 与系统交互。内置工具共 **35 种**，按职责分为 Issue、Terminal、Command、Database、Kanban、Workspace File、Workflow 七大类：

### Issue 工具（3）

- **CreateCurrentChannelIssue** — 为当前频道创建并绑定 Issue
- **ViewCurrentChannelIssue** — 查看当前频道绑定的 Issue 及评论
- **AddCurrentChannelComment** — 为当前频道绑定的 Issue 添加评论

Issue 工具仅在当前频道上下文中可用，并在服务端强制校验 `issueId` 必须等于当前频道绑定的 `issueId`，无法操作其他频道的 Issue。

### Terminal 工具（1）

- **ReadTerminalOutput** — 按 session ID 分页读取终端输出（默认最新 100 行）

### Command 工具（3）

- **ListQuickCommands** — 列出工作空间的快捷命令及运行状态
- **RunQuickCommand** — 按 ID 启动快捷命令，返回终端 session ID
- **StopQuickCommand** — 按 ID 停止运行中的快捷命令

### Database 工具（11）

知识库（Notion 风格文档数据库 + 向量搜索）操作工具：

- **ListDatabases** — 列出工作空间的数据库及其 ID
- **ListDatabaseNodes** — 列出某路径下的知识库节点（可按标题过滤）
- **SearchDatabaseNodes** — 按标题或内容搜索知识库节点
- **QueryDatabaseVectors** — 基于数据库绑定的 embedding 模型做向量相似度搜索
- **ReadDatabaseNode** — 按 ID 读取知识库节点内容和元数据
- **ListDatabaseNodeVersions** — 列出知识库节点的内容版本历史与 diff
- **CreateDatabaseNode** — 在指定父路径或父 ID 下创建节点
- **WriteDatabaseNode** — 按 ID 插入 / 替换 / 覆盖节点内容
- **DeleteDatabaseNode** — 移入回收站或永久删除节点及其后代
- **MoveDatabaseNode** — 移动节点或目录到其他父路径 / 父 ID
- **UpdateDatabaseNodeMeta** — 更新节点元数据（标题、图标、封面、parent、回收站状态等）

### Kanban 工具（5）

- **ListKanbanBoards** — 列出工作空间的看板
- **ViewKanbanBoard** — 查看看板元数据、列和任务
- **CreateKanbanBoard** — 创建工作空间看板
- **UpdateKanbanBoard** — 更新看板元数据、列或任务（完整数组替换）
- **DeleteKanbanBoard** — 删除看板及其列和任务

### Workspace File 工具（6）

直接操作工作空间文件系统：

- **ListWorkspaceFiles** — 列出工作空间文件和目录
- **SearchWorkspaceFiles** — 搜索工作空间文件路径和 UTF-8 文本内容
- **ReadWorkspaceFile** — 读取工作空间 UTF-8 文本文件
- **WriteWorkspaceFile** — 向工作空间文件写入 UTF-8 文本
- **DeleteWorkspacePath** — 递归删除工作空间文件或目录
- **MoveWorkspacePath** — 移动或重命名工作空间文件 / 目录

### Workflow 工具（6）

- **list_workflows** — 列出已保存的 Workflow 及其起始节点输入字段
- **search_workflow** — 按名称或描述搜索 Workflow
- **execute_workflow_sync** — 启动 Workflow 并等待完成 / 暂停 / 失败 / 超时
- **execute_workflow_async** — 启动 Workflow 并立即返回执行 ID
- **get_workflow_result** — 按执行 ID 读取 Workflow 执行结果
- **get_workflow_latest_result** — 读取某 Workflow 的最近一次执行结果

工具层通过 `AgentFunctionTool` 抽象（定义于 `packages/server/src/adapters/agent-runtime-types.ts`）统一管理，不同运行时的 Agent 使用相同的工具接口，内置工具声明集中在 `packages/shared/src/types/tool.ts` 的 `BUILT_IN_AGENT_TOOLS`。工具输入校验通过 `input-helpers.ts` 统一处理（assertRecord / readRequiredString 等），服务端始终是信任边界。

在 Claude Code 运行时中，工具通过 SDK MCP Server 暴露，模型实际调用名为 `mcp__agent-spaces__<工具名>`（例如 `mcp__agent-spaces__WriteDatabaseNode`）。Codex 与 Oh My Pi 运行时则会启动一个仅监听 `127.0.0.1` 的短生命周期本地 Streamable HTTP MCP server 暴露同样的工具。

这意味着同一套内置工具在不同运行时的“对模型可见名称”可能不同，但服务端执行语义一致，真正的权限校验和作用域限制始终落在后端。

## 实时状态

每一步的状态变更都通过 WebSocket 实时推送到前端，包括：

- Agent 执行状态（启动、运行中、完成、失败）
- 工具调用详情（输入参数、输出结果、代码 diff）
- Token 使用量统计

你也可以通过频道聊天中 @mention Agent 跳过 Workflow 编排，直接触发特定 Agent 执行。