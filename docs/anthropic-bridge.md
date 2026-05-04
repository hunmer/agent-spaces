# Anthropic Bridge 中转说明

本文档说明 Agent Spaces 当前内置的 Anthropic 兼容中转站，用于让 Claude Code runtime 调用 OpenAI Chat Completions 或 OpenAI Responses 上游。

## 适用场景

Claude Code SDK 对外只按 Anthropic Messages 协议工作。部分模型供应商只暴露 OpenAI 兼容接口，或者需要走 OpenAI Responses API。Anthropic Bridge 在本地启动一个临时 HTTP 服务，把 Claude Code 的 Anthropic Messages 请求转换为上游 OpenAI 请求，再把响应转换回 Anthropic Messages 或 Anthropic SSE。

当前支持两个中转 API Message Type：

| API Message Type | 上游接口 | 运行时 |
| --- | --- | --- |
| `openai-responses-to-anthropic-messages` | `POST {apiBase}/responses` | 强制 `claude-code` |
| `openai-chat-completions-to-anthropic-messages` | `POST {apiBase}/chat/completions` | 强制 `claude-code` |

这些选项只用于 Claude Code runtime。前端选择任一 `To Anthropic Messages` 选项时会自动把 Agent Runtime 固定为 `Claude Code`。如果用户把 Agent Runtime 改成 `Open Agent SDK` 或 `Codex`，API Message Type 会被清空。后端保存 preset 时也会做同样兜底，避免绕过 UI 写入不一致配置。

## 请求链路

运行 agent 时，链路如下：

```text
Claude Code SDK
  -> local Anthropic Bridge: POST /v1/messages
  -> OpenAI-compatible upstream
  -> local Anthropic Bridge converts response
  -> Claude Code SDK
```

中转服务由 `ClaudeCodeRuntime` 按需启动：

- 入口文件：`packages/server/src/adapters/claude-code-runtime.ts`
- 起始端口：`3080`
- 端口冲突时自动递增寻找可用端口
- 同一组 `{provider, baseUrl, apiKey, model}` 会复用同一个本地服务并用引用计数释放
- agent 执行结束后释放中转服务

Claude Code 侧看到的是本地 Anthropic endpoint：

```text
ANTHROPIC_BASE_URL=http://localhost:{port}
ANTHROPIC_API_KEY=default
ANTHROPIC_AUTH_TOKEN=default
```

上游真实模型使用 agent preset 的 `modelId`，不会通过 `Options.model` 传给 Claude Code。这样可以避免 Claude Code 先校验非 Claude 模型名导致启动失败。

## 转换规则

### Anthropic Messages -> OpenAI Chat Completions

中转层会把 Anthropic 请求转换为 OpenAI Chat Completions 形状：

- `system` 转为第一条 `{ role: "system" }`
- `user` 文本转为 `{ role: "user", content }`
- `assistant` 文本转为 `{ role: "assistant", content }`
- `tool_use` 转为 `tool_calls`
- `tool_result` 转为 `{ role: "tool", tool_call_id, content }`
- `tools` 转为 OpenAI function tools
- `tool_choice` 做等价映射：
  - `auto` -> `auto`
  - `any` -> `required`
  - `tool` -> 指定 function
- `max_tokens: 1` 会提升为 `32`，避免部分 OpenAI 兼容上游拒绝过小 token 值

### Anthropic Messages -> OpenAI Responses

Responses 中转先复用上面的 OpenAI Chat 中间结构，再转换为 Responses 请求：

- `system` 消息合并到 `instructions`
- 普通消息转为 `input` message item
- `tool` 消息转为 `function_call_output`
- `assistant.tool_calls` 转为 `function_call`
- function tools 转为 Responses function tools，并设置 `strict: false`
- `max_tokens` 转为 `max_output_tokens`

### OpenAI 响应 -> Anthropic Messages

Chat Completions 响应：

