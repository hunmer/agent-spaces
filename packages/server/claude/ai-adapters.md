# Server 模块 — AI 运行时适配器

## 适配器架构

Server 采用**策略模式**适配多种 AI Agent SDK。`agent-runtime.ts` 定义统一接口，各适配器实现具体逻辑。

## 适配器列表

### Claude Code Runtime (`adapters/claude-code-runtime/`)

- 使用 `@anthropic-ai/claude-agent-sdk`
- 包含适配器池（adapter-pool）、Anthropic 桥接、协议转换、消息格式化
- 支持 macOS/Linux/Windows 多平台（通过平台特定包）
- 6 个文件，最复杂的适配器

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

### Oh-My-Pi Runtime (`adapters/oh-my-pi-runtime.ts`)

- 自研运行时

## 新增适配器指南

1. 在 `adapters/` 创建新适配器文件
2. 实现统一接口（参考 `agent-runtime-types.ts`）
3. 在 Agent 配置中选择运行时类型
4. 添加对应测试文件到 `test/`
