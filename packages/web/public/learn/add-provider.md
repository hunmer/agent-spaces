# 添加 LLM 供应商

模型管理是 Agent Spaces 的 LLM Provider 集中配置入口。所有第三方大模型供应商（API Base、API Key、API 消息协议）都在这里统一维护，再由 Agent 预设引用——做到一处配置、多处复用。

## 两个核心实体

- **Provider（供应商）** — 一条到具体大模型 API 的连接配置（名称、`apiBase`、`apiKey`、API 消息协议）
- **Model（模型）** — 一个可被 Agent 选用的模型条目（`modelId`、上下文长度、能力、单价等）

二者通过 Provider 的 `name` 与 Model 的 `provider` 字段软关联。一个 Provider 可挂载任意数量的 Model。

## 步骤

### 1. 新建 Provider

进入 `设置 → 供应商`（`/settings/providers`），点击新建，填写：

| 字段 | 说明 |
|------|------|
| `name` | Provider 名称（必填，作为其下模型的关联键） |
| `apiBase` | API 接入地址，如 `https://api.anthropic.com`、`https://open.bigmodel.cn/api/paas/v4` |
| `apiKey` | API 密钥（明文存本地，仅本机使用） |
| `modelProvider` | API 消息协议，决定调用走哪种大模型 API |

### 2. 选择 API 消息协议

| 取值 | 适用场景 |
|------|----------|
| `anthropic-messages` | Anthropic 原生 Messages API（Claude 系列） |
| `openai-chat-completions` | OpenAI 兼容的 Chat Completions API |
| `openai-responses` | OpenAI Responses API |
| `gemini-generate-content` | Google Gemini 的 generateContent 接口 |
| `openai-*-to-anthropic-messages` | 把 OpenAI 协议桥接为 Anthropic（仅用于 Claude Code 运行时） |

> 只要填入正确的 `apiBase` 与 `apiKey` 并选对协议，可对接任何兼容厂商：智谱 GLM、MiniMax、DeepSeek、Moonshot、Together 等。

### 3. 添加模型

进入 `设置 → 模型`（`/settings/models`），或在 Provider 列表点击「添加模型」。填写：

- `modelId` — 真实模型 ID，如 `claude-sonnet-4-6`、`glm-4.6`、`gpt-4o`
- `name` — 显示名（默认与 modelId 同步）
- `provider` — 所属 Provider 名称
- `maxContextTokens` — 最大上下文 token 数
- `vision` / `reasoning` / `embedding` — 能力标签
- `cost` — 每百万 token 单价（用于用量估算）

## 提示

- API Key 明文存储在本地 `~/.agent-spaces-data/llm/providers.json`，未加密。
- 换 Key 后所有引用该 Provider 的 Agent 下次执行自动生效。
- 删除 Provider 不会级联删除其下模型（二者解耦）。
