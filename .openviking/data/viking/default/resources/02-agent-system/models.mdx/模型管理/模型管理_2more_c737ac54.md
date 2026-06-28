# 模型管理

模型管理是 Agent Spaces 的 LLM Provider 集中配置入口。所有第三方大模型供应商（API Base、API Key、API 消息协议）与可用模型清单（modelId、上下文长度、能力标签、thinking 设置、价格）都在这里统一维护，再由 [Agent 预设](/docs/features/agent) 引用——Agent 自身不再各自保存连接信息，只持有 `providerId` 与 `modelId`，从而做到一处配置、多处复用、统一换 Key。

## 什么是模型管理？

模型管理由两个独立但相互关联的实体组成：

- **Provider（供应商）**——一条到具体大模型 API 的连接配置，包含名称、`apiBase`、`apiKey`，以及该接口使用的「API 消息类型」（决定调用走 Anthropic Messages、OpenAI Chat Completions 还是其他协议）。
- **Model（模型）**——一个可被 Agent 选用的模型条目，记录对外 `modelId`、显示名、所属 Provider 名称，以及上下文长度、能力（vision / reasoning / embedding）、thinking 设置、单价等元数据。

二者通过 Provider 的 `name` 与 Model 的 `provider` 字段软关联（字符串匹配，而非外键）。一个 Provider 可以挂载任意数量的 Model。