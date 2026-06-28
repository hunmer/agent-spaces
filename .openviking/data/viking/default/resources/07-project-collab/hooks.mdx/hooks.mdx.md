
# Hook 系统

Hook 系统允许你在 Agent 运行生命周期的关键节点（会话开始、工具调用前后、子 Agent 启停、任务创建完成、会话结束等）执行自定义操作，实现精细化的 Agent 行为控制与外部集成。

## 核心概念

Hook 以工作空间（workspace）为作用域，按「事件 + 匹配器」触发规则。每条规则可配置一种动作类型（command / webhook / script）。Hook 引擎在 Agent 运行时启动时加载一次启用配置，匹配到的规则并发执行（`Promise.allSettled`），错误会被记录并吞掉，不会阻塞 Agent 运行。

Hook 是 fire-and-forget 的：主要用于记录、通知、外部集成，**当前不支持阻塞或修改工具执行**。

## 支持的事件

后端 Hook 引擎支持以下事件类型（完整类型见 `ClaudeHookEventName`，定义于 `packages/shared/src/types/hooks.ts`）：

**会话生命周期**
- `SessionStart` — Agent 查询开始前
- `SessionEnd` — 运行时清理时
- `Stop` — 一轮对话结束或等待用户输入
- `StopFailure` — 运行时失败

**用户输入与指令**
- `UserPromptSubmit` — 用户提示词提交给 Claude 之前
- `UserPromptExpansion` — 提示词展开相关
- `InstructionsLoaded` — 展开后的提示词包含已加载的指令标记
- `CwdChanged` — 工作目录变更

**工具调用**
- `PreToolUse` — 工具调用之前
- `PostToolUse` — 工具调用（tool_result）之后
- `PostToolUseFailure` — 工具结果看起来是失败时
- `PostToolBatch` — 来自 Claude 的 `tool_use_summary`
- `PermissionDenied` — 权限被拒绝

**通知与子 Agent**
- `Notification` — SDK 通知类系统消息
- `SubagentStart` — 子 Agent 启动
- `SubagentStop` — 子 Agent 停止
- `TeammateIdle` — 队友 Agent 空闲

**任务与压缩**
- `TaskCreated` — 观察到匹配的工具调用名时
- `TaskCompleted` — 观察到匹配的工具调用名时
- `PreCompact` — 压缩前
- `PostCompact` — 压缩后

**其他**
- `WorktreeRemove` — Worktree 移除
- `Elicitation` — 引导交互
- `ElicitationResult` — 引导交互结果

> 注意：引擎支持上述全部事件键，但只有运行时实际发出的事件才会触发规则。某些上游 Claude Code 存在但当前后端未发出的事件，不在本地支持的类型联合中。

## 匹配器

每个事件有一个 `matcherValue`：

- **工具事件**：`matcherValue` 是工具名（例如 `TodoWrite`、`Edit`、`CreateCurrentChannelIssue`）。
- **生命周期事件**：`matcherValue` 通常为 `*`。

规则匹配支持三种 matcher 写法：

- `*` — 匹配所有
- 精确字符串 — 完全相等
- 正则字符串 — 以 `/` 开头并以 `/` 结尾，例如 `/.*Database.*/`

无效的正则 matcher 不会抛错，引擎会记录 warning 并回退到精确匹配。

## 动作类型

每条规则支持三种动作类型（`HookRule.type`）：

### command（Shell 命令）

使用 `node:child_process.exec` 执行本地 Shell 命令：

- 超时默认 `10000ms`，上限 `30000ms`
- 进程继承服务器环境变量，并额外注入一批 `HOOK_*` 环境变量（如 `HOOK_EVENT_NAME`、`HOOK_EVENT_PAYLOAD`、`HOOK_MATCHER_VALUE`、`HOOK_TOOL_NAME`、`HOOK_TOOL_INPUT`、`HOOK_TOOL_RESULT`、`HOOK_WORKSPACE_ID`、`HOOK_TRIGGERED_AT` 等）
- 对 `UserPromptSubmit`，`HOOK_EVENT_PAYLOAD` 同时包含低噪声的 `userMessage`（用户原始提示）和完整展开的 `fullPrompt`（发给 Claude 的提示）；Hook 消费者应读取 `userMessage`

