# Prompt 模板

Prompt 模板（Prompt Template）是 Agent Spaces 提供的可复用提示词与行为准则库。它把团队沉淀下来的「编码准则」「工作规范」「沟通风格」等长文本系统提示（system prompt）固化为模板，再一键应用到多个 Agent 预设上，避免在每个 Agent 里重复粘贴同一段规则。

## 什么是 Prompt 模板？

Prompt 模板是一段纯 Markdown 文本，本质上是 Agent 的**系统提示词（system prompt）**。它通过 Prompt 管理界面集中维护，并在「应用到 Agent」时被写入目标 Agent 预设的 `systemPrompt` 字段。Agent 运行时，各运行时适配器（Claude Code / Codex / Open Agent SDK / LangChain / Hermes / Oh-My-Pi）会读取该字段并注入到大模型对话的 system 部分。

与 Agent 预设自身描述（identity / mission / capabilities）不同，Prompt 模板聚焦于**行为准则与编码规范**这类跨 Agent 复用的「规章」内容，例如「先想再写代码」「最小改动」「不臆测」等约束。

## 内置模板

模板库 `packages/templates/prompt/` 预置 **2 个** Prompt 模板，可通过 Store 在线导入到本地：

| 模板 ID | 名称 | 用途 |
|---------|------|------|
| `andrej-karpathy-skills` | CLAUDE.md | 通用编码行为准则，减少 LLM 常见编码错误 |
| `claude-token-efficient-coding` | CLAUDE.md - Coding Profile | Token 高效编码配置，面向开发项目、代码评审与调试 |

### CLAUDE.md（andrej-karpathy-skills）

一份偏「谨慎优先于速度」的行为准则，核心包括四条原则：

- **Think Before Coding** — 不臆测、不隐藏困惑、显式声明假设，存在多种解读时主动提出
- **Simplicity First** — 最小可解代码，不做投机性抽象、不为单次使用引入配置项
- **Surgical Changes** — 外科手术式改动，只触碰必须改的部分，匹配既有风格
- **Goal-Driven Execution** — 把任务转化为可验证目标（先写复现测试，再修复），多步任务先给出验证计划

> 模板明确标注：对琐碎任务可自行判断是否豁免这些准则。

### CLAUDE.md - Coding Profile（claude-token-efficient-coding）

在通用规则之上扩展的「编码画像」，面向代码评审、调试与重构场景，强调：

- **输出** — 代码优先，必要时才解释，少用行内散文与样板
- **代码规则** — 最简可行方案、不为单次操作抽象、改文件前先读、不为不可能场景写错误处理
- **评审规则** — 说 bug、给修复、止步，不做范围外建议
- **调试规则** — 先读相关代码再下结论，一次到位，原因不明则明说而非猜测
- **格式** — 不用 em dash、智能引号等装饰性 Unicode，代码须可复制粘贴

## 创建自定义模板

Prompt 模板通过 `/settings/prompts` 页面集中管理（页面组件复用 `PromptsDialog`）。

### 1. 进入 Prompt 管理

在左侧导航或设置中打开「Prompts」，进入模板管理界面。界面分为「本地（Local）」与「Store」两个 Tab。

### 2. 新建模板

点击「创建」按钮，弹出编辑器对话框：

- **名称**（`name`）— 模板标题，便于检索与识别
- **内容**（`content`）— Markdown 全文，使用内置 Monaco 编辑器（`language="markdown"`，`vs-dark` 主题）编写

### 3. 从文件导入

除手写外，还支持从本地文件批量导入：

- 点击「导入」，选择一个或多个 `.md` / `.txt` / `.markdown` 文件
- 单文件导入：以文件名（去除扩展名）作为模板名，内容载入编辑器供进一步编辑后保存
- 多文件导入：逐个以文件名与内容直接创建模板

### 4. 从 Store 导入

切换到「Store」Tab，浏览模板库中的内置 Prompt 模板：

- 已导入的模板会显示「已导入」状态，避免重复
- 点击「导入」会拉取模板 Markdown 全文并在本地创建一份副本（带 `storeId` 标记来源）

> 本地副本与 Store 源模板相互独立；Store 模板更新后，已导入副本不会自动同步。

## 应用到 Agent

Prompt 模板的核心动作是「应用」（apply），即把模板内容写入 Agent 预设的系统提示词。

### 应用流程

1. 在模板卡片上点击「应用」按钮，弹出 Agent 选择对话框
2. 候选 Agent 列表来自 `listAgentCandidates()`，会自动排除内置的 `agent-generator`，并标注每个 Agent 当前是否已设置系统提示词（`hasSystemPrompt`）
3. 勾选目标 Agent（可多选），确认后批量应用

