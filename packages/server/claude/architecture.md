# 架构详解

## Agent 运行时架构

支持 6 种运行时，通过 `createAgentRuntime(config)` 工厂函数按 `config.kind` 切换。

| 运行时 | kind | 文件 | 行数 |
|--------|------|------|------|
| OpenAgentSdk | open-agent-sdk | adapters/open-agent-sdk-runtime.ts | 332 |
| ClaudeCode | claude-code | adapters/claude-code-runtime/ (7 文件) | ~1300 |
| Codex | codex | adapters/codex-runtime.ts | 602 |
| LangChain | langchain | adapters/langchain-runtime.ts | 954 |
| Hermes | hermes | adapters/hermes-runtime.ts | 901 |
| OhMyPi | oh-my-pi | adapters/oh-my-pi-runtime.ts | 943 |

### ClaudeCodeRuntime 子模块

| 文件 | 说明 |
|------|------|
| index.ts | 主类（364 行） |
| sdk-config.ts | SDK 配置构建（239 行） |
| adapter-pool.ts | Bridge 引用计数式复用池 |
| anthropic-bridge.ts | HTTP Bridge 服务器（232 行） |
| protocol-converter.ts | 协议转换（339 行） |
| message-format.ts | 消息格式化（279 行） |
| types.ts | 类型定义 |

## Workflow 执行引擎

DAG 可视化编排 + 执行引擎，平台核心。6 个核心文件：

| 文件 | 行数 | 职责 |
|------|------|------|
| `services/execution-manager.ts` | 2043 | 执行引擎核心（会话/调度/节点分发/循环/变量/断点/事件） |
| `services/workflow.ts` | 487 | CRUD + DAG 校验 + 角色刷新 + Cron 校验 + 任务映射 |
| `services/workflow-trigger-service.ts` | 148 | cron / hook 触发器 |
| `services/workflow-command-runner.ts` | 37 | command 节点（child_process） |
| `services/mini-app.ts` | 327 | UI 项目（react/html）+ ZIP 导入导出 |
| `storage/workflow-store.ts` | 434 | 目录式持久化（见 [storage.md](storage.md)） |

### 会话生命周期（ExecutionManager）

```
execute(request, ownerClientId, eventSink?) → 创建 session，返回 { executionId, status:'running' }
  └─ run() → buildExecutionOrder → runSafe → runFromIndex（异步，不阻塞返回）
debugNode()      → 单节点调试，跳过 executionOrder，直接 executeNode
pause/resume/stop → 状态机：running ⇄ paused / → error
getExecutionRecovery() → 断线重连：活跃 session 优先，否则 finishedRecovery（TTL 2 分钟）
```

session 内存态（`ExecutionSession`）：含 nodes/edges/groups/variables 快照、context（`__data__`/`__env__`/`__input__`/`__config__`/`__loop__`）、executionOrder、steps、activeBranches、loopStack、breakpointBypassKeys、recentEvents（100 条）。

### 执行流程（runFromIndex）

逐节点调度，每个节点先过 5 道关卡再执行：

1. `stopRequested` → 直接置 error 并持久化
2. `pauseRequested` → 置 paused，记录 currentIndex，等 resume
3. **分支剪枝**：非活跃分支节点 → 记录 skipped
4. **依赖检查**：上游未完成 → skipped（`areIncomingNodesCompleted`）
5. **节点状态**：disabled → 整流终止；skipped → 跳过；其余执行
6. 断点 start（执行前）/ end（执行后），`breakpointBypassKeys` 防止 resume 后重复暂停

### 节点分发（dispatchNode，22+ 种类型）

| 类别 | 节点 |
|------|------|
| 流程控制 | `start` / `end` / `switch` / `delay`（100ms–30s 钳制）/ `loop`+`loop_body` / `loop_break` / `sub_workflow` |
| 数据处理 | `variable_aggregate` / `flatten_array` / `pluck_array_key` / `array_text_replace` / `set_variable` / `get_variable` / `delete_variable` |
| 交互（经 InteractionManager） | `alert` / `prompt` / `form` / `table_display`（支持 single/multi 选择） |
| 执行 | `run_code`（`new Function` 沙箱，重写 console） / `agent_run`（有 agentConfigId 走 Agent 运行时，否则走交互式 agent_chat） |
| 展示 | `toast` / `gallery_preview` / `table_display` |
| 兜底 | 插件自定义节点 → `pluginService.executeWorkflowNode(type, data)` |

### 循环（loop）

- `AsyncLocalStorage` 隔离每次迭代的 worker state（branch / data / frame / inputs），支持**并发窗口**（`concurrency`）
- 三种迭代模式：`count` / `array` / `infinite`
- 循环体内支持嵌套 scope 节点图或 embedded workflow（bodyWorkflow）
- 暴露变量：`__loop__.vars.*` / `.index` / `.count` / `.item` / `.isFirst` / `.isLast`
- `loop_break` 置 `frame.breakRequested`，调度器停止派发新迭代

### 分支可达性（switch）

