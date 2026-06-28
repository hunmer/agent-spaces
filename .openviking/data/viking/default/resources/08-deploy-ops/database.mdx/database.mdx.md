
# 文档数据库

Agent Spaces 内置 Notion 风格的文档数据库系统，提供树形文档管理、双编辑器、向量搜索和版本历史。

## 功能概览

- **多数据库** — 一个 workspace 可以包含多个知识库数据库，每个数据库拥有独立的文档树，互相隔离
- **树形文档结构** — 类似 Notion 的树形导航，支持多级嵌套
- **双编辑器** — Notion 编辑器（TipTap 富文本）和 Markdown 编辑器（Monaco）两种模式
- **封面和图标** — 为文档设置封面图片和图标
- **快速搜索** — 关键词快速搜索文档
- **向量搜索** — 基于 LLM Embedding 的语义搜索（每个数据库绑定一个 embedding 模型）
- **回收站** — 软删除机制，支持恢复已删除文档
- **版本历史** — 文档的修改历史记录（patch 存储）
- **AI 对话** — 数据库专用 Agent 的知识库聊天
- **多标签页** — 同时打开多个文档标签

## 文档管理

### 创建文档

1. 在文档侧边栏点击「+」按钮
2. 输入文档标题
3. 选择编辑器类型（Notion 或 Markdown）
4. 开始编辑

### 移动文档

拖拽文档节点到目标位置，调整树形结构。

### 删除与恢复

- 删除文档会移入回收站（软删除）
- 在回收站中可以恢复已删除的文档
- 永久删除需从回收站中手动操作

## Notion 编辑器

基于 TipTap 实现的富文本编辑器：

- 块级内容编辑（段落、标题、列表、代码块等）
- 斜杠命令快速插入内容块
- 支持 @mention 引用
- 所见即所得

## Markdown 编辑器

基于 Monaco Editor 的纯 Markdown 编辑：

- 语法高亮
- 实时预览
- 支持完整的 Markdown 语法

## 向量搜索

基于 LLM Embedding 的语义搜索功能。每个数据库可绑定一个 embedding 模型（仅展示 `LLMModel.embedding = true` 的模型）：

1. 用户绑定模型后点击 `Start indexing` 对当前数据库做批量向量化
2. 批量索引按固定批次（当前批大小为 16）执行，索引文本由节点标题和 HTML 去标签后的内容组成
3. embedding 请求使用 OpenAI-compatible `/embeddings` 接口（body 为 `{ model, input }`）
4. 搜索时对 query 生成 embedding，读取本地 SQLite 中的向量并用余弦相似度排序

向量索引是**手动触发**的本地索引，不会在文档编辑时自动增量更新。向量配置和统计可通过 `GET /api/workspaces/:id/database/databases/:databaseId/vector` 读取，绑定或清空模型通过 `PUT /api/workspaces/:id/database/databases/:databaseId/vector` 提交 `{ embeddingModelId }`。

## AI 对话

数据库面板右下角提供 AI 浮动入口（`FloatingBall`），点击后打开知识库 AI 聊天面板：

- 聊天 API：`POST /api/workspaces/:id/database/chat`，请求体 `{ message, history }`，响应 `{ finalMessage }`
- 数据库 AI 使用 workspace 级专用 Agent 配置，固定保存到 `.agent-spaces-data/workspaces/{workspace_id}/database/agent.json`
- 运行时只注入数据库工具（`ListDatabaseNodes`、`SearchDatabaseNodes`、`QueryDatabaseVectors` 等），不继承全局 Agent 的 MCP、skills、命令工具、文件系统能力
- Agent 配置在面板设置菜单中通过 `AgentDialog` 的单 Agent 模式编辑（`singleAgent` + `presetBasePath`）
- 清空消息只清空当前前端会话状态，不删除后端 Agent 配置或数据库内容

## 版本历史

只有当 `DocNode.content` 变化时才记录版本，编辑器内容保存做了 debounce，避免每次按键都创建版本：

- 版本类型：`DatabaseNodeVersion`（`packages/shared/src/types/database.ts`）
- 存储表：`doc_node_versions`（SQLite）
- 每个版本存储一个小的 patch（`start`、`deleteText`、`insertText`）以及新旧内容 hash，不是完整历史快照
- `listNodeVersions(workspaceId, nodeId, databaseId?, limit?)` 通过对当前内容反向应用 patch 重建 `oldContent` / `newContent`
- HTTP API：`GET /api/workspaces/:id/database/:nodeId/versions?databaseId=...`
- 前端入口：`database-main-panel.tsx` 设置菜单的 `History` 打开对话框，diff 通过 `git/diff-viewer.tsx` 渲染
- Agent 工具：`ListDatabaseNodeVersions`（可选 `databaseId`，必填 `id`，可选 `limit`）

## 数据存储

文档数据存储在本地 SQLite（`~/.agent-spaces-data/database/database.sqlite`），使用四张表：

- `databases` — workspace 下的数据库元数据，通过 `embedding_model_id` 记录绑定的 embedding 模型
- `doc_nodes` — 文档和目录节点，使用 `database_id` 归属到具体数据库，通过 `parent_id` 表达树形结构
- `database_embeddings` — 文档节点的本地向量索引（节点 ID、路径、索引文本、内容 hash、embedding JSON、模型 ID、索引时间）
- `doc_node_versions` — 文档版本历史

数据按工作空间隔离。Database 是 workspace 内资源，不是文件系统资源；多数据库之间数据隔离，节点不能跨数据库移动，删除数据库会级联删除其全部节点和向量索引。旧版单数据库数据不做兼容迁移（启动时检测旧结构会删除重建）。
