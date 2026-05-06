# Issue Agent 自动化执行流程

本文档说明当前 issue 被自动处理时，后端如何串联 scheduler、planner、task creator、executor、reviewer，以及前端如何通过事件看到状态和消息更新。

## 入口条件

自动处理入口在 `packages/server/src/agents/scheduler-agent.ts`。

Scheduler 按 workspace 运行定时 tick：

1. 读取 workspace 配置。
2. 如果 `workspace.autoProcessIssues === false`，跳过。
3. 查找状态为 `draft` 或 `changes_requested` 的 issue。
4. 如果当前已有 active/idle planner session，等待下一轮。
5. 取第一个未完成 issue，调用 `runPlanner(workspaceId, issueId, ctx)`。

Scheduler 本身不创建任务，也不执行任务。它只负责发现待处理 issue 并唤醒 planner。

## 总体链路

当前自动化链路如下：

```text
draft / changes_requested issue
  -> scheduler
  -> planner
  -> task creator
  -> dependency scheduler
  -> executor(s)
  -> reviewer
  -> dependency scheduler
  -> completed
```

关键文件：

- `packages/server/src/agents/scheduler-agent.ts`
- `packages/server/src/agents/planner-agent.ts`
- `packages/server/src/agents/issue-task-controller.ts`
- `packages/server/src/agents/reviewer-agent.ts`
- `packages/server/src/hooks/agent-hooks.ts`
- `packages/server/src/services/builtin-tools.ts`
- `packages/server/src/agents/issue-agent-progress.ts`

## Planner 阶段

Planner 由 `runPlanner()` 执行。

主要步骤：

1. 读取 issue。
2. 在 issue channel members 中查找启用的 `planner` agent preset。
3. 创建或复用该 preset 对应的 agent session。
4. 将 issue 状态更新为 `planned`。
5. 广播：
   - `issue.status_changed`
   - `issue.updated`
6. 创建 issue detail 中的 agent 进度占位和 channel message。
7. 调用 planner runtime。
8. planner 完成后，将完整输出写回 message/comment。
9. 调用 `syncIssueTasksAfterPlanning()` 进入 task creator 阶段。

Planner prompt 不再使用硬编码的固定中文规划提示。当前 prompt 由以下内容组成：

- planner preset 的 `systemPrompt`
- 要求先调用 `ViewCurrentChannelIssue`
- 当前 issue 的基础信息

Planner 可用的 issue function tools：

- `ViewCurrentChannelIssue`
- `AddCurrentChannelComment`

## 统一 Issue 上下文工具

所有自动化 agent 都应通过 `ViewCurrentChannelIssue` 获取共享上下文。

实现位置：

```text
packages/server/src/services/builtin-tools.ts
```

当前 `ViewCurrentChannelIssue` 返回：

```ts
{
  issue,
  comments,
  tasks,
  channel: {
    id,
    name,
    type,
    issueId,
    members,
    pinnedMentionId,
    todos
  },
  assignableAgents: [
    { id, name, role, description, enabled, sandboxDirs }
  ],
  validAgentConfigIds
}
```

约束：

- tool input 必须包含当前 `channelId`。
- `channelId` 必须匹配当前 issue channel。
- tool 只能读取当前 channel 绑定的 issue。
- `assignableAgents` 只包含当前 channel members 中启用的 agent preset。
- `validAgentConfigIds` 是任务分配时允许使用的 agent config id 集合。

已移除独立的 `ViewIssueTaskPlanningContext`。task creator、executor、reviewer 都使用同一个 `ViewCurrentChannelIssue`。

## Task Creator 阶段

Task creator 由 `syncIssueTasksAfterPlanning()` 启动，位于：

```text
packages/server/src/agents/issue-task-controller.ts
```

选择 agent 的规则：

1. 优先查找 issue channel members 中启用的 `custom` agent。
2. 如果没有 custom agent，则复用 planner preset 运行 task sync。

Task creator 可用的 tools：

- `ViewCurrentChannelIssue`
- `AddCurrentChannelComment`
- `ReplaceIssueTasks`

任务拆分原则：

- 默认创建 1 个粗粒度 implementation task，覆盖一个 cohesive issue 的完整交付。
- 只有在 issue 明确包含跨区域重大更改时才拆成多个 task，例如前端和后端都需要较大改动、数据库/API contract 与 UI 需要分阶段落地，或存在可以由不同 executor 独立完成的并行工作流。
- 不要按细小步骤拆分，例如“更新类型”“新增 route”“调整 UI 文案”“运行测试”“补文档”。这些应写进同一个 task 的 description 或 verification 范围。
- 每个 task description 应包含足够的实现范围和验证要求，避免 executor 需要依赖大量微任务才能理解目标。
- 只有当前置任务未完成会阻塞后续任务时，才填写 `dependsOnKeys`。

