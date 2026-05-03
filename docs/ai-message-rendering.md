# AI Message Rendering

本文档说明当前 AI 消息回复机制、实时更新链路，以及聊天 UI 如何根据结构化消息块展示 chain、工具调用、工具详情、子 agent、权限确认、上下文统计和附件。

## 目标

AI 消息不再只在完成后展示最终文本。运行中应该逐步展示：

- agent 正在处理
- AI 中间输出
- Read / Write / Edit / Bash 等工具调用记录
- 工具调用详情，包括 input/output 懒加载
- Edit/MultiEdit 的实际编辑 diff
- Bash 输出
- agent 自主调用的 subagent
- 权限确认请求
- 上下文和 token 使用统计
- 最终回答

普通用户 `@agent` 触发的主 agent 不使用 subagent 卡片展示。`subagent.tsx` 只用于 agent 运行中主动调用 Task/subagent 时的展示。

## Message 数据结构

共享类型定义在：

- `packages/shared/src/types/channel.ts`

`Message` 保持兼容原有 `content` 文本字段，同时新增：

- `attachments?: Attachment[]`
- `parts?: MessagePart[]`
- `metadata?: MessageMetadata`

`parts` 是 UI 展示的主要数据来源。当前支持：

- `text`：最终结论文本，只用于 chain 下方的最终 Markdown
- `reasoning`：初始化/兼容用思考过程，可带 `streaming/completed` 状态
- `chain`：统一 chain 容器，包含 AI 中间消息 step 和工具调用 step
- `terminal`：命令和终端输出
- `confirmation`：工具权限确认请求
- `context`：上下文窗口和 token 使用
- `subagent`：agent 主动调用的子 agent
- `ask_user_question`：agent 向用户提问

## 后端回复链路

入口：

- `runMentionedAgent()` in `packages/server/src/ws/handler.ts`

流程：

1. 用户在聊天输入框中发送消息，`ChatInput` 通过 websocket 发出 `channel.message`。
2. 服务端创建用户消息并广播 `channel.message`。
3. 服务端从消息 HTML 和 mentions 中提取 agent id。
4. 对每个被提及的 agent 创建一个 streaming 状态的 pending 消息。
5. runtime 开始执行 agent。
6. runtime 每收到一条可展示事件，就通过 `AgentRunOptions.onEvent` 回调给 `runMentionedAgent()`。
7. `runMentionedAgent()` 把实时输出累计到 `liveOutput`，调用 `buildAgentMessageParts()` 生成结构化 `parts`。
8. 服务端更新 pending message，并广播 `channel.message.updated`。
9. agent 完成后，服务端写入最终 `content/status/metadata/parts`，再次广播 `channel.message.updated`。

实时更新做了约 120ms 的节流，避免工具事件过密时频繁写消息文件和广播。

## Runtime 事件

runtime 接口定义在：

- `packages/server/src/adapters/agent-runtime-types.ts`

`AgentRunOptions` 支持：

```ts
onEvent?: (event: AgentRuntimeEvent) => void
```

当前事件形态：

```ts
type AgentRuntimeEvent =
  | { type: 'output'; line: string }
  | { type: 'tool_use'; id: string; name: string; input?: unknown; line: string }
  | { type: 'tool_result'; toolUseId?: string; result: unknown }
```

`ClaudeCodeRuntime` 在 SDK message loop 中把 assistant text、tool_use、tool_progress、tool_use_summary、local command output 等格式化为可展示行，并触发 `output` 事件。

同时，Claude tool_use 会触发结构化 `tool_use` 事件，用于保存完整工具 input；tool_use_result/tool_result 会触发 `tool_result` 事件，用于保存完整工具 output。这些详情不进入实时 message parts，前端展开详情时再通过接口懒加载。

示例：

```text
Tool: Read file_path="/path/to/file.ts"
Tool: Write file_path="/path/to/README.md"
Tool: Edit file_path="/path/to/app.tsx"
Tool: Bash command="pnpm build"
Write running (2s)
```

这些行同时会进入 server log，格式类似：

```text
[claude-code] tool use | id=... name=Write input=file_path="..."
[claude-code] tool result | parent=... result=...
```

`OpenAgentSdkRuntime` 当前 `prompt()` 接口只暴露最终 text/usage，不暴露逐工具事件。因此它只能在完成后通过 `onEvent` 推送最终文本。

## Chain 和工具调用解析

chain 构造和工具调用解析集中在：

- `buildAgentMessageParts()` in `packages/server/src/ws/handler.ts`

规则：

- 以 `Tool:`、`Read`、`Write`、`Edit`、`MultiEdit`、`Bash`、`Grep`、`Glob` 等开头的行会被识别为工具相关行。
- `chain` part 是统一 chain 容器，前端用 `chain-of-thought.tsx` 展示。
- chain 按 runtime 输出顺序包含两类 step：
  - `kind: "message"`：AI 中间输出，用 Markdown 显示在 chain 内。
  - `kind: "tool"` 或未设置 kind：工具调用，显示精简摘要和可懒加载详情。
- 最后一条非工具 AI 输出被视为最终结论，只进入 `text` part，不再加入 chain。
- 如果 runtime 重复追加同一段最终结论，后端会按内容归一化去重，避免 chain 最后一条 AI message 和最终 Markdown 重复。
- 普通工具调用会被压缩成精简摘要，例如 `Read timer.js`、`Update 2 todos`、`Run command`，不会直接展示原始 JSON 参数。
- Read/Edit/Write 等文件工具会把 workspace 内绝对路径归一为相对路径；前端点击文件路径时调用 `useEditorStore.openFile(workspaceId, path)`，从而在 editor tabs 中打开文件。
- `Tool: Task ...` 会进入 `subagent` part，前端用 `subagent.tsx` 展示。
- 非工具行如果不是最终结论，会作为 chain 内 AI message step；最终结论才作为 `text` part 展示在 chain 下方。