### webhook

向 `rule.url` 发送 JSON `POST` 请求：

- 请求体包含 `event`、`toolName`、`matcherValue`、`toolInput`、`toolResult`、`payload`、`timestamp`、`workspaceId`
- 非 2xx 响应和网络失败会被记录但不会导致 Agent 运行失败

### script

`script` 类型被 schema 识别但**当前未实现**，引擎会记录 warning 并跳过该规则。

## Hook 配置

每个工作空间的 Hook 配置存储为 `*.hook.json` 文件，位置在：

```text
~/.agent-spaces-data/workspaces/<workspace-id>/hooks/*.hook.json
```

加载器只读取以 `.hook.json` 结尾的文件。配置结构如下（`HookConfig` + `HookRule`）：

```json
{
  "name": "通知代码修改",
  "description": "在 Edit 工具调用后发送 webhook 通知",
  "enabled": true,
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "type": "webhook",
        "url": "https://example.com/notify",
        "timeout": 10000
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "type": "command",
        "command": "echo 'session ended' >> ~/.agent-spaces-data/hook-debug.log"
      }
    ]
  }
}
```

其中 `hooks` 是一个以事件名为键、规则数组为值的映射（`Partial<Record<ClaudeHookEventName, HookRule[]>>`）。每条规则包含 `matcher`、`type`（`command`/`webhook`/`script`），以及对应动作的字段（`command` / `url` / `function`）和可选 `timeout`。

> 注意：Hook 在每次 Agent 运行开始时加载一次。编辑 hook 文件只影响新的运行，不会影响已经在运行的引擎实例。

## 管理 Hook

### 通过设置页面

在 `/settings/hooks` 页面管理所有 Hook：

- 创建新 Hook
- 编辑 Hook 配置
- 删除不需要的 Hook
- 上传 `.hook.json` 文件
- Monaco 编辑器直接编辑 JSON

### 通过侧边栏

在工作空间侧边栏的 Hooks 对话框中管理：

- 快速查看当前工作空间的 Hook
- 启用/禁用 Hook
- 测试 Hook 是否正常工作

## 执行流程

Hook 引擎通过 `wrapOnEventWithHooks(onEvent, workspaceId, hooksEnabled)` 包裹 Agent 运行时事件，工作流程：

1. 运行时启动时一次性加载该工作空间所有启用的 Hook 配置
2. 对正常运行时事件，转发给原始 handler
3. 对内部 `hook_event` 事件，仅在后端处理，不会转发给 UI / SSE 消费者
4. 解析 tool-use id，使 `tool_result` 能触发 `PostToolUse`
5. 当 Claude Code 返回 tool result 但缺少 `toolUseId` 时，回退到最近一次 `tool_use`
6. 所有匹配规则通过 `Promise.allSettled` 并发执行

Hook 的 command/webhook 错误会被记录并吞掉，不会阻塞或影响 Agent 运行结果。

## 调试与限制

调试 Hook 时，最实用的做法是在当前工作空间的 `hooks/` 目录放一个 `command` 类型规则，把关键环境变量追加写入日志文件，而不是覆盖写入。尤其是 `UserPromptSubmit` 事件，建议优先读取 `HOOK_EVENT_PAYLOAD.userMessage`，不要直接拿展开后的 `fullPrompt` 做业务判断。

当前限制：

- Hook 在一次 Agent 运行开始时只加载一次；中途改 JSON 只影响下一次运行。
- `command` / `webhook` 都是 fire-and-forget，失败只记日志，不会中断 Agent。
- `script` 类型目前仅通过 schema 校验，运行时不会执行。
- 当前 Hook 不能拦截、阻塞或改写工具调用结果，只能做旁路通知、记录和外部集成。