- `choices[0].message.content` 转为 Anthropic `text`
- `choices[0].message.tool_calls` 转为 Anthropic `tool_use`
- `finish_reason=tool_calls` 转为 `stop_reason=tool_use`
- usage 字段映射到 Anthropic usage

Responses 响应：

- `output_text` 或 `output[].content[].text` 转为 Anthropic `text`
- `output[].type=function_call` 转为 Anthropic `tool_use`
- 如果存在 tool_use，`stop_reason=tool_use`，否则 `end_turn`

如果 Claude Code 请求 `stream: true`，中转层当前会等待上游完整返回，然后按 Anthropic SSE 格式发送：

- `message_start`
- `content_block_start`
- `content_block_delta`
- `content_block_stop`
- `message_delta`
- `message_stop`

这不是逐 token 透传流式输出，但可以满足 Claude Code SDK 对 Anthropic SSE 协议的要求。

## 配置方式

在 Agent Preset 中设置：

```json
{
  "runtimeKind": "claude-code",
  "modelProvider": "openai-chat-completions-to-anthropic-messages",
  "modelId": "your-upstream-model",
  "apiBase": "https://api.example.com/v1",
  "apiKey": "sk-..."
}
```

或使用 Responses：

```json
{
  "runtimeKind": "claude-code",
  "modelProvider": "openai-responses-to-anthropic-messages",
  "modelId": "your-upstream-model",
  "apiBase": "https://api.openai.com/v1",
  "apiKey": "sk-..."
}
```

连接测试会直接测试上游 endpoint：

- Chat bridge 测试 `{apiBase}/chat/completions`
- Responses bridge 测试 `{apiBase}/responses`

## 调试日志

中转层会输出以下日志：

```text
[anthropic-bridge] request
[anthropic-bridge] upstream succeeded
[anthropic-bridge] upstream failed
[anthropic-bridge] proxy failed
```

重点字段：

- `provider`：当前 bridge provider
- `sourceModel`：Claude Code 请求中的 Anthropic 模型名
- `targetModel`：agent 配置的真实上游模型
- `stream`：Claude Code 是否请求 Anthropic SSE
- `messages` / `inputItems`：转换后的请求条目数量
- `tools`：工具数量
- `status` / `body`：上游失败时的 HTTP 状态和响应片段

如果 Claude Code 报类似 “selected model ... may not exist”，但日志中已显示 `model=default targetModel=...`，优先查看 `[anthropic-bridge] upstream failed`。Claude Code 有时会把本地代理返回的 4xx 包装成模型不可用。

## 与 claude-adapter 的关系

当前实现不再使用 `claude-adapter`。

历史上曾使用过 `claude-adapter` 的两个能力：

- 查找可用端口
- Anthropic Messages 到 OpenAI Chat Completions 的请求转换

现在这两部分都已由 `ClaudeCodeRuntime` 内部实现：

- 端口查找使用 Node `net` server
- 协议转换使用本地 TypeScript 函数

`packages/server/package.json` 中不再依赖 `claude-adapter`，`pnpm-lock.yaml` 中相关依赖也已移除。

## 已知限制

- Anthropic SSE 当前不是逐 token 透传，而是完整响应后转成 SSE 事件序列。
- Responses 的复杂多模态内容只处理文本和 function call。
- 工具调用参数要求是 JSON object；无法解析时会回退为空对象。
- 不支持 Anthropic prompt cache 控制语义到 OpenAI 的精确映射。
- Claude Code runtime 仍由 `@anthropic-ai/claude-agent-sdk` 驱动，工具执行、文件编辑、MCP、skills 的行为由 Claude Code SDK 决定。

## 扩展建议

新增上游协议时，优先保持以下边界：

1. Claude Code 侧始终只暴露本地 Anthropic `/v1/messages`。
2. 不把上游模型名传给 Claude Code 的 `Options.model`。
3. 新 provider 必须在前端和后端同时声明。
4. 如果 provider 需要 Anthropic bridge，应强制 `runtimeKind=claude-code`。
5. 连接测试应测试真实上游 endpoint，而不是本地 bridge endpoint。