重要约定：主 agent 被用户 `@` 唤起时，不生成 `subagent` part。只有 Task/subagent 工具调用会生成 `subagent` part。

## 工具详情懒加载

完整工具详情不会直接写入 `parts`。服务端会把结构化详情保存到：

- `packages/server/src/services/tool-detail.ts`
- 存储文件：`tool-details.json`

查询接口：

```text
GET /api/workspaces/:id/channels/:channelId/messages/:messageId/tool-details/:detailId
```

详情内容包含：

- `input`：工具调用参数
- `output`：工具执行结果
- `raw`：原始格式化工具行

`tool_result` 关联规则：

1. 如果 SDK 提供 `parent_tool_use_id`，按 tool use id 精确关联。
2. 如果 parent 缺失或为 `-`，从 result 中提取 `file.filePath` / `filePath`，匹配 tool input 的 `file_path` / `path`。
3. 同一个文件被多次 Edit 时，按倒序匹配最近一个还没有 output 的 detail，避免多次编辑都显示同一份结果。
4. 仍匹配不到时，挂到最近一个还没有 output 的工具 detail。

前端详情展示：

- JSON input/output 使用 `readonly-code-block.tsx`，基于 Monaco Editor 只读展示。
- 字符串 output 使用 plaintext Monaco 只读展示。
- Edit/MultiEdit 使用 `packages/web/src/components/git/diff-viewer.tsx` 展示 diff。
- Edit diff 优先使用 output 中的完整文件内容作为 modified 内容；如果没有完整文件内容，则使用 input 的 `old_string/new_string` 或 `edits[]` 构造 diff。

## 前端展示链路

主要文件：

- `packages/web/src/components/chat/message-item.tsx`
- `packages/web/src/components/chat/message-parts.tsx`

`MessageItem` 负责头像、发送者、时间、复制/编辑/删除等外层消息 UI。

消息内容由 `MessageParts` 渲染：

1. 先渲染 `message.attachments`
2. 再按顺序渲染 `message.parts`
3. `chain` part 渲染统一 chain，包含 AI 中间消息和工具 step
4. `text` part 渲染最终结论 Markdown
5. 如果没有 `text` part，则回退渲染 `message.content`
6. 如果消息仍在 pending/streaming 且没有 parts，则显示 loader

## UI 组件映射

| MessagePart type | UI component | 用途 |
| --- | --- | --- |
| `text` | `Markdown` | 最终结论输出 |
| `reasoning` | `chain-of-thought.tsx` | 初始化/兼容思考状态 |
| `chain` | `chain-of-thought.tsx` | 统一 chain：AI 中间消息和工具调用步骤 |
| tool detail | `readonly-code-block.tsx` | 工具 input/output 只读代码块 |
| Edit/MultiEdit detail | `diff-viewer.tsx` | 实际编辑 diff |
| `terminal` | `terminal.tsx` | Bash/命令输出 |
| `confirmation` | `confirmation.tsx` | 工具权限确认 |
| `context` | `context.tsx` | 上下文窗口和 token 使用 |
| `subagent` | `subagent.tsx` | agent 自主调用的子 agent |
| `ask_user_question` | `ask-user-question.tsx` | agent 向用户提问 |
| attachments | `attachments.tsx` | 图片、PDF、文档等附件 |

## 附件上传

入口：

- `packages/web/src/components/chat/chat-input.tsx`
- `packages/web/src/app/api/upload/route.ts`

`ChatInput` 支持拖拽和文件选择。当前允许：

- 图片：`image/*`
- PDF
- Word：`.doc/.docx`
- 文本类：`.txt/.md/.csv/.json`

上传结果会作为 `attachments` 放进 websocket `channel.message` payload。服务端保存到 `Message.attachments`，前端使用 `attachments.tsx` 展示缩略图或文档 chip。

## WebSocket 事件

客户端发送：

- `channel.message`

服务端广播：

- `channel.message`：新消息
- `channel.message.updated`：实时更新 AI 消息，包括 parts 和 status
- `agent.output`：保留给 agent 输出监听面板或调试流
- `agent.completed`：agent 完成
- `agent.error`：agent 失败

聊天 UI 的实时展示依赖 `channel.message.updated`。

## 状态语义

`Message.status` 当前语义：

- `pending`：消息已创建但还没开始产生内容
- `streaming`：agent 正在运行并可能持续更新 parts
- `completed`：agent 成功完成
- `error`：agent 失败

主 agent pending 消息创建时现在使用 `streaming`，因为 runtime 会立刻进入可更新状态。

## 开发注意事项

- 新增展示类型时，先扩展 `MessagePart`，再更新 `MessageParts` 的 switch 渲染。
- runtime 如果能提供逐工具事件，应优先通过 `onEvent` 推送结构化 `tool_use/tool_result`，避免把大 input/output 放入实时 message parts。
- 不要把普通 `@agent` 主 agent 渲染成 `subagent`。`subagent` 只表示 agent 内部的 Task/subagent 调用。
- 工具输入和结果需要截断或脱敏，避免大文件内容写入日志或实时消息 parts；完整详情应走懒加载接口。
- `content` 仍需保留，作为旧消息兼容和复制文本来源。
- agent 完成时如果已有实时 `liveOutput`，最终 `parts/content` 应继续使用该实时输出作为展示来源，避免完成事件把 `result.output` 中重复的最终文本再次渲染出来。
