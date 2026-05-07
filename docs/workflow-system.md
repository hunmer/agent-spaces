# Workflow 系统速读

本文档面向后续 AI/开发者快速理解当前 workflow 系统。它描述的是当前代码行为，不是早期设计草案。

## 一句话模型

Workflow 是 Issue 自动化的可视化 DAG 模板。每个节点绑定一个具体 `AgentConfig`，边表示执行依赖。Issue 选择 workflow 后，后端会把 workflow 节点映射成普通 `Task`，复用现有 task 调度器运行：所有任务完成后，Issue 完成。

Workflow 不是独立执行引擎；它是 Task 创建模板。

## 关键文件

共享类型：

- `packages/shared/src/types/workflow.ts`
- `packages/shared/src/types/workspace.ts`
- `packages/shared/src/types/issue.ts`

后端：

- `packages/server/src/routes/workflow.ts`
- `packages/server/src/services/workflow.ts`
- `packages/server/src/storage/workflow-store.ts`
- `packages/server/src/agents/issue-agent-runner.ts`
- `packages/server/src/agents/issue-task-controller.ts`

前端：

- `packages/web/src/components/workflow/workflow-editor.tsx`
- `packages/web/src/components/workflow/workflow-canvas.tsx`
- `packages/web/src/components/workflow/workflow-agent-palette.tsx`
- `packages/web/src/components/workflow/workflow-agent-node.tsx`
- `packages/web/src/components/workflows/workflows-page.tsx`
- `packages/web/src/stores/workflow.ts`
- `packages/web/src/components/issue/create-issue-dialog.tsx`
- `packages/web/src/components/issue/edit-issue-dialog.tsx`

## Agent Role

当前公开内置 role：

```ts
type BuiltInAgentRole = 'agent' | 'scheduler' | 'task_creator' | 'bot';
type AgentRole = BuiltInAgentRole | (string & {});
```

语义：

- `agent`：默认通用 Agent，适合作为 workflow 的普通执行节点。
- `task_creator`：非 workflow fallback 链路中负责把 issue 拆成 tasks 的 Agent；也可以像普通节点一样放进 workflow。
- `scheduler`：后台发现待处理 issue 的调度角色，通常不作为 workflow 执行节点。
- `bot`：外部通知/聊天入口角色，通常不作为 workflow 执行节点。

后端允许任意非空字符串 role，以兼容旧数据和用户自定义 role。前端 agent 创建菜单只展示内置 role。

历史 role 如 `planner`、`executor`、`reviewer`、`commit`、`custom` 不再是公开枚举的一部分。旧文件仍可能存在用于兼容 fallback 链路或 Git commit message 功能，不代表 workflow 仍使用硬编码阶段。

## Workflow 数据模型

`WorkflowTemplate` 存在 `packages/shared/src/types/workflow.ts`。

```ts
interface WorkflowTemplate {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNode {
  id: string;
  type: 'agent';
  position: { x: number; y: number };
  data: {
    label: string;
    agentConfigId: string;
    role: AgentConfig['role'];
    avatarUrl?: string;
    modelId?: string;
    taskTitleTemplate?: string;
    taskDescriptionTemplate?: string;
  };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}
```

重要点：

- 节点绑定的是具体 agent preset id：`data.agentConfigId`。
- `data.role` 是冗余快照，保存/更新 workflow 时会从当前 workspace agent 重新解析。
- `taskTitleTemplate` 和 `taskDescriptionTemplate` 可覆盖自动生成的 Task 标题和描述。
- 只支持 `type: 'agent'`。目前没有条件、循环、人工审批等节点类型。

## 存储

存储实现：`packages/server/src/storage/workflow-store.ts`

位置：

```text
~/.agent-spaces-data/workspaces/{workspaceId}/workflows/
  index.json
  {workflowId}.json
```

`index.json` 存完整 `WorkflowTemplate[]`，用于列表和 mini preview。单个 `{workflowId}.json` 用于详情编辑。

## API

路由挂载在 workspace 下：

```text
GET    /api/workspaces/:id/workflows
POST   /api/workspaces/:id/workflows
GET    /api/workspaces/:id/workflows/:workflowId
PUT    /api/workspaces/:id/workflows/:workflowId
DELETE /api/workspaces/:id/workflows/:workflowId
POST   /api/workspaces/:id/workflows/:workflowId/duplicate
```

