## REST API

MCP 相关 REST 路由集中在 `packages/server/src/routes/mcp.ts`，挂在 `/api/mcps` 下，需 Bearer Token 鉴权：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/mcps` | 列出全部 MCP 服务器（含 `name` / `description` / `config` / `favorited` / `boundAgents`） |
| `POST` | `/api/mcps/import` | 按 `jsonText` 批量导入 MCP 配置 |
| `PUT` | `/api/mcps/:name` | 更新指定 MCP 的 `config` |
| `POST` | `/api/mcps/:name/favorite` | 切换收藏状态 |
| `DELETE` | `/api/mcps/:name` | 删除指定 MCP |

`GET /api/mcps` 返回的 `boundAgents` 是该 MCP 当前被哪些 Agent 绑定的反向索引——后端会遍历所有 Agent 预设，检查其 `mcps.mcpServers` 中是否包含同名键。

## 运行时如何使用 MCP

不同运行时拿到 `mcpServers` 映射后，处理方式各不相同：

- **Claude Code**（`packages/server/src/adapters/claude-code-runtime/`）— 经 `normalizeMcpServers` 归一化后连同函数工具一起交给 Claude Code SDK，由 SDK 自身负责 stdio/HTTP 传输与工具发现。
- **Open Agent SDK**（`packages/server/src/adapters/open-agent-sdk-runtime.ts`）— 经 `normalizeOpenAgentMcpServers` 归一化（含 `fetch` 模板改写）后传入 `createAgent`。
- **LangChain**（`packages/server/src/adapters/langchain-runtime.ts`）— 用 `MultiServerMCPClient` 建立连接，开启 `prefixToolNameWithServerName` 和 `additionalToolNamePrefix: 'mcp'`，把 MCP 工具挂载到 LangChain 工具集，并在 `beforeToolCall` / `afterToolCall` 中输出工具调用与结果事件。
- **Codex / Hermes / Oh-My-Pi** — 各自具备独立的归一化函数（如 codex-runtime 中的 `normalizeMcpServers`），按各自 SDK 期望的形态透传。

无论哪种运行时，最终结果都是：MCP 服务器暴露的工具，与 Agent 原生工具一起，构成该次执行可用工具集合。工具调用过程会通过执行事件（`tool_use` / `tool_result` 等）实时上报，便于在工具时间线中观察。

## 与 Skills 的区别

[Skills](/docs/features/skills) 和 MCP 都用于扩展 Agent 能力，但定位不同：

- **Skills** 是 Markdown 形态的提示/流程资产，注入到 Agent 的上下文中作为指引；
- **MCP** 是协议级的能力接入，提供可被 Agent 调用的真实工具函数。

两者可以同时绑定到同一个 Agent，互不冲突。