## API Key 管理

API Key 存储在 Provider 的 `apiKey` 字段中，与 Provider 配置一同以 JSON 文件形式持久化到本地数据目录 `~/.agent-spaces-data/llm/providers.json`，**明文存储、未加密**。前端录入使用 `type="password"` 输入框避免视觉泄漏，但落盘后不做加密处理。

如需更换某 Provider 的 Key，编辑该 Provider 重新填入即可，所有引用该 Provider 的 Agent 会在下次执行时自动应用新 Key（Agent 配置在保存时已把 `apiKey` / `apiBase` / `modelProvider` 从 Provider 同步过来）。

## 模型列表

### 进入模型管理

在设置页面进入 `/settings/models`，或在 Provider 列表中点击某条 Provider 的「添加模型」按钮（带 `?provider=<name>` 查询参数跳转并预选 Provider）。

### Model 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `modelId` | string | 对外调用的真实模型 ID，必填，例如 `claude-sonnet-4-6`、`glm-4.6`、`gpt-4o` |
| `name` | string | 显示名，必填；若用户未手动改写，默认与 `modelId` 同步 |
| `provider` | string | 所属 Provider 的 `name`（下拉选择已有 Provider 或填 `Other`） |
| `maxContextTokens` | number? | 最大上下文 token 数，提供预设档位滑块或自定义数值 |
| `thinkingEnabled` | boolean | 是否启用 thinking（默认 `true`） |
| `thinkingEffort` | `'low' \| 'medium' \| 'high'` | thinking 强度，默认 `medium` |
| `vision` / `reasoning` / `embedding` | boolean | 能力标签，决定 Agent 选择模型时是否可见 / 可用 |
| `cost` | `{ inputPerMillion, outputPerMillion }` | 每百万 token 单价（输入/输出），用于用量估算 |

后端在写入时会对数值字段做归一化（`normalizeModelCost`、`normalizeTokenLimit`、`normalizeThinkingEnabled`、`normalizeThinkingEffort`）：负值与非数字会回退为 0 或默认档，`maxContextTokens` 非正数会被清空，`thinkingEffort` 只接受 `low` / `medium` / `high`。

### 模型与 Provider 的关系

模型通过 `provider` 字符串与 Provider 关联。Provider 列表会自动聚合其下所有 `provider === name` 的模型并显示数量与能力标签；点击 Provider 的「添加模型」会预填该 Provider 名。删除 Provider 时不会级联删除其下模型（二者解耦），但相关模型的 `provider` 将失去匹配项。

## 用量与成本

`LLMModel.cost` 不只是展示字段。Agent 运行完成后，后端会把本次 `inputTokens`、`outputTokens`、`cachedInputTokens`、`reasoningTokens` 和模型标识一起写入 usage 存储，再结合 `cost.inputPerMillion` / `cost.outputPerMillion` 计算成本估算，供首页用量面板和消息上下文统计展示。

因此如果你希望 Dashboard 上的费用估算更接近真实值，需要为常用模型维护准确的单价。

## 与 Agent 预设运行时的关系

Agent 预设（`AgentConfig`）只持有引用 Provider 与 Model 的最少字段，连接细节由 Provider 注入：

| Agent 字段 | 来源 |
|------------|------|
| `providerId` | 选中 Provider 的 `id` |
| `modelId` | 选中的 Model 的 `modelId`（选中 Provider 时默认取该 Provider 下第一个模型） |
| `apiBase` / `apiKey` / `modelProvider` | 从 Provider 同步而来，UI 上为只读（disabled） |

在 Agent 详情页选择 Provider 时，前端会把 Provider 的 `apiBase`、`apiKey`、`modelProvider` 一并写入 Agent，并把 `modelId` 默认设为该 Provider 下的第一个模型——这意味着「换 Provider」即可一次切换整套连接信息与 API 协议。

运行时执行 Agent 时，后端按预设组装运行时配置（`execution-manager.ts`）：

- `kind` ← `preset.runtimeKind`（6 种运行时之一）
- `provider` ← `preset.modelProvider`（API 消息类型，决定底层 LLM 调用协议）
- `model` ← `preset.modelId`
- `apiKey` ← `preset.apiKey`
- `baseURL` ← `getRuntimeBaseURL(preset.modelProvider, preset.apiBase)`（按协议与是否走 Anthropic 桥接做转换）

也就是说，运行时（编排框架）与 Provider（LLM 协议）两层正交组合：例如「Claude Code 运行时 + OpenAI 兼容厂商」时，可通过 `openai-responses-to-anthropic-messages` 或 `openai-chat-completions-to-anthropic-messages` 这类桥接型 `modelProvider`，把 OpenAI 系协议转写成 Claude Code 期望的 Anthropic Messages 协议。

> 关于 Agent 预设本身（角色、运行时、技能、工具等）详见 [Agent](/docs/features/agent)（如该文档尚未生成，可参阅 Agent 详情页 UI 与 `packages/shared/src/types/workspace.ts` 中的 `AgentConfig`）。

## REST API

模型管理走 `/api/providers` 与 `/api/models` 两组路由，均由 `packages/server/src/routes/llm.ts` 提供、`packages/server/src/storage/llm-store.ts` 做文件持久化，前端经 `@agent-spaces/sdk` 的 `sdk.llm.*` 调用。

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/api/providers` | 列出全部 Provider |
| POST | `/api/providers` | 新建 Provider，`name` 必填 |
| PUT | `/api/providers/:id` | 更新 Provider |
| DELETE | `/api/providers/:id` | 删除 Provider |
| GET | `/api/models` | 列出全部 Model |
| POST | `/api/models` | 新建 Model，`modelId` / `name` / `provider` 必填 |
| PUT | `/api/models/:id` | 更新 Model（数值字段会再次归一化） |
| DELETE | `/api/models/:id` | 删除 Model |

Provider 与 Model 均无独立的 WebSocket 事件——变更后前端通过 SDK 返回值直接更新本地 Zustand store（`useLLMStore`）。