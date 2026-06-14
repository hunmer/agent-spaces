# 计划：documents/docs 新增功能文档

> 创建日期：2026-06-14
> 前置：已完成现有 27 个文档的内容更新（见 `documents/docs/`，git diff +565/-204）
> 目标：补齐「有功能/页面/API 但无文档」的新功能模板文档

## 现状盘点

`documents/docs` 现有覆盖：intro + getting-started(3) + features(18) + advanced(5) = 27 篇。

对照 **server 37 个路由域**、**web 页面路由**、**SDK 模块**、**templates 库**，以下功能**有实现但文档空白**：

| 功能 | 实现证据 | 现有文档 |
|------|---------|---------|
| Mini-app 沙箱 | web `/mini-apps` + `/mini-apps-preview` 页面、server 5 文件架构、docs/ 4 篇技术文档 | ❌ 无 |
| Plugin 插件系统 | server `plugin` 路由、sdk `workflow-plugin`、templates 120+ 插件 | ❌ 无 |
| Skill 系统 | sdk `skills`、templates 66+ skill、server `skill` 路由 | ❌ 无 |
| MCP 服务器 | sdk `mcps`、templates 9 个 MCP、server `mcp` 路由 | ❌ 无 |
| Agent Store / 模板导入 | sdk `agent-store`、server `import` 路由、docs/agent-store.md | ❌ 无 |
| 模型管理（LLM） | sdk `llm`、server `llm` 路由、settings/providers 页面 | ❌ 无 |
| Prompt 模板 | sdk `prompts`、server `prompt-template`、templates/prompt(2) | ❌ 无 |
| 工具管理（Tools） | sdk `tools`、settings/tools 页面、35 内置工具 | ⚠️ 散见于 agent/index |
| 6 运行时详解 | docs/ 下 5 篇运行时技术文档 | ⚠️ agent/index 仅一张表 |

---

## P0：核心新功能文档（优先处理）

### 1. `features/mini-app.mdx`（sidebar_position: 18）
**信息源**：
- `packages/server/CLAUDE.md`（Mini-app 5 文件架构：mini-apps / mini-app-services / mini-app-agent / mini-app-tasks / mini-app-client-rpc）
- `docs/mini-app-agent.md`、`docs/mini-app-preview-agent.md`、`docs/mini-app-renderer.md`、`docs/mini-app-state-sync-ws-plan.md`
- web 页面：`packages/web/src/app/mini-apps/`、`mini-apps-preview/`

**内容要点**：Mini-app 是什么（React/HTML 沙箱项目）、创建与编辑、沙箱服务编译（剥离 import + ESM→CJS + new Function）、内置 Agent 运行时与工具注入、客户端 RPC、SQLite 数据持久化、预览模式、模板（templates/mini-app/minimax_tts）。

### 2. `features/plugins.mdx`（sidebar_position: 19）
**信息源**：
- `packages/server/src/routes/plugin.ts`、`packages/sdk/src/modules/workflow-plugin.ts`
- `packages/templates/CLAUDE.md`（plugins 120+，含 aliyun-ai/minimax/dingtalk/mira-sdk/jimeng/fish-audio 等）
- `docs/`（搜 plugin-faq.md）

**内容要点**：插件结构（tools.js / workflow.js）、与 Hook 引擎的关系、内置插件清单（按类别）、安装/启用/配置、插件市场/导入。

### 3. `features/skills.mdx`（sidebar_position: 20）
**信息源**：
- `packages/sdk/src/modules/skills.ts`、`packages/server/src/routes/skill.ts`
- `packages/templates/CLAUDE.md`（skills 66+：superpowers 14 子目录 / tdd / planning-with-files / caveman 等）

**内容要点**：Skill 是什么（Markdown + SKILL.md frontmatter）、Agent 绑定 Skill、内置 Skill 库分类、Skill Store 导入、自定义 Skill。

### 4. `features/mcp.mdx`（sidebar_position: 21）
**信息源**：
- `packages/sdk/src/modules/mcps.ts`、`packages/server/src/routes/mcp.ts`
- `packages/templates/mCPS/`（9 个：brave-search/fetch/filesystem/git/github/memory/puppeteer/sqlite/everything）

**内容要点**：MCP（Model Context Protocol）服务器配置、Agent 绑定 MCP、内置 MCP 模板、自定义 MCP、SSE API 中传 mcps 参数。

