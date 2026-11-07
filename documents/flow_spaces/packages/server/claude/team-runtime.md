# Team 运行时编排（team-runtime.ts）

> `packages/server/src/services/team-runtime.ts`（1379 行）—— Team 多 Agent 协作的核心编排引擎。

## 定位

当一个 Team 消息需要某个 Agent 回复时，`team-runtime.ts` 负责整套调度：选目标 Agent → 构造上下文 Prompt → 创建运行时 → 执行 → 持久化消息/PARTS → 处理 handoff → 唤醒 owner。它是 Team 子系统的"大脑"，`routes/team.ts` 与 `builtin-tools/team-tools.ts` 都调用它暴露的入口。

## 关键常量与状态

- `TEAM_RUNTIME_WORKSPACE_ID = '__team__'`：Team 运行时使用的虚拟 workspaceId，Agent 会话都挂在这个 id 下，与真实工作区隔离。
- `activeTeamRuns: Map<string, { runtime, token, teamId, sessionId, targetAgentId }>`：正在运行的 Agent 调度表，key 为 `${teamId}:${sessionId}:${actorAgentId}:${targetAgentId}`。同 key 重复调度会先 `stop()` 旧的（token 机制防止竞态）。
- `runtimeFactory`：默认 `createAgentRuntime`，可通过 `setTeamRuntimeFactoryForTests` 替换以便测试。

## 数据模型（文件级持久化）

所有状态以 JSON 文件存于 `getDataDir()/team/<teamId>/[<sessionId>/]`：

| 文件 | 类型 | 路径函数 | 职责 |
|---|---|---|---|
| `info.json` | `Team` | `teamFilePath` | 团队基本信息 |
| `memberships.json` | `TeamMembership[]` | `teamMembershipsPath` | 成员列表（agentId/role/status） |
| `messages.json` | `TeamMessage[]` | `teamMessagesPath` | 会话消息（按 sessionId 分目录） |
| `deliveries.json` | `Delivery[]` | `teamDeliveriesPath` | 投递记录（recipient/sender/inboxStatus/executionStatus） |
| `runtimes.json` | `StoredTeamRuntime[]` | `teamRuntimesPath` | 运行时状态机（含 agentSessions 关联） |
| `tasks.json` | `TeamTask[]` | `teamTasksPath` | 任务列表（assignee/status） |
| `logs/team.log` | 文本 | `writeTeamRunLog` | 运行日志（按 run 追加，含 INPUT/OUTPUT/TOOL CALL/ERROR） |

## 核心类型

- `TeamRuntimeStatus`：`'idle' | 'running' | 'completed' | 'error'`
- `StoredTeamRuntime`：扩展 `TeamRuntime`，含 `lastMessageId` / `startedAt` / `output` / `agentSessions[]`
- `TeamRuntimeMessage`：会话消息视图（含 sender/recipient/content/parts/status）
- `TeamAgentReply`：Agent 回复结果（content/model/usage/agentContext）
- `QueuedTeamHandoff`：Agent 执行中排队的 handoff（targetAgentId/content/messageId）
- `TeamTask`：任务（id/title/assigneeAgentId/status: pending|running|completed|failed）

## 成员调度

### Agent 来源解析（三选一）

`executeTeamReply` 根据 `resolveTeamAgentSource(targetAgentId)` 分流：

| agentStore | 处理函数 | Agent 来源 |
|---|---|---|
| `'agent'` | `executePresetTeamReply` | `listPresets()` 中的预设 Agent |
| `'custom'` | `executeCustomTeamReply` | membership 内联的 `agent` 对象 |
| `'chat'`（默认） | `executeChatTeamReply` | `chatService.findAgent()` 的聊天 Agent |

三者都：创建/复用 agentService 会话 → `runtimeFactory()` 构造运行时 → `buildTeamAgentPrompt` 拼 prompt → `resolveTeamRuntimeTools` 装配工具 → `runtime.execute()` → `agentService.complete()` 记录用量。

### Leader / Participant 解析

- `resolveLeader(teamId, actorAgentId)`：按优先级 owner → admin → 任意非 actor 的 active 成员。
- `listParticipants(teamId, actorAgentId)`：所有 active 且非 actor 的成员，带 profile（name/role/runtimeKind/model 等）。
- `resolveTargetAgentId(teamId, actorAgentId, requested?)`：指定目标或回退到 owner。

## 消息路由

### 入口：`postTeamRuntimeMessage(input)`

1. 校验 team_id/session_id/actor_agent_id/content。
2. `resolveTargetAgentId` 定位目标 Agent。
3. `handleTeamMessageSend` 发送 direct 消息（status=running），创建投递记录。
4. `updateRuntime` 标记 status=running。
5. `collectConversationMessages` 收集历史，按 `contextLength`（默认 20）截断。
6. 广播 `team.runtime.updated` + `team.message.created`。
7. **异步** `dispatchTeamReply`（不阻塞返回）。

### 执行：`dispatchTeamReply(...)`

这是最核心的函数，流程：

