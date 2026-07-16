# Server 模块 — AI 运行时适配器

## 适配器架构

Server 采用**策略模式**适配多种 AI Agent SDK。`agent-runtime.ts` 定义统一接口，各适配器实现具体逻辑。

## Runtime 管理（CLI/SDK 安装与版本）

`routes/runtime.ts` 提供运行时生命周期管理，独立于适配器调用：

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/runtime/discover-cli` | POST | 探测本地已安装的 CLI（claude/codex/gemini 等） |
| `/api/runtime/install-cli` | POST | 触发 npm/github 安装指定运行时包 |
| `/api/runtime/check-sdk-updates` | POST | 查询 SDK 包是否有新版本 |

支持的 `RuntimeDescriptor`（共 8 个）：`claude-code`、`codex`、`gemini-cli`、`hermes`（CLI 类）；`pi`、`claude-code-sdk`、`codex-sdk`、`open-agent-sdk`（SDK 类）。版本来源支持 npm 包名或 GitHub repo。前端管理入口在 `web/src/components/sidebar/settings/runtime-tab.tsx`。

## 适配器列表

### Claude Code Runtime (`adapters/claude-code-runtime/`)

独立子模块，最复杂的适配器。使用 `@anthropic-ai/claude-agent-sdk`。

| 文件 | 职责 |
|---|---|
| `index.ts` | 适配器入口，实现统一接口 |
| `adapter-pool.ts` | 适配器实例池（多 Agent 并发复用） |
| `anthropic-bridge.ts` | Anthropic SDK 桥接 |
| `protocol-converter.ts` | 协议转换（CLI ↔ SDK 协议互转） |
| `message-format.ts` | 消息格式化 |
| `sdk-config.ts` | SDK 配置构建 |
| `types.ts` | 子模块内部类型 |

支持 macOS/Linux/Windows 多平台（通过平台特定包）。

### OpenAI Codex Runtime (`adapters/codex-runtime.ts`)

- 使用 `@openai/codex-sdk`
- `codex-function-tool-bridge.ts` 处理工具调用桥接

### LangChain Runtime (`adapters/langchain-runtime.ts`)

- 使用 `@langchain/anthropic` + `@langchain/openai` + `@langchain/google-genai`
- 支持多 LLM 提供商切换

### Open Agent SDK Runtime (`adapters/open-agent-sdk-runtime.ts`)

- 使用 `@codeany/open-agent-sdk`
- zod 版本需要 override 处理

### Hermes Runtime (`adapters/hermes-runtime.ts`)

- 自研运行时

### Pi Runtime (`adapters/pi-runtime.ts`)

- 使用 `@earendil-works/pi-coding-agent` 原生 SDK

## 新增适配器指南

1. 在 `adapters/` 创建新适配器文件（复杂逻辑可建子目录，参考 `claude-code-runtime/`）
2. 实现统一接口（参考 `agent-runtime-types.ts`）
3. 如需 CLI/SDK 安装支持，在 `routes/runtime.ts` 的 `RUNTIME_DESCRIPTORS` 中登记
4. 在 Agent 配置中选择运行时类型
5. 添加对应测试文件到 `test/`

## 相关：通知推送（非运行时，但与 Agent 输出强相关）

Agent 执行结果与 Issue 事件可通过 `services/notification-hub/` 推送到外部 IM：

| 文件 | 职责 |
|---|---|
| `service.ts` | 通知分发主服务 |
| `wechat-adapter.ts` / `wechat-api.ts` | 微信渠道适配 |
| `lark-adapter.ts` / `lark-api.ts` | 飞书渠道适配 |
| `bot-agent.ts` / `bot-commands.ts` | Bot 命令路由 |
| `events.ts` / `format.ts` / `helpers.ts` | 事件、格式化、工具 |
