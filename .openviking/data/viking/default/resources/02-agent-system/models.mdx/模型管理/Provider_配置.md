## Provider 配置

### 进入 Provider 管理

在设置页面进入 `/settings/providers`（左侧导航对应的「供应商」入口），即可看到所有已配置的 Provider 列表，每条展示名称、`apiBase`、挂载的模型数量与模型能力标签（V / R / E 表示 vision / reasoning / embedding）。

### Provider 字段

| 字段 | 说明 |
|------|------|
| `name` | Provider 名称，必填；同时作为其下模型 `provider` 字段的关联键 |
| `apiBase` | API 接入地址，例如 `https://api.anthropic.com`、`https://open.bigmodel.cn/api/paas/v4` 等 |
| `apiKey` | API 密钥，前端以 `password` 输入框录入，明文写入本地存储 |
| `modelProvider` | API 消息类型（联合字面量），决定后端按哪种协议调用，详见下文 |
| `id` / `createdAt` / `updatedAt` | 系统自动生成 |

### API 消息类型（`modelProvider`）

`modelProvider` 描述「这条连接走哪种大模型 API 协议」，是一个固定的联合字面量，共 6 个取值（源自 `AgentConfig.modelProvider`）：

| 取值 | 适用场景 |
|------|----------|
| `anthropic-messages` | Anthropic 原生 Messages API（Claude 系列） |
| `openai-chat-completions` | OpenAI 兼容的 Chat Completions API |
| `openai-responses` | OpenAI Responses API |
| `openai-responses-to-anthropic-messages` | 把 OpenAI Responses 协议桥接为 Anthropic Messages（用于 Claude Code 等只接受 Anthropic 协议的运行时） |
| `openai-chat-completions-to-anthropic-messages` | 把 OpenAI Chat Completions 协议桥接为 Anthropic Messages |
| `gemini-generate-content` | Google Gemini 的 generateContent 接口 |

Provider 的 `name` 与 `apiBase` 由用户自定义，因此实际可对接的厂商包括但不限于 Anthropic、OpenAI、Google Gemini，以及任何兼容上述协议的厂商（如智谱 GLM、MiniMax、DeepSeek、Moonshot、Together 等 OpenAI 兼容端点）——只要填入正确的 `apiBase` 与 `apiKey` 并选对 `modelProvider` 即可。

> 「API 消息类型」（`modelProvider`，6 取值）与「Agent 运行时」（`runtimeKind`，6 种：Claude Code / Codex / Open Agent SDK / LangChain / Hermes / Oh-My-Pi）是两个正交维度：前者描述调用 LLM 时用什么协议，后者描述用什么框架编排 Agent。

其中两种桥接型消息类型只服务于 `claude-code` 运行时：

- `openai-responses-to-anthropic-messages`
- `openai-chat-completions-to-anthropic-messages`

它们会在本地启动一个临时 Anthropic 兼容桥，把 Claude Code SDK 发出的 Anthropic Messages 请求转成上游 OpenAI 协议，再把响应转回 Anthropic 兼容格式。因此这两种类型不适合与 `codex`、`open-agent-sdk`、`langchain` 等其他运行时组合使用。