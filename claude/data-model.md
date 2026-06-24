# 数据模型

## 持久化架构

数据存储在 `AGENT_SPACES_DATA_DIR`（默认 `~/.agent-spaces-data/`）目录下。

### 存储方式

| 类型 | 用途 | 文件格式 |
|------|------|----------|
| JSON 文件 | 大部分业务数据 | .json |
| SQLite | Agent Usage + Kanban + DocNode + Mini-app DB | .sqlite |
| Markdown | Prompt / Skills / CLAUDE.md | .md |

### 目录结构

```
~/.agent-spaces-data/
  auth.json                         # Secret Key 认证
  npm-settings.json                 # NPM 配置
  user-settings.json                # 用户设置
  agents/
    agents.sqlite                   # Agent Session + Usage
  workspaces/
    index.json                      # Workspace 列表
    {workspaceId}/
      workspace.json                # Workspace 详情
      prompt.md                     # 工作空间 Prompt
      notifications.json            # 应用内通知
      code-favorites.json           # 代码收藏
      hooks/{name}.hook.json        # Hook 配置
      workflows/                    # Workflow 模板
      channels/
        {channelId}/
          messages.json             # 消息
          tool-details.json         # 工具调用详情
      issues/                       # 议题 + 评论
      tasks/                        # 任务
      commands/                     # 快捷命令
  mini-apps/                        # Mini-app 项目（**新增**）
    index.json                      # 项目列表
    {projectId}/
      manifest.json                 # 项目清单
      src/                          # 源码（index.jsx / index.html / api.js / services/）
      agents.json                   # Agent 配置
      data/db/                      # SQLite 数据库
      configs/                      # 配置文件（沙箱读写）
  agent-templates/                  # Agent 预设模板
  llm/                              # LLM 模型 + 供应商
  output-styles/                    # 输出风格模板
  prompt-templates/                 # Prompt 模板
  subscriptions.json                # 订阅配置
  speech-recognition.json           # 语音识别配置
  chat-templates/                   # Chat Agent 配置
  chat/                             # Chat 会话数据
  plugins/                          # Plugin 插件
```

### .agentspace 目录（项目目录内）

创建 Workspace 时自动在 boundDirs[0] 下生成：

```
.agentspace/
  claude.md                       # 知识库
  skills/                         # 技能库
  agents/{agentId}/               # Agent 配置与工作目录
```

## 核心类型（packages/shared）

### Workspace

工作空间是顶层组织单元。绑定本地目录（boundDirs），包含 Agent 配置、通知设置、频道、议题等。

### Issue + Task

Issue 通过 workflowId 绑定 Workflow 模板。Issue 状态机：draft -> planned -> in_progress -> review_pending -> approved -> completed / error。Task 状态机：pending -> running -> waiting_review -> done / failed / cancelled。

### AgentConfig

Agent 预设核心类型。包含 role（agent/scheduler/task_creator/bot + 自定义）、runtimeKind（6 种运行时）、modelProvider、modelId、API 配置、MCP、技能、工具列表、thinking 配置等。

### WorkflowTemplate

DAG 模板。包含 nodes（Agent/Command/Plugin/Group/Loop/StickyNote/DisplayNode 节点）+ edges（依赖关系）。

### Channel + Message

频道消息支持结构化 Parts（text/reasoning/chain/terminal/confirmation/context/subagent/ask_user_question）。每条消息可关联 tool-details（工具调用详情）。

### DocNode

文档数据库节点。树形结构（parentId），支持封面/图标/向量搜索/版本历史。

### KanbanBoard

看板系统。Board -> Column -> Task 三层结构，支持拖拽排序。

### MiniAppProject（**新增**）

Mini-app 项目类型。包含 type（react/html）、enabledPlugins、agentConfigId、enableAgents、mainFile、agents 种子配置等。沙箱服务通过 ESM -> CJS 编译执行，支持 configs/ 原子读写 + 广播。

## 状态枚举

```
IssueStatus:  draft | planned | in_progress | review_pending | changes_requested | approved | completed | archived | error
TaskStatus:   pending | running | waiting_review | retrying | done | failed | cancelled
AgentStatus:  idle | active | blocked | completed | crashed
WorktreeStatus: active | merged | deleted
MiniAppTaskStatus: running | completed | failed（TTL 10 分钟后清理终态）
```

## Store 字段抽样（2026-06-24 补全）

> 详情见 [packages/server/claude/storage.md](../packages/server/claude/storage.md)。这里仅记录已深挖的字段要点，其余 JSON store 多为扁平 CRUD，按需 Read 即可。

### chat-store.ts（Chat 独立页，全字段）

