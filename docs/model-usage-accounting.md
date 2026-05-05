# 模型用量统计与计费流程

本文档说明 Agent Spaces 当前模型用量统计的端到端流程，包括模型成本配置、Agent 完成时的 token 提取、SQLite 落库、统计 API 和首页 Dashboard 展示。

## 相关实现

- 模型类型：`packages/shared/src/types/llm.ts`
- 模型管理 UI：`packages/web/src/components/sidebar/models-dialog.tsx`
- 模型 API：`packages/server/src/routes/llm.ts`
- Agent session 与 usage 存储：`packages/server/src/storage/agent-store.ts`
- usage 文本解析：`packages/server/src/storage/usage.ts`
- Agent 完成入口：`packages/server/src/services/agent.ts`
- 首页统计组件：`packages/web/src/components/home/usage-dashboard.tsx`
- 首页接入：`packages/web/src/components/home/home-page.tsx`

## 数据模型

### LLMModel.cost

模型成本绑定在 `LLMModel` 上：

```ts
interface LLMModelCost {
  inputPerMillion: number;
  outputPerMillion: number;
}
```

含义：

- `inputPerMillion`：每 100 万 input tokens 的美元成本。
- `outputPerMillion`：每 100 万 output tokens 的美元成本。

模型管理弹窗中有两个 Cost 表单字段：

- `Input / 1M tokens`
- `Output / 1M tokens`

创建模型时，服务端会把缺失或非法成本归一化为 `0`。更新模型时，只有请求体包含 `cost` 字段才会更新成本，避免不相关更新把已有成本清零。

模型配置仍然存储在：

```text
~/.agent-spaces-data/llm/models.json
```

## Agent 运行记录存储

Agent session 和 usage 统一存储在用户级 SQLite：

```text
~/.agent-spaces-data/agents/agents.sqlite
```

当前不再从旧 JSON 路径迁移或读取 Agent 执行记录：

```text
~/.agent-spaces-data/workspaces/{workspaceId}/agents
```

SQLite 中有两张核心表：

### agent_sessions

保存 Agent session 当前状态：

- `id`
- `workspace_id`
- `agent_config_id`
- `role`
- `status`
- `current_task_id`
- `started_at`
- `last_activity_at`
- `error`

### agent_usage

保存每次完成后的计费用量：

- `agent_session_id`
- `agent_config_id`
- `runtime`
- `model`
- `input_tokens`
- `output_tokens`
- `cached_input_tokens`
- `reasoning_tokens`
- `total_tokens`
- `input_cost_usd`
- `output_cost_usd`
- `total_cost_usd`
- `summary`
- `error`
- `started_at`
- `completed_at`
- `duration_ms`

`agent_usage` 只在能解析到 token 用量时写入。手动 stop 或没有 usage 信息的完成事件只会更新 session 状态，不会生成计费记录。

## 运行完成后的统计流程

所有主要 Agent 运行路径在结束时都会调用：

```ts
agentService.complete(workspaceId, sessionId, error, details)
```

`details` 中会传入：

- `runtime`
- `model`
- `summary`
- `output`
- `durationMs`
- 可选的结构化 `usage`
- 可选的 provider 原始 `costUsd`

当前接入的完成路径包括：

- 聊天中 `@agent` 触发的 WebSocket 运行。
- issue planner。
- issue task creator。
- issue executor。
- issue reviewer。
- commit agent。

`complete()` 的处理顺序：

1. 更新 `agent_sessions` 中的 session 状态。
2. 从 `details.usage` 读取结构化 usage；如果没有，则从 `details.output` 解析 usage 行。
3. 如果没有任何 token 数据，结束。
4. 如果 runtime 提供了原始 `costUsd`，优先使用该值；否则根据模型成本计算美元成本。
5. 写入 `agent_usage`。

## Token 提取

usage 解析入口是：

```ts
extractUsageFromOutput(output)
```

