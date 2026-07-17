# 配置 Agent

Agent 是 Agent Spaces 的核心执行单元。不同的 Agent 角色各司其职，通过 Workflow 编排协同完成开发任务。

## Agent 角色

| 角色 | 职责 |
|------|------|
| `agent` | 通用执行者。读代码、搜索上下文、改文件、跑测试（最常用） |
| `scheduler` | 调度者。判断需要哪些角色参与，按 Workflow 唤醒对应 Agent |
| `task_creator` | 任务创建者。把计划同步为任务，设定依赖关系 |
| `bot` | 外部集成角色。通过飞书 / 企业微信与外部交互 |
| 自定义 | 创建满足特定业务的角色（如代码审查 Agent、文档生成 Agent） |

## Agent 运行时

每个 Agent 基于特定的 AI 运行时运行，共 6 种：

| 运行时 | 适用模型 | 特点 |
|--------|----------|------|
| Claude Code | Claude 系列 | 内置 Anthropic Bridge，支持非 Anthropic 模型 |
| OpenAI Codex | GPT 系列 | 沙盒化执行环境 |
| Open Agent SDK | 多模型 | 通用 Agent SDK |
| LangChain | OpenAI / Anthropic / Google 等 | provider-neutral |
| Hermes | 多模型 | 外部 CLI 进程适配器 |
| Pi | 多模型 | 原生 SDK 会话、工具、技能、MCP、流式事件 |

运行时通过 `createAgentRuntime()` 按 `runtimeKind` 切换，无需改代码即可更换底层运行时。

## Agent 预设（Preset）

Agent 预设是 Agent 的配置模板，定义了：

- **角色** — Agent 担任的职责
- **运行时** — 使用的 AI 运行时
- **模型** — 具体的 AI 模型（引用 Provider + Model）
- **API Key** — 模型访问凭证（来自 Provider）
- **系统提示词** — Agent 行为指引
- **权限模式** — `default` / `dontAsk` / `acceptEdits` / `plan` / `auto` / `bypassPermissions`
- **MCP 工具** — Agent 可使用的外部工具
- **技能（Skill）** — Agent 掌握的特殊能力
- **沙盒目录** — Agent 可访问的目录范围
- **最大重试次数** — 失败后的重试策略

> 同一角色可创建多个预设（不同模型或配置）。预设支持导入 / 导出。

## 项目级持久指令

运行时会自动加载项目级指令文件：`CLAUDE.md` / `claude.md` / `AGENTS.md` / `agents.md`，从全局数据目录和当前工作目录向上收集后注入到运行 prompt。

## Agent Designer

输入期望能力描述，系统自动生成 Agent 的名称、描述、系统提示词，再由你微调。

## 配置入口

- 工作空间设置面板
- 独立设置页 `/settings/agents`