---

## P1：重要补缺

### 5. `features/agent-store.mdx`（sidebar_position: 22）
**信息源**：`packages/sdk/src/modules/agent-store.ts`、`packages/server/src/routes/import.ts`、`docs/agent-store.md`、`packages/templates/`（serve 端口 3101）

**内容要点**：在线模板库（Agent/Chat/MCP/Skill/Plugin/Workflow/Prompt/OutputStyle/Mini-app 九类）、浏览/导入、导出分享、`generate-index.mjs` 索引机制。

### 6. `features/models.mdx`（sidebar_position: 23）
**信息源**：`packages/sdk/src/modules/llm.ts`、`packages/server/src/routes/llm.ts`、web `settings/providers` 页面

**内容要点**：模型 Provider 配置（OpenAI/Anthropic/智谱/MiniMax 等）、API Key 管理、模型列表、与 Agent 预设运行时的关系。

### 7. `features/prompts.mdx`（sidebar_position: 24）
**信息源**：`packages/sdk/src/modules/prompts.ts`、`packages/server/src/routes/prompt-template.ts`、`packages/templates/prompt/`（andrej-karpathy-skills / claude-token-efficient-coding）

**内容要点**：Prompt 模板复用、内置行为准则模板、自定义模板、注入 Agent。

---

## P2：现有文档补强（不新建文件）

这些功能已有归属文档，只需**补充章节**，避免碎片化：

| 功能 | 归入文档 | 补充内容 |
|------|---------|---------|
| 工具管理（35 内置 + 自定义） | `features/project-settings.mdx` 或 `features/agent/index.mdx` | settings/tools 页面、工具启用/禁用、自定义工具 |
| 订阅管理（智谱/MiniMax/AI Code） | `features/dashboard.mdx` | 已有，核实补全 provider 细节 |
| 语音识别输入 | `features/chat.mdx` | sdk `speech`、语音转文字流程 |
| 代码收藏 | `features/code-editor.mdx` | 已有提及，可补 sdk `code-favorites` API |
| 用量/计费 | `features/dashboard.mdx` | Token 用量、SQLite Agent Usage、cost 统计 |

---

## P3：advanced 可选新增

### `advanced/runtimes.mdx`（sidebar_position: 6）
**信息源**：`docs/codex-runtime-limitations.md`、`docs/{hermes,langchain,open-agent-sdk,oh-my-pi}-agent-runtime.md`、`docs/anthropic-bridge.md`

**内容要点**：6 种运行时（Claude Code / Codex / Open Agent SDK / LangChain / Hermes / Oh-My-Pi）的配置差异、能力对比、限制（如 Codex 限制、open-agent-sdk SSE 阻塞）、Anthropic Bridge 调非 Anthropic 模型。

### `advanced/persistent-context.mdx`（sidebar_position: 7）
**信息源**：`docs/persistent-agent-context.md`、`docs/agent-lifecycle.md`

---

## 执行约束（给下个 agent）

1. **风格基线**：参考刚更新的 `documents/docs/features/workflow.mdx`、`features/agent/index.mdx` —— 中文、.mdx、frontmatter（`sidebar_position` 按上表）、章节深度适中、内部链接 `/docs/...`。
2. **不虚构**：所有功能/数字必须基于模块 CLAUDE.md 或用 `mcp__codegraph__codegraph_search` / `mcp__fff__grep` 验证源码。
3. **新增文档后必须更新 `documents/sidebars.ts`**：在对应 category 的 items 数组里追加新文档 id。
4. **统一口径**：6 种运行时；Mini-app / Plugin / Skill / MCP 等名词与根 CLAUDE.md 一致。
5. **建议分批**：P0 四篇优先（Mini-app / Plugin / Skill / MCP 是核心卖点）；P1 三篇次之；P2 补章节；P3 可选。

## 已知风险点（执行时注意）

- `/settings/hooks` 路由在 web `app/settings/` 下未见目录，写文档前先 grep 确认实际管理入口。
- `shared/CLAUDE.md` 自身有数字偏差（"21 种 Hook 事件"实为 24、"11 种 MessagePart"实为 10），引用时以源码为准，勿照抄 CLAUDE.md。
- templates 数量会持续增长，文档里写"120+/66+/9"等约数，避免写死精确数。