### 注入机制

应用操作由后端 `applyPromptToAgents()` 执行（`packages/server/src/services/prompt-template.ts`），逻辑为：

- 读取每个目标 Agent 的 `agent.json` 配置文件（路径 `~/.agent-spaces-data/agent-templates/<agentId>/agent.json`）
- 将模板 `content` **整体覆盖写入** `systemPrompt` 字段
- 写回 `agent.json`，返回成功应用的数量

注意：应用是**覆盖式**的——目标 Agent 原有的 `systemPrompt` 会被模板内容替换。若需保留原有提示词，应先备份或将其也沉淀为一个 Prompt 模板。

### 运行时消费

写入的 `systemPrompt` 在 Agent 运行时被各适配器读取并注入：

- **Open Agent SDK** — `systemPrompt` 传入 agent 创建参数
- **LangChain** — 作为 agent 的 system message
- **Oh-My-Pi** — 通过 `--system-prompt` 命令行参数传入

因此 Prompt 模板一经应用，下次该 Agent 运行即生效，无需重启服务。

## 绑定关系展示

由于应用是把模板内容复制到 Agent 配置，二者之间是**值拷贝**而非引用关系。为便于追溯，列表接口 `listPromptTemplates()` 会反向扫描所有 Agent 预设，把 `systemPrompt` 等于某模板 `content` 的 Agent 标记为该模板的 `boundAgents`。

- 模板卡片上会显示「绑定到」标签及对应 Agent 头像
- 左侧筛选器可按 Agent 过滤，快速查看某个 Agent 当前绑定了哪些模板

> 因为是值匹配，若 Agent 的 `systemPrompt` 被手动编辑后与模板内容不再完全一致，绑定关系即解除，模板卡片上不再显示该 Agent。

## 管理

### 编辑与删除

- **编辑** — 点击模板卡片进入编辑器，可修改名称与内容；保存后调用 `updatePromptTemplate()`，更新 `updatedAt` 时间戳
- **删除** — 通过卡片菜单删除，仅移除模板记录本身，**不会**回滚已应用到 Agent 上的 `systemPrompt`（Agent 配置中已写入的副本仍保留）

### 检索与筛选

本地 Tab 提供：

- **关键字搜索** — 同时匹配模板名称与内容
- **类型筛选** — 全部 / 自定义（无 `storeId`）/ Store 导入（有 `storeId`）
- **按 Agent 筛选** — 仅显示绑定到指定 Agent 的模板

## 与输出风格的区别

Prompt 模板与[输出风格](/docs/features/output-styles)都涉及 Agent 的 system prompt，但定位不同：

| 维度 | Prompt 模板 | 输出风格（Output Style） |
|------|-------------|--------------------------|
| 定位 | 行为准则、编码规范、工作方式 | 输出结构与格式模板 |
| 内容 | 通用规章长文本（如「先想再写」「最小改动」） | 回复结构骨架（如「问题分析 / 修改方案 / 代码变更」分节） |
| 写入字段 | 覆盖 Agent 的 `systemPrompt` | 写入 Agent 的 `outputStyle`，运行时由 `resolveOutputStyleContent()` 解析后注入 systemPrompt |
| 应用粒度 | 整段覆盖 | 风格叠加，通常与身份描述组合 |
| 内置数量 | 2 个 | 7 个 |

简言之：Prompt 模板决定 Agent「怎么干活」，输出风格决定 Agent「怎么说话」。两者可同时使用——Prompt 模板提供行为约束，输出风格约束呈现格式。

## REST API

Prompt 模板的路由挂在 `/api/prompt-templates`（路由文件 `packages/server/src/routes/prompt-template.ts`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/prompt-templates` | 列出全部模板（含 `boundAgents` 反查结果） |
| `POST` | `/api/prompt-templates` | 创建模板，body 需 `name` + `content`（可选 `storeId`） |
| `PUT` | `/api/prompt-templates/:id` | 更新模板名称或内容 |
| `DELETE` | `/api/prompt-templates/:id` | 删除模板 |
| `POST` | `/api/prompt-templates/:id/apply` | 应用到指定 Agent，body 需 `agentIds` 数组（非空） |
| `GET` | `/api/prompt-templates/agents` | 列出可应用 Agent 候选（排除 `agent-generator`） |

前端统一通过 `@agent-spaces/sdk` 的 `sdk.prompts.*` 方法调用（`packages/sdk/src/modules/prompts.ts`），对应 `list` / `listAgents` / `create` / `update` / `delete_` / `apply` 六个方法。