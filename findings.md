# MCP 注入排查发现

- 日志 `mcpServers=fetch` 说明 `agent-runner` 传给 runtime 的 `options.mcpServers` 至少包含 `fetch`。
- 提示词中 `MCP servers configured for this agent: fetch` 也来自同一份 runtime config。
- 模型实际回答 `agent-spaces`、`web_reader`、`4_5v_mcp`，与 `fetch` 不一致，疑似 Claude Code SDK 实际读取了 `.claude` 配置目录里的持久 MCP 配置，或 SDK 参数格式未生效。
- 目标 agent 的 `mcp.json` 正确包含 `fetch`：`uvx mcp-server-fetch`。
- 目标 agent 的 `.claude/.claude.json` 没有声明 `agent-spaces`、`web_reader`、`4_5v_mcp`。
- 会话记录中没有真实 MCP 工具调用或 MCP 状态事件，只能证明模型回答没有遵循提示词，不能单独证明 `fetch` 未传给 SDK。
- 原提示词把内置 Agent Spaces channel tools 描述为“through the agent-spaces MCP server”，与“agent-configured MCP servers: fetch”形成语义冲突，容易让模型把内置通道工具误报为 agent 配置 MCP。
- Claude Agent SDK 类型声明支持 `mcpServers` 参数，并会转成 `--mcp-config`；当前实现继续走 SDK 参数，不引入第二份持久配置真相。