落盘：`chat-templates/{agentId}/agent.json` + `mcp.json` + `skills/`；`chat/workspaces.json` + `chat/workspaces/{wsId}/{state,sessions}.json` + `chat/{agentId}/messages.json`（旧）。

- **ChatAgent**：id, name, role?('agent'), runtimeKind?('langchain'), avatar?, avatarUrl?, icon?, description?, systemPrompt?, modelProvider?, modelId?, providerId?, provider?(运行时不持久化), model, apiKey?(不持久化), baseURL?/apiBase?(不持久化), workingDir?, mcps?, skills?(string | {name,content?})[], tools?(BuiltInAgentToolName[]), outputStyle?, temperature?, maxTokens?, enabled?, createdAt, updatedAt
- **ChatMessage**：id, agentId, role('user'|'agent'), content, timestamp, thinking?, usage?{inputTokens,outputTokens,totalTokens}, toolCalls?(WorkflowAgentToolCall[]), timeline?(WorkflowAgentTimelineItem[])
- **ChatSession**：id, workspaceId, agentId, title?, archived?, createdAt, updatedAt
- **ChatWorkspace**：id, name, agentIds[], createdAt, updatedAt
- **WorkspaceTabState**：openSessionTabIds[], openFileTabs[{path,agentId}], activeTab({type:'session'|'file',id}|null)
- 行为：消息按 timestamp 倒序排序后游标分页（before）；旧 single-agent 消息可经 `migrateToWorkspaces()` 迁移到 workspace+session 结构

### agent-store.ts（实为 SQLite Agent Usage，**2026-06-24 修正**）

> 注：此文件**不是** Agent preset 存储，而是 Agent 会话与用量统计。Agent preset 实际分散在 `chat-templates/`（chat-store）和 `agent-templates/`（目录式，未单独 store 文件）。

落盘：`agents/agents.sqlite`（node:sqlite `DatabaseSync`，WAL）。两表：

- **agent_sessions**：id(PK), workspace_id, agent_config_id, role, status, current_task_id?, process_id?, started_at, last_activity_at, error?。索引 `(workspace_id, last_activity_at DESC)`。UPSERT on id 冲突。
- **agent_usage**：id(PK), workspace_id, agent_session_id, agent_config_id, role, status, runtime?, model?, input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens, input_cost_usd, output_cost_usd, total_cost_usd, summary?, error?, started_at, completed_at, duration_ms?。UNIQUE(agent_session_id, completed_at)。索引 `(completed_at DESC)` + `(workspace_id, completed_at DESC)`。
- 成本估算：若调用方提供 `costUsd` 则按 input/output token 比例分摊；否则 `estimateCost()` 用 `getModelPrices()` 兜底（按模型名 substring 匹配 gpt-4o/5/sonnet/haiku/opus/gemini，未命中按 1/3 USD/M），可被 llm-store 中配置的 `cost.inputPerMillion/outputPerMillion` 覆盖。
- Dashboard：`getAgentUsageDashboard(days=30)` 返回 totals + daily（按天补零）+ byModel（成本降序前 5）+ recent（前 6）

### workspace-store.ts / issue-store.ts / task-store.ts（扁平 CRUD 范式）

三者结构同构，统一遵循"index.json 列表 + {id}.json 详情"双写范式：

- list：`readJsonFile< T[]>(index.json) || []`
- get：`readJsonFile<T>({id}.json)`
- create：先写 `{id}.json`，再 read+push+write index
- update：先写 `{id}.json`，再 findIndex+replace+write index
- delete：filter index 重写；issue/task 还会 `unlink` 详情文件

落盘路径：
- workspace：`workspaces/index.json` + `workspaces/{id}/workspace.json`
- issue：`workspaces/{wsId}/issues/index.json` + `workspaces/{wsId}/issues/{id}.json`
- task：`workspaces/{wsId}/tasks/index.json` + `workspaces/{wsId}/tasks/{id}.json`

> 注：无事务、无锁，靠业务层串行调用保证一致性。

### workflow-store.ts（目录式，多类型数据）

落盘：`workflows/{workflowId}/` 下承载多类数据，详见 storage.md。要点：
- `workflow.json` DAG 定义（nodes/edges/groups/variables/triggers）
- `versions/<versionId>.json` 历史快照，上限 100
- `execution_history/<logId>.json` 执行日志，上限 100（按 mtime 淘汰最旧）
- `plugin_configs/<pluginId>/<scheme>.json`
- `staging.json` 暂存节点、`operation_history.json` 撤销/重做栈、`chat.json` 工作流 Agent 对话
- `folders.json` 文件夹树（独立于 workflowId 目录）
- 旧版扁平文件（`workflows/<id>.json` + `index.json`）首次访问自动迁移
