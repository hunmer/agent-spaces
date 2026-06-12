# database-demo

> This file is auto-generated. Keep it up-to-date as the project evolves.

## Project Overview

代码片段管理器（Code Snippets Manager）—— 一个演示 workflow-ui 宿主 API 中**三种数据能力**的 React 项目：

1. **SQLite**（`window.AgentSpaces.db`）：片段的结构化存储，支持增删改查、按语言/关键词过滤、批量导入（事务原子提交）。
2. **JSON config**（`window.AgentSpacesUI.readConfigJson` / `writeConfigJson`）：上次的过滤语言持久化到 `configs/settings.json`，刷新后恢复。
3. **JSON data 导出**（`window.AgentSpacesUI.saveDataFile`）：把全部片段导出为 JSON 文件落到 `data/snippets-export.json`。

## File Structure

- `index.jsx` — 入口，主布局、状态编排（filter / form / settings）、CRUD/导入/导出处理、SQLite 计数
- `components/SnippetForm.jsx` — 新建/编辑片段的 Dialog 表单
- `components/SnippetCard.jsx` — 单条片段展示（标题/语言/标签/代码/复制/编辑/删除）
- `components/FilterBar.jsx` — 搜索框 + 语言过滤 Select
- `hooks/useSnippetsDb.js` — 封装 snippets 表的 CRUD + 过滤 + 批量事务，全部走 `window.AgentSpaces.db('snippets')`
- `hooks/useSettings.js` — 封装 `configs/settings.json` 读写
- `utils/db.js` — db 句柄获取（`getDb`）与幂等建表（`initSchema`）
- `utils/settings.js` — JSON 配置读写封装、语言常量、默认设置
- `utils/sampleData.js` — 批量导入示例数据（演示 `db.transaction`）

## Key Design Decisions

- **db 模块不依赖 store**：`utils/db.js` 仅用 `window.AgentSpaces.db('snippets')`，schema 含 `id AUTOINCREMENT`、语言索引。
- **过滤在 SQL 层完成**：`useSnippetsDb.refresh` 动态拼 `WHERE language=? / tags LIKE ? / title|code LIKE ?`，参数化防注入，避免拉全表到前端。
- **批量导入用 transaction**：`importBatch` 把多条 INSERT 作为语句数组一次请求原子提交，演示事务回滚语义。
- **JSON 配置直接读写**：本项目为单用户演示，直接用 `readConfigJson`/`writeConfigJson`（SKILL.md 允许的简单项目用法）。多客户端并发写应改用 `invokeService` + `src/services` 单写。
- **effect 依赖规避循环**：`useSnippetsDb` 返回的对象每次 render 新引用，故 effect 只依赖稳定标量（`dbq.ready`、`filter.*`），不依赖 `dbq` 整体。

## Dependencies

- 宿主全局（无需 import）：`window.AgentSpaces.db`、`window.AgentSpacesUI.{readConfigJson,writeConfigJson,saveDataFile,<组件>,<lucide 图标>}`
- React（renderer allowlist）：`react` 的 `useState` / `useEffect` / `useCallback`

## Data Layout (运行时生成)

- `data/db/snippets.sqlite` — SQLite 数据库文件（better-sqlite3 管理）
- `configs/settings.json` — 上次过滤语言
- `data/snippets-export.json` — 导出的片段快照

## Notes

- 语言列表见 `utils/settings.js` 的 `LANGUAGES`。
