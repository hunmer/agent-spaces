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
