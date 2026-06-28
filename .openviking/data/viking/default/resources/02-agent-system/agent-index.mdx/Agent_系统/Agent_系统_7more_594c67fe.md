# Agent 系统

Agent 是 Agent Spaces 的核心执行单元。不同的 Agent 角色各司其职，通过 Workflow 编排协同完成开发任务。

## Agent 角色

系统定义了四种内置 Agent 角色，并支持自定义角色：

### agent

通用执行者。接收任务后阅读代码、搜索上下文、修改文件、运行测试，完成实际的编码工作。这是最常用的角色。

### scheduler

调度者。接收新议题后，判断需要哪些角色参与，并按 Workflow 定义的顺序唤醒对应的 Agent。

### task_creator

任务创建者。将计划同步为系统中的任务，设定依赖关系和执行顺序。

### bot

外部集成角色。通过飞书或企业微信与外部用户交互，接收命令并返回执行结果。

### 自定义角色

除了内置角色外，你还可以创建自定义角色的 Agent，满足特定的业务需求。例如创建一个专门做代码审查的 Agent，或专门生成文档的 Agent。

> **兼容说明**：旧版角色（planner、executor、reviewer、commit、custom）仍可使用，但不再是公开枚举。建议迁移到新的角色体系。

## Agent 运行时

每个 Agent 基于特定的 AI 运行时运行。系统支持 6 种运行时：

| 运行时 | SDK / 适配形态 | 适用模型 | 特点 |
|--------|-----|----------|------|
| Claude Code | @anthropic-ai/claude-agent-sdk | Claude 系列模型 | 内置 Anthropic Bridge，支持通过 Claude Code SDK 调用非 Anthropic 模型 |
| OpenAI Codex | @openai/codex-sdk | GPT 系列模型 | 沙盒化执行环境 |
| Open Agent SDK | @codeany/open-agent-sdk | 多模型支持 | 通用 Agent SDK |
| LangChain | langchain + @langchain/openai/anthropic/google-genai | OpenAI/Anthropic/Google 等 | 基于 LangChain.js createAgent API，provider-neutral |
| Hermes | Hermes CLI（外部进程） | 多模型支持 | 外部 CLI 进程适配器，支持自定义 Hermes 运行时 |
| Oh My Pi | `omp` CLI（外部进程） | 多模型支持 | 通过 `omp --mode json` 子进程对接 OMP newline-delimited JSON 事件，隔离 OMP home、session 和模型注册表 |

运行时通过工厂函数 `createAgentRuntime()` 按 `runtimeKind` 切换（可选值：`claude-code` / `codex` / `open-agent-sdk` / `langchain` / `hermes` / `oh-my-pi`），无需修改代码即可更换 Agent 的底层运行时。各运行时在底层共享同一套 Function Call 工具抽象（见下文），但模型加载、session 管理、工具暴露方式由各适配器自行实现。

### 项目级持久指令

除 Agent 自身的 `systemPrompt` 外，运行时还会自动加载项目级持久指令文件。当前默认识别：

- `CLAUDE.md`
- `claude.md`
- `AGENTS.md`
- `agents.md`

系统会从全局数据目录和当前工作目录向上的项目目录链路中收集这些文件，再注入到运行 prompt。对 `claude-code` 运行时，会保留其原生对大写 `CLAUDE.md` 的处理，并由 Agent Spaces 额外补充其余文件；其他运行时则统一由平台注入全部可识别文件。

## Agent 预设

Agent 预设（Preset）是 Agent 的配置模板。每个预设定义了：

- **角色** — Agent 担任的职责
- **运行时** — 使用的 AI 运行时
- **模型** — 具体的 AI 模型
- **API Key** — 模型访问凭证
- **系统提示词** — Agent 的行为指引
- **权限模式** — Agent 的操作权限（自动批准、需确认等）
- **MCP 工具** — Agent 可使用的外部工具
- **技能** — Agent 掌握的特殊能力
- **沙盒目录** — Agent 可访问的目录范围
- **最大重试次数** — 执行失败后的重试策略
- **头像** — Agent 的个性化头像
- **模板 ID** — 标识由哪个模板创建（用于导入去重）

你可以在项目设置面板或独立设置页中配置 Agent 预设。同一个 Agent 角色可以创建多个预设，使用不同的模型或配置。预设支持导入/导出。

## Agent Designer

Agent Spaces 提供 AI 自动生成 Agent 预设的功能（Agent Designer）：

1. 输入你期望的 Agent 能力描述
2. 系统自动生成 Agent 的名称、描述和系统提示词
3. 你可以基于生成的配置进一步微调

## Agent SSE API

Agent Spaces 提供 HTTP Server-Sent Events 流式调用接口，无需 WebSocket 即可触发 Agent 执行：

- **端点**：`POST /api/agent-sse/run`
- **认证**：支持 Bearer Token、`x-agent-spaces-key` Header 或 `key` Body 参数
- **用途**：外部集成、CI/CD、API 测试

详见 [Agent SSE API](/docs/advanced/agent-sse-api)。

## Workflow 驱动编排

Agent 通过 Workflow 实现自动化协作。创建一个 Workflow 模板，将多个 Agent 节点通过 DAG 拓扑连接：

1. 在 Workflow 编辑器中拖入 Agent 节点
2. 为每个节点绑定 Agent 预设
3. 连线定义执行依赖
4. Issue 选择 Workflow 后，系统自动映射为 Task 执行

详见 [Workflow 编辑器](/docs/features/workflow)。