# Function Call 工具

本文档描述 Agent 使用的服务端 function-call 工具层。

## 目标

Function-call 工具必须是真正可执行的服务端能力，而非仅停留在 prompt 描述层面。

该层提供：

- 运行时无关的工具抽象
- 服务端控制的执行，用于工作空间数据操作
- 内置 Issue 工具的严格频道级校验
- 运行时适配器，通过各自的原生工具协议暴露相同的工具

## 核心抽象

共享的服务端抽象为 `AgentFunctionTool`，定义在：

```text
packages/server/src/adapters/agent-runtime-types.ts
```

结构：

```ts
interface AgentFunctionTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnly?: boolean;
    destructive?: boolean;
    openWorld?: boolean;
  };
  execute: (input: unknown) => Promise<unknown>;
}
```

运行时处理器通过 `AgentRunOptions.functionTools` 接收这些工具。

## 内置 Issue 工具

当前内置工具位于：

```text
packages/server/src/services/builtin-tools.ts
```

工具列表：

- `CreateCurrentChannelIssue`
- `ViewCurrentChannelIssue`

这两个工具仅在当前频道为绑定了 `issueId` 的 Issue 频道时可用。

重要约束：

- 工具输入必须包含 `issueId`
- `issueId` 必须与当前频道绑定的 `issueId` 匹配
- 工具无法创建或查看其他频道的 Issue
- 创建或更新当前 Issue 不会创建新频道。Issue 创建时已在 `issueService.create()` 中创建并绑定了频道

## 运行时集成

### Claude Code 运行时

实现在：

```text
packages/server/src/adapters/claude-code-runtime.ts
```

Claude 集成使用 Claude Agent SDK 的进程内 SDK MCP Server：

- `createSdkMcpServer()`
- `tool()`

服务端注册名为 `agent-spaces` 的 MCP Server。

每个 `AgentFunctionTool` 被转换为 SDK MCP 工具。当模型调用工具时，服务端执行 `AgentFunctionTool.execute()` 并将 JSON 结果作为 MCP 工具输出返回。

### 其他运行时

`codex` 和 `open-agent-sdk` 当前未暴露相同的本地 function-tool 注册路径。

它们不应通过仅 prompt 的方式假装支持这些工具。后续适配器工作应将各自的原生自定义工具 API（如果有）映射到相同的 `AgentFunctionTool` 抽象。

## 执行流程

1. `runMentionedAgent()` 加载当前活跃频道
2. `createIssueFunctionTools(workspaceId, channel)` 返回频道级工具
3. 工具通过 `functionTools` 传递给 `runtime.execute()`
4. 运行时适配器通过其原生工具协议暴露工具
5. 模型调用 function tool
6. 服务端执行 `AgentFunctionTool.execute(input)`
7. 运行时发出 `tool_use` / `tool_result` 事件
8. WebSocket 处理器存储工具详情并广播更新后的频道/Issue 状态

## UI 展示

聊天输入框的 `Tools` 菜单展示内置 Issue 工具：

```text
packages/web/src/components/chat/chat-input.tsx
```

这些入口在所有频道中可见，但仅在当前频道为绑定了 `issueId` 的 Issue 频道时才可用（否则禁用）。

UI 仅作为能力指示器。实际的授权和作用域限制在服务端强制执行。

## 校验规则

内置 Issue 工具在服务层强制执行校验：

- 输入必须是对象
- `input.issueId` 必须等于 `channel.issueId`
- 绑定的 Issue 必须存在

即使模型或客户端发送格式错误的工具输入，信任边界仍保持在服务端。