`ReplaceIssueTasks` 是 controller 提供的闭域写工具。它接受稳定 key，而不是要求模型提前知道数据库生成的 task id：

```ts
{
  issueId: string;
  tasks: Array<{
    key: string;
    title: string;
    description: string;
    agentConfigId?: string;
    dependsOnKeys?: string[];
    sandboxDirs?: string[];
  }>;
}
```

Controller 处理方式：

1. 校验 `issueId`。
2. 校验 `agentConfigId` 必须属于当前 issue channel 的启用 agent preset。
3. 删除非 running 的旧任务。
4. 先创建所有新任务。
5. 建立 `key -> task.id` 映射。
6. 将 `dependsOnKeys` 转换为真实 `dependsOnTaskIds`。
7. 调用 `issueService.replaceTasks()` 同步 `issue.tasks`。
8. 广播 `task.created` 和 `issue.updated`。

如果 task creator 没有创建任何任务，controller 会创建一个 fallback implementation task，避免流程直接中断。

## Task 数据模型

当前 task 支持两类 agent 关联：

```ts
agentConfigId?: string;
assignedAgentId?: string;
```

含义不同：

- `agentConfigId`：任务应该交给哪个 agent preset/config 执行。
- `assignedAgentId`：运行时实际分配到的 agent session id。

依赖字段：

```ts
dependsOnTaskIds?: string[];
```

调度器只会启动所有前置任务均已 `done` 的 pending task。

## 依赖调度

调度入口：

```text
scheduleRunnableIssueTasks(workspaceId, issueId, ctx)
```

调度规则：

1. 读取当前 issue 的所有 tasks。
2. 收集状态为 `done` 的 task id。
3. 跳过 active 状态任务：
   - `running`
   - `reviewing`
   - `retrying`
   - `waiting_review`
4. 找出满足以下条件的任务：
   - `status === 'pending'`
   - `dependsOnTaskIds` 全部在 done 集合中
5. 逐个启动 runnable tasks，并等待每个 task 的 executor 和 reviewer 完成后再进入下一个 task。
6. 如果没有 runnable task，且所有 task 都 done，则将 issue 更新为 `completed`。

当前策略是串行执行同一轮 runnable tasks，避免多个 executor/reviewer 的 issue comment 在时间线上交错，也降低共享工作区写冲突风险。依赖图仍用于判断哪些 task 可以开始；只是实际启动时按顺序执行。

## 失败重试与重启恢复

Task 和 Issue 都有独立的重试计数：

```ts
Task.retryCount / Task.maxRetries
Issue.retryCount / Issue.maxRetries / Issue.retryPaused
```

Executor agent 运行失败时：

```text
task running
  -> failed
  -> retryCount < maxRetries: reset to pending and schedule again
  -> retryCount >= maxRetries: keep failed and set issue error
```

Issue 进入 `error` 后，scheduler 会在后续 tick 中调用 error issue retry service：

```text
issue error
  -> retryCount < maxRetries: reset failed tasks to pending, issue -> in_progress, continue scheduling
  -> retryCount >= maxRetries: set retryPaused=true, stop automatic retries
```

手动恢复入口：

- 后端：`POST /api/workspaces/:workspaceId/issues/:issueId/resume`
- 前端：issue detail 在 `error` 状态显示 `Resume failed tasks`
- 单个 failed task 仍可点击 retry，后端会把该 task 恢复为 `pending` 并立即重新调度。

服务器启动恢复：

1. `app.ts` 启动后调用 recovery service。
2. 所有状态为 `running` 或 `retrying` 的 task 会被标记为 `failed`。
3. 所有状态为 `in_progress` 的 issue 会被切换为 `error`。
4. 后续由 scheduler 的 error issue retry service 继续自动恢复，超过三次后暂停。

## Executor 阶段

Executor 由 `runIssueTask()` 启动。

选择 agent 的规则：

1. 如果 task 有 `agentConfigId`，优先使用对应的 enabled executor preset。
2. 如果没有有效 `agentConfigId`，回退到 issue channel members 中第一个 enabled executor preset。
3. 如果找不到 executor，任务标记为 `failed`。

执行步骤：

1. 创建或复用 executor agent session。
2. 调用 `taskService.assignAgent()`，将 task 状态更新为 `running`，并写入 `assignedAgentId`。
3. 创建 issue detail 进度占位和 channel message。
4. runtime prompt 明确要求先调用 `ViewCurrentChannelIssue`。
5. runtime prompt 明确写入当前 workspace working directory，并要求产物写在该目录下，不能默认写到 `/tmp`。
6. 执行 task title/description。
7. 将 agent 输出写入：
   - `agent.output`
   - `task.output`
   - issue progress comment
8. executor 完成后触发 `onExecutorComplete()`。
9. reviewer 完成后重新调用 `scheduleRunnableIssueTasks()`，启动后继任务。