写操作会广播 WebSocket 事件：

```ts
'workflow.created'
'workflow.updated'
'workflow.deleted'
```

## 保存时校验

实现：`packages/server/src/services/workflow.ts`

创建/更新 workflow 时会做：

1. 至少 1 个节点。
2. 禁止 self-loop。
3. 禁止重复边。
4. 边必须引用存在的 source/target node。
5. DAG 校验，禁止环。
6. 每个节点的 `agentConfigId` 必须存在于 workspace agents 中。
7. 重新写回节点 `role/avatarUrl/modelId`，避免 agent preset 改名或改角色后 workflow 节点过期。

注意：保存时只校验 agent 是否存在，不校验是否 enabled 或是否属于某个 issue channel。运行时才校验这些条件。

## Issue 如何选择 Workflow

Issue 类型包含：

```ts
workflowId?: string;
```

创建/编辑 issue 时前端可以选择 workflow。后端 Issue 自动化入口会读取该字段。

## 运行入口

入口：`runIssueAutomation()` in `packages/server/src/agents/issue-agent-runner.ts`

流程：

```text
runIssueAutomation(workspaceId, issueId)
  |
  +-- issue.workflowId exists?
      |
      +-- yes: load workflow
      |        createTasksFromWorkflow()
      |        return
      |
      +-- no/fail: mark issue error
```

Issue 自动化不再回退到旧 planner/task_creator hardcoded pipeline。workflow 缺失、workflow 模板不存在、或运行前校验失败时，Issue 会进入 `error`。

## Workflow 到 Task 的映射

实现：

- `mapWorkflowToTaskDrafts()` in `packages/server/src/services/workflow.ts`
- `createTasksFromWorkflow()` in `packages/server/src/agents/issue-task-controller.ts`

映射规则：

```text
WorkflowNode -> TaskDraft

key = node.id
agentConfigId = node.data.agentConfigId
title = node.data.taskTitleTemplate || "Execute {node.data.label}"
description = node.data.taskDescriptionTemplate || "Task assigned to {label} ({role})"
dependsOnKeys = all incoming edge source node ids
```

边的方向：

```text
source -> target
```

表示 target task 依赖 source task 完成。

## 运行时校验

`createTasksFromWorkflow()` 会调用 `validateWorkflowForRun()`。

运行 workflow 前要求：

1. 每个节点绑定的 agent 仍存在。
2. 每个 agent enabled。
3. 每个 agent 都在当前 issue channel members 中。

这意味着 workflow 模板可以跨 issue 复用，但实际运行 issue 时，issue channel 里必须包含 workflow 用到的所有 agent。

## Task 执行模型

核心函数：`scheduleRunnableIssueTasks()` 和 `runIssueTask()` in `issue-task-controller.ts`

调度规则：

1. 找出所有 `status === 'pending'` 的 task。
2. 只有 `dependsOnTaskIds` 全部为 `done` 时，task 才 runnable。
3. 当前没有 runnable 且所有 task 都 `done` 时，issue 状态变为 `completed`。
4. runnable task 会按数组顺序逐个 `await runIssueTask()`。

当前执行是串行启动 runnable tasks。DAG 仍表达依赖关系，但同一层不会真正并行跑多个 agent。

`runIssueTask()` 规则：

1. 只运行 `pending` task，防止重复调度。
2. 使用 task 上的 `agentConfigId` 找到具体 agent preset。
3. 如果 task 没有指定 agent，或绑定的 agent 不在 issue channel members 中 / 已禁用，则 task 失败并让 issue 进入重试或 `error`。
4. 用该 agent preset 创建或复用 agent session。
5. 调用对应 runtime 执行 task prompt。
6. 成功则 `task.status = done`。
7. 失败则重试，超过重试次数后 issue 进入 `error`。

Workflow 中每个节点就是一个普通 task，所以“最后一个 agent 跑完”表现为：最后一个无后继阻塞的 task 标记 `done` 后，调度器发现所有 tasks 都 done，然后把 issue 标记为 `completed`。

