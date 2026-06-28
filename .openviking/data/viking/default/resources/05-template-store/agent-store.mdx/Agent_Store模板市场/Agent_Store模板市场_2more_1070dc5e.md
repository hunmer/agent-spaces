# Agent Store（模板市场）

Agent Store 是 Agent Spaces 的**在线模板市场**。它把仓库内置的 `packages/templates` 模板库以静态资源方式对外暴露，让用户无需手动复制文件，就能在侧边栏各类「商店」对话框里浏览、搜索并一键导入 Agent 预设、Chat 助手、MCP 服务器、Skill、Plugin、Workflow、Prompt、输出风格、Mini-app 等九类资源。

默认情况下商店指向官方远程仓库（经 gh-proxy 代理 GitHub raw 地址），你也可以把 Base URL 改成自建服务器或留空回退到本地内置资源。所有索引由 `packages/templates/generate-index.mjs` 自动生成。

## 覆盖的九类资源

`packages/templates` 下按子目录组织九类模板，每类目录都有对应的 `index.json` 索引：

| 资源类型 | 目录 | 形态 | 数量（约） |
|---------|------|------|-----------|
| Agent 预设 | `agents/` | Markdown + YAML frontmatter，按 15 个分组 | 180+ 个 |
| Chat 助手 | `chat/` | Markdown + YAML frontmatter | 约 6 个 |
| MCP 服务器 | `mcps/` | JSON 配置（`mcpServers` 形态） | 约 9 个 |
| Skill | `skills/` | `group/skill-name/SKILL.md` | 20+ 个 |
| Workflow Plugin | `plugins/` | 插件目录（含 `plugin.json`/`info.json` 等 manifest） | 约 19 个 |
| Workflow 模板 | `workflows/` | JSON（含 `data.nodes`/`data.edges`/`data.agents`） | 约 1 个 |
| Prompt 模板 | `prompt/` | Markdown | 约 2 个 |
| 输出风格 | `output-styles/` | Markdown | 约 7 个 |
| Mini-app | `mini-app/` | 目录（含 `manifest.json` + 源码） | 约 1 个 |

> 数量随仓库迭代持续增长，此处为当前快照的约数。具体以各目录 `index.json` 为准。