Executor 可用的 issue function tools：

- `ViewCurrentChannelIssue`
- `AddCurrentChannelComment`

## Reviewer 阶段

Executor 成功完成后，hook 会触发 reviewer：

```text
packages/server/src/hooks/agent-hooks.ts
```

当前 `onExecutorComplete()` 行为：

1. 如果 executor result 失败，记录 warning 并返回。
2. 如果成功，调用 `runReviewer()`。

Reviewer 由 `packages/server/src/agents/reviewer-agent.ts` 实现。

选择 agent 的规则：

1. 查找 issue channel members 中启用的 `reviewer` preset。
2. 如果没有 reviewer，任务直接标记为 `done`，调度器继续执行后继任务。

Reviewer 执行步骤：

1. 创建或复用 reviewer session。
2. 创建 issue detail 进度占位和 channel message。
3. runtime prompt 明确要求先调用 `ViewCurrentChannelIssue`。
4. runtime prompt 明确写入当前 workspace working directory，并要求审查该目录下的产物；默认将 `/tmp` 产物视为位置错误。
5. 执行 review。
6. 当前实现仍是 mock approve：
   - approve 时 task 标记为 `done`
   - reject/changes_requested 分支保留，但当前不会走到
7. 广播 `task.status_changed` 和 `task.updated`。

Reviewer 不再直接把整个 issue 更新为 `approved`。issue 是否完成由 dependency scheduler 根据所有 task 状态决定。

Reviewer 可用的 issue function tools：

- `ViewCurrentChannelIssue`
- `AddCurrentChannelComment`

## Issue Detail 消息和 Comment

共享进度 helper：

```text
packages/server/src/agents/issue-agent-progress.ts
```

当前参与该流程的 agent：

- planner
- task creator
- executor
- reviewer

每个 agent 开始时：

1. 创建一条 channel message，状态为 `streaming`。
2. 创建一条 issue comment，`source: 'agent_progress'`。
3. 广播：
   - `channel.message`
   - `issue.updated`

每个 agent 完成时：

1. 用完整 agent output 更新 channel message。
2. 用完整 agent output 更新 issue comment。
3. 对支持 runtime events 的 runtime，将 tool use/tool result 转成 channel message `parts`：
   - chain part 中显示 toolcall 历史。
   - tool detail 写入 tool detail store。
   - issue comment 正文也保留可读的 tool line。
4. 写入 metadata：
   - `agentSessionId`
   - `runtime`
   - `model`
- `summary`
- `duration`
- `taskId`
- `phase`
5. 广播：
   - `channel.message.updated`
   - `issue.updated`

`phase` 当前可能是：

- `planner`
- `task_creator`
- `executor`
- `reviewer`

Executor 和 reviewer 进度 comment 会带同一个 `taskId`，前端可据此显示它们属于同一个 task。

注意：完成 comment 使用完整 output，而不是 runtime summary。summary 可能被 runtime 截断，只适合作为 metadata，不适合作为最终正文。

## 前端状态更新事件

后端 agent 流程中，issue 状态变更应同时广播：

- `issue.status_changed`
- `issue.updated`

原因：

- `issue.status_changed` 只包含状态变更信息，适合窄用途监听。
- `issue.updated` 包含完整 issue，前端 issue list/detail 依赖它做 upsert 和重新渲染。

Task 变更广播：

- `task.created`
- `task.updated`
- `task.status_changed`
- `task.output`

Agent 运行广播：

- `agent.started`
- `agent.status_changed`
- `agent.output`
- `agent.completed`

## 状态流

典型 issue 状态变化：

```text
draft
  -> planned
  -> in_progress
  -> completed
```

异常或人工反馈路径：

```text
changes_requested -> planned -> in_progress -> completed
planned -> error
in_progress -> changes_requested
```

当前 reviewer mock approve 后只完成 task，不直接完成 issue。最终 issue completion 由 dependency scheduler 判断所有 task 是否 `done`。

## Git Commit Message 说明

Git commit API 本身没有截断 message：

```text
packages/server/src/routes/git.ts
packages/server/src/adapters/git.ts
```

之前的截断来自前端 Git changes panel 使用单行 input。当前已经改成 textarea，可提交多行完整 commit message。

## 当前限制

- Reviewer 仍是 mock approve，没有真正解析 review result。
- Task creator 选择逻辑使用第一个 enabled `custom` agent；没有专门的 task-creator role。
- 依赖调度允许并行 executor，尚无并发上限和文件写冲突保护。
- `ReplaceIssueTasks` 会删除非 running 旧任务；running task 会被保留在 `issue.tasks`。
- `agentConfigId` 校验只保证属于当前 issue channel 的 enabled agent preset；executor 执行时还要求该 preset role 为 `executor`。