## Workflow 不再硬编码 Reviewer

旧链路里 executor 完成后会触发 reviewer hook。当前 workflow task 执行路径不再调用 `onExecutorComplete()`。

如果需要 review，把 review agent 作为 workflow 中的一个普通节点加入 DAG：

```text
implement-agent -> review-agent -> final-agent
```

同理，commit、audit、deploy 等都应作为普通 workflow 节点表达，不应再写进硬编码阶段。

## Task Creator 节点

`task_creator` 现在可以像普通 agent 一样被创建，并放进 workflow。

需要注意：

- 在 workflow 中，`task_creator` 节点不会自动调用 `ReplaceIssueTasks` 来改写当前 workflow 生成的 task graph。
- 它只是一个绑定了 `task_creator` role 和系统 prompt 的普通 agent task。
- 旧 `syncIssueTasksAfterPlanning()` 链路仍保留在代码中用于兼容，但 Issue 自动化入口不再调用它。

如果未来要支持“workflow 中的 task_creator 动态展开后续 tasks”，需要新增专门节点语义或运行时分支，目前没有。

## Agent Prompt 和工具

Workflow task 执行时，prompt 来自 `buildTaskAgentPrompt()`：

- agent preset 的 `systemPrompt`
- 要求先调用 `ViewCurrentChannelIssue`
- 当前 workspace working dir
- 当前 issue id/channel/title
- 当前 task id/title/description
- assigned agent 名称和 role

可用 issue tools：

- `ViewCurrentChannelIssue`
- `AddCurrentChannelComment`

不会默认给普通 workflow task 暴露 `ReplaceIssueTasks`。

## 状态变化

Workflow 运行开始：

```text
issue.status: draft -> planned -> in_progress
```

Task 运行：

```text
pending -> running -> done
pending -> running -> failed -> pending/retry...
```

全部 tasks 完成：

```text
issue.status: in_progress -> completed
```

失败超过重试：

```text
issue.status: error
```

广播事件主要包括：

- `issue.status_changed`
- `issue.updated`
- `task.created`
- `task.status_changed`
- `task.updated`
- `task.output`
- `agent.started`
- `agent.status_changed`
- `agent.output`
- `agent.completed`

## 前端编辑器

前端使用 React Flow/xyflow。

基本交互：

1. `WorkflowAgentPalette` 列出 enabled agents。
2. 拖拽 agent 到 canvas。
3. `workflow-canvas.tsx` 生成 `WorkflowNode`，写入 `agentConfigId/role/avatarUrl/modelId`。
4. 连线生成 `WorkflowEdge`。
5. 保存时调用 workflow API。

Agent palette 会按 role 分组。内置显示名包括：

- `agent`
- `scheduler`
- `task_creator`
- `bot`

未知自定义 role 仍按原字符串分组显示。

## 修改指南

要改 workflow 数据模型：

1. 先改 `packages/shared/src/types/workflow.ts`。
2. 再改 `packages/server/src/services/workflow.ts` 的校验和 role/stale metadata 解析。
3. 同步前端 canvas/editor 序列化。
4. 考虑旧 JSON 数据兼容。

要改 workflow 执行语义：

1. 优先看 `createTasksFromWorkflow()`。
2. 再看 `mapWorkflowToTaskDrafts()`。
3. 真正执行 agent 的地方是 `runIssueTask()`。
4. 不要重新引入按 role 分支的硬编码阶段，除非这是明确的新节点类型。

要新增节点类型：

1. 扩展 `WorkflowNode['type']`。
2. 扩展前端 nodeTypes。
3. 扩展后端 DAG 校验和 task 映射。
4. 明确该节点是否映射成 Task，还是需要新执行器。

## 常见误解

- Workflow 不是实时并行执行引擎；当前同层 runnable tasks 仍串行执行。
- Workflow 节点绑定具体 agent preset，不绑定抽象 role。
- `task_creator` 放进 workflow 不会自动动态改写 task graph。
- 没有 executor/reviewer 硬编码阶段；需要谁参与，就把谁放进 workflow。
- Issue 完成条件是所有 workflow 映射出的 tasks 都 `done`。
- workflow 保存时不会校验 channel members，运行时才校验。
