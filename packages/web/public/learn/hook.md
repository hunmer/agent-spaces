# Hook 系统

Hook 允许你在 Agent 运行生命周期的关键节点（会话开始、工具调用前后、子 Agent 启停、任务创建完成、会话结束等）执行自定义操作，实现精细化的 Agent 行为控制与外部集成。

## 核心特点

- **以工作空间为作用域**，按「事件 + 匹配器」触发规则
- **每条规则一种动作**：`command` / `webhook` / `script`
- **fire-and-forget**：主要用于记录、通知、外部集成，**不能阻塞或修改工具执行**
- Agent 运行时启动时加载一次启用配置，匹配规则并发执行（`Promise.allSettled`），错误被吞掉，不阻塞 Agent

## 支持的事件

**会话生命周期** — `SessionStart` / `SessionEnd` / `Stop` / `StopFailure`

**用户输入与指令** — `UserPromptSubmit` / `UserPromptExpansion` / `InstructionsLoaded` / `CwdChanged`

**工具调用** — `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PostToolBatch` / `PermissionDenied`

**通知与子 Agent** — `Notification` / `SubagentStart` / `SubagentStop` / `TeammateIdle`

**任务与压缩** — `TaskCreated` / `TaskCompleted` / `PreCompact` / `PostCompact`

**其他** — `WorktreeRemove` / `Elicitation` / `ElicitationResult`

## 匹配器（matcher）

- **工具事件** — matcher 是工具名（如 `Edit`、`TodoWrite`、`CreateCurrentChannelIssue`）
- **生命周期事件** — 通常为 `*`

三种写法：`*`（全匹配）/ 精确字符串 / 正则字符串（`/` 包裹，如 `/.*Database.*/`）。无效正则回退精确匹配。

## 动作类型

### command（Shell 命令）

`node:child_process.exec` 执行，超时默认 10s（上限 30s）。注入 `HOOK_*` 环境变量：`HOOK_EVENT_NAME` / `HOOK_EVENT_PAYLOAD` / `HOOK_TOOL_NAME` / `HOOK_TOOL_INPUT` / `HOOK_TOOL_RESULT` / `HOOK_WORKSPACE_ID` 等。

> `UserPromptSubmit` 的 `HOOK_EVENT_PAYLOAD` 同时含低噪 `userMessage`（用户原始提示）和完整展开的 `fullPrompt`，消费者应读 `userMessage`。

### webhook

向 `rule.url` 发送 JSON `POST`，请求体含 `event` / `toolName` / `toolInput` / `toolResult` / `payload` / `workspaceId`。非 2xx 与网络失败仅记录，不影响 Agent。

### script

被 schema 识别但**当前未实现**，引擎记录 warning 并跳过。

## 配置文件

每个工作空间的 Hook 存为 `*.hook.json`，位置：

```text
~/.agent-spaces-data/workspaces/<workspace-id>/hooks/*.hook.json
```

加载器只读取 `.hook.json` 结尾的文件。

示例：

```json
{
  "name": "通知代码修改",
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

## 管理 Hook

- `/settings/hooks` — 创建、编辑、删除、上传 `.hook.json`，Monaco 直接编辑 JSON
- 工作空间侧边栏 Hooks 对话框 — 快速查看、启用/禁用、测试

## 限制

- Hook 在 Agent 运行开始时加载一次，中途改 JSON 只影响下次运行
- `command` / `webhook` 均为 fire-and-forget，失败只记日志
- `script` 类型仅 schema 校验，运行时不执行
- 当前不能拦截、阻塞、改写工具调用结果