它会扫描运行输出中的 token 行，识别这些字段：

- `input`
- `output`
- `tokens` 或 `total tokens`
- `cached input`
- `reasoning`

Claude Code runtime 通过 SDK `query()` 返回的 result message 读取结构化字段：

```ts
message.usage
message.total_cost_usd
```

这两个字段会进入 `AgentRunResult.usage` 和 `AgentRunResult.costUsd`，再由 `agentService.complete()` 直接写入 `agent_usage`。因此 Claude Code 的计费统计不依赖输出文本中的 `[Usage]` 行。

Codex runtime 当前也会在 turn 完成时输出类似：

```text
[Usage] tokens=12345 input=8000 output=3000 reasoning=1345
```

该行会被解析为：

- `inputTokens`
- `outputTokens`
- `reasoningTokens`
- `totalTokens`

如果 `totalTokens` 缺失，落库时会用：

```text
input + output + cached input + reasoning
```

计算总量。

## 成本计算

计费计算在 `agent-store.ts` 中完成：

```text
inputCostUsd = inputTokens / 1_000_000 * inputPerMillion
outputCostUsd = outputTokens / 1_000_000 * outputPerMillion
totalCostUsd = inputCostUsd + outputCostUsd
```

实际传入计算的 input/output 分组为：

- input 侧：`inputTokens + cachedInputTokens`
- output 侧：`outputTokens + reasoningTokens`

成本来源顺序：

1. 如果 runtime 返回 provider 原始 `costUsd`，直接使用该总成本。
2. 否则按 `modelId` 或模型显示名匹配 `LLMModel.cost`。
3. 如果模型未配置 cost，回退到内置模型族估算表。
4. 如果内置表也无法识别，使用默认估算值。

当使用 provider 原始总成本时，系统会按 input/output token 占比拆分 `input_cost_usd` 和 `output_cost_usd`，同时保留准确的 `total_cost_usd`。

因此生产使用时，应在 Models 弹窗中为常用模型配置准确的 `Input / 1M tokens` 和 `Output / 1M tokens`。

## 统计 API

首页 Dashboard 使用：

```http
GET /api/agents/usage/dashboard?days=30
```

响应结构来自 `AgentUsageDashboard`：

- `periodLabel`
- `totals`
  - `requests`
  - `inputTokens`
  - `outputTokens`
  - `totalTokens`
  - `totalCostUsd`
  - `avgDurationMs`
- `daily`
  - 每日 input/output/total tokens 和成本
- `byModel`
  - 按模型聚合请求数、token 和成本
- `recent`
  - 最近完成的高层运行记录

统计窗口从当天向前取 `days` 天，并按 `completed_at` 过滤。

## 前端展示

首页 `HomePage` 打开后会请求：

```ts
fetch('/api/agents/usage/dashboard?days=30')
```

然后把数据传给：

```tsx
<UsageDashboard data={usage} />
```

Dashboard 展示：

- Agent Runs
- Tokens Used
- Total Cost
- Avg Duration
- Daily Token Usage
- Cost by Model
- Token Mix
- Recent Agent Runs

当还没有任何 usage 记录时，组件会展示空状态。

## 设计约束与注意事项

- 当前 cost 是基于 token 用量和本地模型成本配置计算的估算值，不是 provider 账单 API 的权威金额。
- cost 会在 Agent 完成时写入 `agent_usage`。后续修改模型成本不会自动回算历史记录。
- 如果需要回算历史成本，需要新增显式 migration 或 rebuild 命令，按历史 `model` 和 token 重新计算 `agent_usage` 成本字段。
- 当前 usage 主要依赖 runtime 输出中的 usage 行。后续更稳妥的方向是扩展 `AgentRuntimeEvent`，增加结构化 `usage` 事件，减少字符串解析。
- `agent_usage` 的唯一约束是 `(agent_session_id, completed_at)`，避免同一 session 同一完成时间重复写入。