`switch` 节点求值 conditions（14 种 operator：equals/contains/greater_than/is_empty…），输出 `__branch__` 写入 `activeBranches[nodeId]`。`isNodeReachable` / `isActiveEdge` 据此剪掉非活跃分支，`areIncomingNodesCompleted` 确保聚合节点等齐上游。

### 变量模板（resolveStringValue）

字符串值解析，**完整匹配返回原值**（保类型），**否则内联字符串替换**：

| 模板 | 取值 |
|------|------|
| `{{__env__.key}}` | 工作流环境变量（set_variable 写入） |
| `{{__data__['nodeId'].path}}` | 节点输出 |
| `{{__inputs__['nodeId'].path}}` | 节点输入 |
| `{{__loop__.vars.key}}` / `{{__loop__.index}}` 等 | 循环变量 |
| `{{__config__['pluginId']['key'].path}}` | 插件配置（自动 JSON.parse） |
| `{{__WORKFLOW__.key}}` | 当前工作流上下文对象（见下） |
| `{{context.key}}` | 任意上下文路径 |

#### `__WORKFLOW__` 工作流上下文对象

每次执行在 session 初始化时由 `buildWorkflowContextObject` 注入 `context.__WORKFLOW__`，暴露当前工作流元信息供节点引用：

- 字段：`id` / `name` / `description` / `type` / `folderId` / `tags` / `published` / `createdAt` / `updatedAt` / `executionId` / `ownerClientId` / `source` / `workspaceId?`
- `source` 由 `inferWorkflowSource` 推断：显式传入优先；否则 `ownerClientId` 以 `sse:` 前缀 → `api`；映射表 `__cron__→cron`、`__hook__→hook`、`agent-tools→agent-tools`；其余 → `web`

路径支持点号 + 方括号混写（`a.b['c'][0]`），经 `normalizeVariablePath` 归一化。

### 事件流（emitEvent）

每个 session 维护单调递增 `eventSequence` + 100 条 `recentEvents` 回放缓冲，经 WS 推送：

- `execution:log` / `execution:context` —— 全量快照同步
- `node:start` / `node:progress` / `node:complete` / `node:error`
- `workflow:started` / `workflow:paused` / `workflow:resumed` / `workflow:completed` / `workflow:error`

### 触发器（WorkflowTriggerService）

- **cron**：`node-cron.schedule(expr, fn, { timezone })`，到点调用 `executionManager.execute({ workflowId }, '__cron__')`
- **hook**：`hookName → Set<{workflowId, triggerId}>`，外部 `POST /api/workflows/hook/:hookName` 触发；`getHookConflicts` 检测多工作流冲突
- `start()` 启动时全量注册，`reloadWorkflow` / `removeWorkflow` 增量维护

### command 节点（executeCommandNode）

`child_process.exec`，cwd 默认 `workspace.boundDirs[0]`，超时 **300s**，maxBuffer **10MB**，可注入 `data.env` + 指定 `data.shell`。

### Workflow UI 项目

独立于 DAG 的轻量 UI 项目（`react` / `html`）：文件树持久化、`getFileTree` / `readFile` / `writeFile` / 二进制 `writeDataFile`。ZIP 导出用 `archiver`（含 `manifest.json` + `src/`），导入用 `yauzl`（路径安全校验，拒绝 `..` / 绝对路径 / 盘符）。

### DAG 校验（validateDAG）

`workflow.ts` 在 create/update 时校验：非空节点、禁自环、禁重复边、边引用节点须存在、**Kahn 拓扑排序检测环**。`resolveStaleRoles` 用最新 Agent preset 刷新 role/avatarUrl/modelId，失效引用直接抛错。

### 端到端数据流

```
web workflow-editor store
  └─ WS send: workflow:execute / pause / resume / stop / debug-node / interaction
ExecutionManager.execute
  └─ 节点分发（含 InteractionManager 阻塞等待 UI 响应）
      └─ 事件 emit
          └─ WS push → web store 更新 executionStatus / executionLog / pendingInteraction
```

## Issue 自动化流程

```
Issue 创建 -> workflowId?
  -> 有: loadWorkflow -> createTasksFromWorkflow -> 依赖调度 -> runIssueTask
  -> 无: Issue -> error
```

关键文件：
- issue-agent-runner.ts（66 行）：入口
- issue-task-controller.ts（851 行）：任务控制器
- issue-retry.ts（96 行）：启动时恢复

## 通知中心

services/notification-hub/（14 文件）：
- lark-adapter.ts / wechat-adapter.ts：飞书/企微适配器
- bot-agent.ts：Bot Agent 执行
- bot-commands.ts（405 行）：16 个内置斜杠命令
- service.ts：服务生命周期管理

## 代码结构

```
src/
  app.ts (435 行)          # 入口
  middleware/auth.ts        # 认证
  routes/ (37 文件)         # REST API
  services/ (50+ 文件)      # 业务逻辑
  storage/ (20+ 文件)       # 持久化
  adapters/ (16 文件)       # Agent 运行时
  agents/ (10 文件)         # Agent 编排
  ws/ (8 文件)              # WebSocket 处理
  hooks/ (1 文件)           # Agent Hook 链
```
