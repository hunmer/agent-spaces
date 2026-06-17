# notion-database

> Notion 风格文档数据库（Mini-app）。本项目在 mini-app 渲染器沙箱内运行。

## Project Overview

Notion 风格的文档数据库 mini-app：文档树 CRUD（嵌套树 / 拖拽排序）、Notion 富文本 + Markdown 双编辑器、版本历史（全量快照）、回收站、向量语义搜索、AI 对话。

本 mini-app 由 web workspace 原生 database 模块迁移而来：UI 与交互在沙箱内重写，数据层落回平台 SQLite，向量与 AI 走内置工具。后端 Agent 工具层（`database-tools` / `store` / `vector`）仍保留双轨，待后续迁移。

- **文档树**：嵌套节点、拖拽排序、回收站、版本历史
- **编辑器**：Notion（tiptap）+ Markdown，编辑器为 web 公共组件，经 ui-exports + renderer tiptap 白名单跨环境复用
- **向量搜索**：内置工具 `kb_add_text` / `kb_query`（`@agent-spaces/builtin`），`nodeId` 编码进 title 前缀 `node:<id>` 回连，`nodes` 表 `kbFileId` 列存索引 `fileId`
- **AI 对话**：内置工具 `list_agent_presets` + `agent_run`
- **跨标签同步**：写操作后由 service 广播 `miniApp.nodeChanged`，各端 `onTaskEvent` 监听刷新

## File Structure

- `index.jsx` — 入口：布局（侧边栏 + 主面板）、编排（节点 CRUD、版本、回收站、向量、AI）、配置偏好、节点变更事件订阅
- `components/database-sidebar.jsx` — 侧边栏：树根、新建、搜索、回收站入口、向量索引状态
- `components/nested-tree.jsx` — 通用嵌套树渲染（基于 `@dnd-kit` 拖拽）
- `components/database-tree-node.jsx` — 单个树节点（展开、右键菜单、拖拽 handle、激活态）
- `components/database-main-panel.jsx` — 主面板：标题、编辑器切换（Notion / Markdown）、保存、目录、版本历史、向量、AI 入口
- `components/table-of-contents.jsx` — 文档目录（按 heading 抽取、点击跳转、滚动高亮）
- `components/database-dialog.jsx` — 通用确认 / 输入对话框基类
- `components/version-history-dialog.jsx` — 版本历史弹窗（列表、预览、回滚）
- `components/trash-bin-modal.jsx` — 回收站（恢复 / 彻底删除）
- `components/quick-search-modal.jsx` — 全局快速搜索（标题 + 向量召回）
- `components/database-vector-dialog.jsx` — 向量索引面板（单篇 / 全量重建、删除索引）
- `components/database-ai-chat.jsx` — AI 对话面板（preset 选择、prompt、流式输出）
- `services/config.js` — service：`get_prefs` / `update_prefs`（读写 `configs/config.json`）
- `services/nodes.js` — service：`node_changed` 广播 `miniApp.nodeChanged`（节点 CRUD 在前端直连 SQLite，service 仅做跨端事件）
- `utils/db.js` — `db('notion-database')` + schema（nodes、versions、trash、`kbFileId` 列）+ CRUD 封装
- `utils/vector.js` — `indexNode` / `queryNodes` / `deleteIndexed`（`@agent-spaces/builtin` 的 `kb_*` 工具，`node:<id>` 前缀回连）
- `utils/ai-chat.js` — `listPresets` / `runAgent`（`list_agent_presets` + `agent_run`）
- `utils/constants.js` — KB_ID、storage key、字段名等常量

## Key Design Decisions

- **数据层直连 SQLite**：节点 CRUD 在前端经 `window.AgentSpaces.db('notion-database')` 直接读写（前端运行环境有 `window.db`）。service 跑在服务端 Node 进程，无 `window.db`，因此 `services/nodes.js` **不**做数据访问，仅广播 `miniApp.nodeChanged` 让其他客户端刷新；`services/config.js` 只处理 config 偏好（`configs/config.json`）。
- **编辑器跨环境复用**：Notion / Markdown 编辑器是 web 公共组件（`packages/web/src/components/common/editors/`），经 `ui-exports` 暴露 + renderer tiptap 白名单后供沙箱复用，避免重复实现。
- **向量索引与回连**：`kb_add_text` 调用时把 `nodeId` 编码进 title 前缀 `node:<id> <title>`；`kb_query` 召回后从 title 前缀正则解析 `nodeId` 回连到文档；`nodes` 表的 `kbFileId` 列保存索引返回的 `fileId`，删除文档时据此 `kb_delete`。
- **AI 走内置工具**：`list_agent_presets` 拉可用 preset，`agent_run` 跑对话；不直接调 LLM SDK。
- **容器集中状态**：`index.jsx` 集中持有当前节点 / 树 / 弹窗状态，sidebar 与 main-panel 之间靠 props + 回调联动，**无**共享 store（与 web workspace 原生 Zustand store 解耦）。
- **版本历史用全量快照**：每次保存落一条完整 content 快照（非 patch diff），实现简单、回滚直接，代价是存储随版本数线性增长。

## Dependencies

- 宿主：`window.AgentSpacesUI`（shadcn 组件 + lucide 图标 + Notion / Markdown 编辑器）
- 宿主 API：`window.AgentSpaces`
  - `db('notion-database')` — 节点 / 版本 / 回收站 CRUD
  - `invokeService` — 调 `services/config.js` / `services/nodes.js`
  - `getConfig` / `onConfigChanged` — config 偏好
  - `onTaskEvent` — 监听 `miniApp.nodeChanged` 跨端刷新
  - `callPluginTool` — 向量与 AI（见下）
- 拖拽：`@dnd-kit/core` + `@dnd-kit/sortable`（bare import，renderer 白名单放行）
- 编辑器：tiptap（经公共编辑器间接依赖，不在本 mini-app 直接 import）
- 内置工具 `@agent-spaces/builtin`：
  - `kb_add_text` / `kb_query` / `kb_delete` — 向量索引 / 召回 / 删除
  - `list_agent_presets` / `agent_run` — AI 对话

## Notes

- 后端 Agent 工具层（`database-tools` / `store` / `vector`）仍保留双轨（web workspace 原生 database + 本 mini-app），后续会逐步收敛到 mini-app。
- 版本历史为全量快照，长期文档需关注存储膨胀（暂未做自动裁剪）。
- 向量索引依赖平台内置 KB（`KB_ID` 见 `utils/constants.js`），跨 mini-app 共享同一 KB 时 `node:<id>` 前缀必须唯一，故 `id` 不可复用。
- 跨端同步只覆盖节点级变更（增删改、移动）；编辑器内未保存的草稿不广播，多端同时编辑同一节点以最后一次保存为准（last-write-wins）。