1. **预处理**：非 owner 目标 `markNextTaskRunning`；`markRuntimeDeliveryRead`；stop 同 key 旧运行。
2. **创建 placeholder 消息**：先发一条 "Thinking" 消息（status=running），作为流式 parts 的载体。
3. **partsTracker**：`createAgentMessagePartsTracker` 跟踪 reasoning/tool_use/tool_result 事件，实时 `updateTeamMessage` 更新 parts 并广播 `team.message.updated`。
4. **执行 Agent**：`executeTeamReply` → 内部分流到 preset/chat/custom。
5. **成功路径**：
   - 校验非 owner Agent 是否 `team_task_manage action=complete`（否则抛错）。
   - `recordAgentSession` 关联 agentSessionId。
   - `persistTeamAgentSessionHistory` 持久化完整会话。
   - 若有 handoffs：更新 handoff 消息 parts → 删除 placeholder → 递归 `dispatchQueuedHandoff`。
   - 若无 handoffs：用最终回复替换 placeholder 消息 → 广播 `team.runtime.updated`。
6. **失败路径**：`markAgentTaskFailed` → 更新消息为 "处理失败" → status=error → 广播。
7. **finally**：`writeTeamRunLog` 落盘日志；清理 `activeTeamRuns`。
8. **后置**：无 handoff 且非 owner 时 `maybeWakeOwnerForTasks`。

### Handoff 机制

Agent 在执行中调用 `team_message_send`（mode=direct）会触发 handoff：
- `resolveTeamRuntimeTools` 的 `handleMessageSend` 回调将 direct 消息推入 `handoffs` 队列。
- Agent 执行完后，`dispatchTeamReply` 遍历 `handoffs`，对每个调用 `dispatchQueuedHandoff`。
- `dispatchQueuedHandoff` 更新 runtime.leaderAgentId 为 handoff 目标，递归 `dispatchTeamReply`。

## 任务管理

### Owner 责任（系统 Prompt 强制）

`buildTeamAgentPrompt` 与 `buildTeamAgentSystemPrompt` 对 owner 注入强制策略：
- 首次回复前必须 `team_manage action=get` 查看全部成员。
- 必须 `team_task_manage action=create` 一次性创建所有下游任务（只分配给非 owner）。
- 完成时必须 `team_task_complete`（output 含最终交付物）。
- 被 `maybeWakeOwnerForTasks` 唤醒时，`team_task_manage action=list` 取下一未完成任务下发。

### 非 Owner 责任

- 完成前必须 `team_task_manage action=complete` 标记自己的任务。
- 需要 upstream 输出时先 `team_agent_session_list` 取 session_id，再 `GetAgentSessionDetail`（禁止猜测 session id）。

### 工具入口

| 导出函数 | 对应工具 | 职责 |
|---|---|---|
| `handleTeamTaskManage` | `team_task_manage` | create/list/complete 任务（owner 才能 create） |
| `handleTeamAgentSessionList` | `team_agent_session_list` | 列出某 Agent 的历史会话 |
| `handleTeamTaskComplete` | `team_task_complete` | owner 标记整个 team task 完成 |
| `getTeamRuntime` | `team_runtime_get` | 加载运行时状态/成员/消息/任务 |
| `postTeamRuntimeMessage` | `team_message_send`(direct) | 发消息并触发 Agent 回复 |
| `listTeamSessions` | `team_sessions_list` | 列出团队所有会话 |
| `handleTeamMessageSendAndRun` | — | 路由层：direct 消息走 postTeamRuntimeMessage，否则走普通 send |

## 工具装配

`resolveTeamRuntimeTools` 为 Team Agent 装配：
- **必需 Team 工具**：`team_task_manage` / `team_agent_session_list` / `GetAgentSessionDetail`（owner 额外 `team_manage` / `team_task_complete`）。
- **功能工具**：command / agent / database / workspace-file / workflow-execution。
- `handleMessageSend` 回调：owner 首次 handoff 前必须有任务列表（否则 `TASK_LIST_REQUIRED`）；同一次 run 内 direct handoff 只能一次。

## 事件广播

`broadcastTeamRuntimeEvent(event, payload)` → `broadcastToWorkspace(TEAM_RUNTIME_WORKSPACE_ID, ...)`：

| 事件 | 触发时机 |
|---|---|
| `team.runtime.updated` | runtime 状态变更（running/completed/error） |
| `team.message.created` | 新消息（用户发送/placeholder/Agent handoff） |
| `team.message.updated` | 消息内容更新（parts 流式/最终回复/失败） |

## 会话生命周期

```
idle → (postTeamRuntimeMessage) → running → (dispatchTeamReply 成功) → running/completed
                                          → (失败) → error
                                          → (handoff) → running (新 leader)
                                          → (owner team_task_complete) → completed
```

- `ensureRuntime`：不存在则创建 idle runtime。
- `findLatestRuntime`：按 updatedAt 取最新。
- `maybeWakeOwnerForTasks`：非 owner 完成且无 handoff，若任务未全完成且无成员在跑，唤醒 owner 继续调度。
- 会话历史持久化：`persistTeamAgentSessionHistory` 写入 agentService 的 session detail（含 user/agent 消息 + systemPrompt + fullPrompt）。
