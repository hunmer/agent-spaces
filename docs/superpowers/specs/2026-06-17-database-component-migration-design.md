# database 组件解耦与迁移至 notion-database mini-app 设计

- **日期**：2026-06-17
- **主题**：将 `packages/web/src/components/database` 下的文档数据库组件解耦 workspace 绑定、抽离编辑器为公共组件，并把其余组件整体迁移到 mini-app `notion-database`；同时移除 workspace 原生 database API。
- **范围**：一次性全量迁移（单 spec / 单实施计划）。后续"workspace 绑定 mini-app"不在本次范围。
- **状态**：设计已确认，待写实施计划。

---

## 1. 背景与现状

### 1.1 当前实现

`packages/web/src/components/database/` 共 16 个组件，强耦合于 workspace：

- **数据层**：`useDatabaseStore`（zustand，`packages/web/src/stores/database.ts`，378 行）+ `sdk.database`（`packages/sdk/src/modules/database.ts`）→ REST `/api/workspaces/:id/database/*`（`packages/server/src/routes/database.ts`，378 行，22 个端点，JSON 文件存储于 `packages/server/src/storage/database-store.ts`）。
- **唯一挂载点**：`packages/web/src/components/layout/workspace-shell.tsx` 第 528、653 行的 `DatabaseSidebarPanel`。
- **重依赖**：
  - `notion-editor.tsx`：tiptap 全家桶（`@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-placeholder`、`@tiptap/extension-task-list`、`@tiptap/extension-task-item`）+ lucide + `cn`。**无 store/sdk/workspace 依赖，是干净的受控组件**。
  - `markdown-editor.tsx`：lucide + `cn` + `@/lib/converter`（`markdownToHtml`）。同样干净。
  - 其余 14 个组件：依赖 `useDatabaseStore`、`sdk`、`next-intl`、`@/components/editor/file-tree`(NestedTree)、`@/components/sidebar/agent-dialog`、`@/components/git/diff-viewer`、`@/components/ui/floating-chat-widget`、`@/components/ui/expandable-dock`、`@/components/ui/images-badge`、`@/components/file-card-collections`、`@/lib/converter` 等业务组件。

### 1.2 mini-app 渲染器约束

mini-app 渲染器（`packages/web/src/components/mini-apps/mini-app-renderer.tsx` + `use-mini-app-host-api.ts`）是 **Babel standalone + `new Function` 沙箱**：

- 外部模块白名单：`react` / `react-dom` / `@dnd-kit/*` / `embla-carousel-react` / `@agent-spaces/ui`。
- UI 经 `window.AgentSpacesUI` 注入（来源 `packages/web/src/lib/ui-exports.ts`，已暴露全部 shadcn UI + lucide + 内置路由）。
- 数据能力：`window.AgentSpaces.invokeService` + `getConfig`/`onConfigChanged`（Services 单一写入方）；`window.AgentSpaces.db(name)` SQLite；`window.AgentSpaces.callPluginTool` 调内置插件工具。
- **没有**：tiptap、zustand、sdk、next-intl、`@/` 路径别名。

### 1.3 关键能力映射

经探索确认，workspace database 的所有能力在 mini-app 都有对应：

| 能力 | workspace 原实现 | mini-app 对应 |
|------|------------------|---------------|
| 文档树/内容/版本/回收站 | REST + JSON store | `db('notion-database')` SQLite + service handlers |
| 向量索引/搜索 | server `database-vector.ts`（embedding） | `callPluginTool('@agent-spaces/builtin', 'kb_add_text'/'kb_query'/'kb_delete')`（参考 `copywriting` mini-app） |
| AI 对话 | REST `/chat` | `callPluginTool('@agent-spaces/builtin', 'list_agent_presets')` + `'agent_run'` |
| UI 偏好/多端同步 | zustand store（本地） | `invokeService` + `configChanged` 事件 |
| 富文本编辑 | tiptap 直接 import | 扩展 renderer 白名单 + 经 `AgentSpacesUI` 暴露 |

---

## 2. 目标

1. `notion-editor` / `markdown-editor` 抽为跨环境公共组件，web 与 mini-app 共用单一代码源。
2. 其余 14 个组件迁移到 `notion-database` mini-app，改造为沙箱可运行，组件间通过回调联动（不共享 store）。
3. 数据通信从 workspace HTTP REST 迁移为 mini-app 自约定的 WS 通信方式（`invokeService` + config 事件 + SQLite）。
4. web 侧 workspace database 全部移除（组件 / store / sdk / server 路由 / 存储层 / workspace 入口）。
5. 产物是一个完整可用的 `notion-database` mini-app。

### 非目标

- 不做"workspace 绑定 mini-app"（后续阶段）。
- 不保留 web 双轨实现（一次性清理，无中间并存）。

---

## 3. 总体架构

```
当前                                  目标
┌─────────────────────┐              ┌──────────────────────────────┐
│ web/database (16文件) │              │ web/common/editors (2文件)    │ ← 公共组件(编辑器)
│  + useDatabaseStore  │   ──►        │   notion-editor / markdown   │   暴露到 ui-exports + tiptap白名单
│  + sdk.database      │              ├──────────────────────────────┤
│  + workspace-shell入口│             │ notion-database mini-app      │
│  + server routes/db  │              │  sidebar组件 ←回调→ main-panel │   (同页,回调联动)
└─────────────────────┘              │  数据: SQLite + kb_* + agent_run│
                                     │  通信: invokeService + config事件│
                                     └──────────────────────────────┘
                                     web 侧 database 组件/store/sdk/route/入口 全部移除
```

两条主线：

- **公共化**：两个编辑器抽到 `components/common/editors/`，经 `ui-exports.ts` 暴露 + renderer 加 tiptap 白名单，供两端共用。
- **迁移化**：其余 14 个组件搬入 `notion-database/src`，按统一改造模式（§5）转为沙箱可运行。

---

## 4. 公共编辑器抽离

### 4.1 落点

`packages/web/src/components/common/editors/`：

- `notion-editor.tsx`：从 `database/notion-editor.tsx` 迁入，依赖最干净（tiptap 5 包 + lucide + `cn`），基本为物理移动。
- `markdown-editor.tsx`：从 `database/markdown-editor.tsx` 迁入（lucide + `cn` + `markdownToHtml`）。

两个编辑器均为受控组件（`content` / `onChange` props），无 workspace 依赖。

### 4.2 解耦点

- 物理移动 + 修正 import 路径（`@/lib/converter`、`@/lib/utils` 路径在 web 侧不变）。
- `markdownToHtml`（`@/lib/converter`）需对 mini-app 可用：在 host-api 注入处（`use-mini-app-host-api.ts`）把 `markdownToHtml` 暴露到 `window.AgentSpacesUI.markdownToHtml`。

### 4.3 跨环境复用机制（扩展 tiptap 白名单）

1. `ui-exports.ts` 新增：
   ```ts
   export { NotionEditor } from '@/components/common/editors/notion-editor';
   export { MarkdownEditor } from '@/components/common/editors/markdown-editor';
   export { markdownToHtml } from '@/lib/converter';
   ```
2. renderer 外部模块映射（实施时定位 embla / `@dnd-kit` 注册处，位于 host-api 编译逻辑中）新增白名单，每项返回 `{ __esModule: true, default }`：
   - `@tiptap/react`
   - `@tiptap/starter-kit`
   - `@tiptap/extension-placeholder`
   - `@tiptap/extension-task-list`
   - `@tiptap/extension-task-item`
3. mini-app 内通过 `AgentSpacesUI.NotionEditor` / `AgentSpacesUI.MarkdownEditor` / `AgentSpacesUI.markdownToHtml` 使用，或 `import { NotionEditor } from '@agent-spaces/ui'`。

### 4.4 收益

web 内 chat / composer 等未来场景也能复用这两个编辑器，且与 mini-app 同源。

---

## 5. notion-database mini-app 组件结构

### 5.1 文件布局

```
packages/server/agent-spaces-data/mini-apps/notion-database/
  manifest.json
  src/
    index.jsx                          # 容器：布局 + 状态 + 回调桥接 + onConfigChanged 订阅
    components/
      database-sidebar.jsx             # 合并原 database-sidebar-panel + database-sidebar
      database-tree-node.jsx
      database-main-panel.jsx          # 编辑器切换(notion/markdown) + TOC + 版本 + 快速搜索
      database-dialog.jsx              # 数据库/节点 CRUD 对话框
      database-vector-dialog.jsx       # 向量索引/搜索(走 kb_*)
      database-ai-chat.jsx             # AI 对话(走 agent_run)
      quick-search-modal.jsx
      table-of-contents.jsx
      trash-bin-modal.jsx
      version-history-dialog.jsx
      nested-tree.jsx                  # 从 @/components/editor/file-tree 重实现(沙箱版)
    services/
      nodes.js                         # node CRUD handlers (ctx + SQLite)
      config.js                        # UI 偏好 handlers
    utils/
      db.js                            # db('notion-database') + initSchema (参考 copywriting)
      vector.js                        # kb_add_text/kb_query 封装
      ai-chat.js                       # list_agent_presets + agent_run 封装
      constants.js                     # EMOJIS, PRESET_COVERS, 状态字面量, 文案
  configs/
    config.json                        # UI 偏好快照
```

### 5.2 布局与回调联动

`index.jsx` 作为容器，**sidebar 组件** 与 **main-panel 组件**（内含编辑器）同页渲染，通过 props/回调联动，**不引入共享 store**。

容器 `index.jsx` 集中持有状态：`activeId` / `openTabs` / `recentIds` / `openFolders` / `editorMode` / `theme` / `isFullWidth` / `sidebarSearch`，并通过 `onConfigChanged` 多端同步。

联动契约：

- **sidebar 上报**：`onSelect(id)` / `onCreate(parentId, type)` / `onRename(id, title)` / `onMove(id, parentId)` / `onTrash(id)` / `onRestore(id)` / `onDelete(id)` → 容器调 service。
- **main-panel 上报**：`onContentChange(id, content)` / `onModeChange(mode)` / `onThemeChange(theme)` / `onCoverChange` / `onIconChange` → 容器调 service 并广播。
- **容器订阅** `onConfigChanged`：其他客户端改动后同步本地状态。

### 5.3 统一改造模式

| 原依赖 | 迁移后 |
|--------|--------|
| `useDatabaseStore`（zustand） | 删除；状态集中在容器，props 下发 + 回调上报；多端同步经 `onConfigChanged` |
| `sdk` / HTTP REST | `invokeService('xxx', payload)` + `getConfig` / `onConfigChanged` |
| `next-intl`（`useTranslations`） | 文案内联到 `utils/constants.js`（mini-app 不接 next-intl） |
| `@/components/ui/*` | `window.AgentSpacesUI` 或 `@agent-spaces/ui` 解构 |
| `@/components/editor/file-tree`（NestedTree） | 重写为 `components/nested-tree.jsx`（沙箱版，复用 `@dnd-kit` 白名单） |
| `@/components/sidebar/agent-dialog` 等业务组件 | 在 mini-app 内用 AgentSpacesUI 基础组件重组 |
| `@/lib/converter` | `AgentSpacesUI.markdownToHtml`（§4.2） |
| `./notion-editor` / `./markdown-editor` | `AgentSpacesUI.NotionEditor` / `AgentSpacesUI.MarkdownEditor` |
| `@/components/git/diff-viewer`（版本历史） | mini-app 内用全量快照 + 简易 diff 展示（见 §7.2） |
| `lucide-react` | `window.AgentSpacesUI`（已导出全部 lucide） |
| `@/components/ui/floating-chat-widget`、`expandable-dock`、`images-badge`、`@/components/file-card-collections` | 在 mini-app 内用 AgentSpacesUI 组件重组（不直接复用 web 业务组件） |

### 5.4 TS → JSX 转换

所有迁移组件从 `.tsx` 改为 `.jsx`：去掉 TypeScript 类型注解、interface、泛型；类型契约以 JSDoc 注释保留。导出从 `export default function` / `export function` 改为 mini-app 惯用的命名/默认导出。

---

## 6. 数据层

### 6.1 SQLite schema

`db('notion-database')`（参考 copywriting 的 `db.js` + `initSchema`）。单个 mini-app 实例 = 一个数据库（不再多库；若需多库，按内置 `Router` 多视图后续扩展，本次单库）。

```sql
-- 文档节点（对应 DocNode，去掉 workspaceId/databaseId 冗余）
nodes(
  id TEXT PRIMARY KEY,
  title TEXT,
  icon TEXT,
  cover TEXT,
  content TEXT,
  parentId TEXT,
  type TEXT,              -- 'folder' | 'document'
  createdAt INTEGER,
  updatedAt INTEGER,
  isTrash INTEGER DEFAULT 0,
  trashedAt INTEGER
);

-- 版本快照（简化原 patch 模型为全量快照）
node_versions(
  id TEXT PRIMARY KEY,
  nodeId TEXT,
  title TEXT,
  oldContent TEXT,
  newContent TEXT,
  createdAt INTEGER
);
```

### 6.2 config.json（UI 偏好）

```json
{
  "activeId": "",
  "openTabs": [],
  "recentIds": [],
  "editorMode": "notion",
  "theme": "sans",
  "isFullWidth": false,
  "openFolders": {},
  "sidebarSearch": ""
}
```

### 6.3 service handlers

`src/services/nodes.js` + `src/services/config.js`（遵循 `docs/mini-app-renderer.md` 的 Services 单一写入方约定，handler 不 import 外部模块，能力经 `ctx` 注入）：

| handler | 作用 |
|---------|------|
| `list_nodes` | 读 `nodes` 返回树（含回收站标记） |
| `get_node` | 读单节点 |
| `create_node` | 插入节点（默认 type=document） |
| `update_node` | 更新内容/标题/图标/封面，写 `node_versions` 快照，`ctx.updateConfig` 广播 |
| `rename_node` | 改标题 |
| `update_icon` / `update_cover` | 改图标/封面 |
| `move_node` | 改 parentId |
| `trash_node` / `restore_node` / `delete_node` | 回收站操作 |
| `list_versions` | 节点版本列表 |
| `get_prefs` | 读 `config.json` |
| `update_prefs` | 写 `config.json`（`ctx.updateConfig` 广播 `configChanged`） |

UI 不直接读写文件：写走 `invokeService`，读走 `getConfig` / `onConfigChanged`。

---

## 7. 向量搜索与 AI 对话

### 7.1 向量索引/搜索

`utils/vector.js` 封装（参考 copywriting 的 `knowledge-base.js`）：

- **索引**：遍历 `nodes`（type=document 且非回收站），对每个文档：
  ```js
  callPluginTool('@agent-spaces/builtin', 'kb_add_text', {
    kbId, text: node.content, metadata: { nodeId: node.id, title: node.title }
  })
  ```
- **查询**：
  ```js
  callPluginTool('@agent-spaces/builtin', 'kb_query', { kbId, query })
  ```
  结果按 `metadata.nodeId` 回连文档。
- **kbId**：首次索引时自动创建知识库（沿用 `mini-app-tools.ts` 的 auto-create 逻辑，命名如 `Notion Database KB`）。
- **stats**：通过 kb 元信息 + `nodes` 计数得到 indexedCount/nodeCount/lastIndexedAt，供 `database-vector-dialog.jsx` 展示。
- **删除/重建**：`kb_delete` 清理后重新索引（文档删除/回收时同步）。

### 7.2 AI 对话

`database-ai-chat.jsx`：

- 原 `sdk.aiChat` + `/chat` → `callPluginTool('@agent-spaces/builtin', 'list_agent_presets')` 取 preset，再：
  ```js
  callPluginTool('@agent-spaces/builtin', 'agent_run', {
    agentConfigId, prompt, permissionMode
  })
  ```
- preset 选择/管理 UI 沿用原 `database-ai-chat` 逻辑，preset 来源改为 builtin 工具返回。
- 原 `FloatingChatPanel`：若 ui-exports 未暴露，在 mini-app 内用 AgentSpacesUI 基础组件重组浮动对话面板。

---

## 8. web 侧清理

### 8.1 删除项

| 删除项 | 说明 |
|--------|------|
| `packages/web/src/components/database/`（16 文件） | 编辑器→`common/editors`，其余 14 个→mini-app |
| `packages/web/src/stores/database.ts` | zustand store |
| `packages/sdk/src/modules/database.ts` + `packages/sdk/src/index.ts` 引用 | sdk database 模块 |
| `packages/server/src/routes/database.ts` + `packages/server/src/app.ts:301` 挂载 | REST 路由 |
| `packages/server/src/services/database-vector.ts` | embedding 索引（kb_* 已替代） |
| `packages/server/src/storage/database-store.ts` | JSON 存储层 |
| `packages/server/src/services/builtin-tools/database-tools.ts` | 需先确认无其他复用再删 |
| `workspace-shell.tsx` 第 528、653 行 `DatabaseSidebarPanel` 入口 | workspace 面板入口（"绑定 mini-app"阶段恢复为嵌入） |
| `packages/shared/src/types/database.ts` 相关类型 | web 清理后确认无悬空引用再删；mini-app 是 js 不需要 |

### 8.2 新增/改动

- 新增 `packages/web/src/components/common/editors/notion-editor.tsx`、`markdown-editor.tsx`
- `packages/web/src/lib/ui-exports.ts` 加 `NotionEditor` / `MarkdownEditor` / `markdownToHtml`
- renderer（或 host-api）加 tiptap 白名单（§4.3）
- `use-mini-app-host-api.ts` 注入 `markdownToHtml` 到 `window.AgentSpacesUI`

### 8.3 实施顺序（先建后拆，保可回退）

1. 抽编辑器到 `common/editors` + 暴露 ui-exports + tiptap 白名单（web 仍可编译）。
2. 建 mini-app 全部组件 + service + utils，预览页全链路验证。
3. 移除 web workspace database 入口（workspace-shell）。
4. 移除 web 组件目录、store、sdk、server 路由、存储层、shared 类型。
5. 全量 lint + build + mini-app 预览回归。

---

## 9. 验证策略

mini-app 预览页全链路：

1. 建库 → 建文档树（文件夹/文档嵌套）→ 重命名/移动/图标/封面
2. notion 模式编辑（slash 命令、标题、列表、任务、代码）→ markdown 模式编辑切换 → 保存
3. 快速搜索 → 定位文档
4. 版本历史（全量快照）→ 还原
5. 回收站 → 恢复 / 彻底删除
6. 向量索引 → 语义搜索（按 nodeId 回连）
7. AI 对话（选 preset → agent_run）

web 侧：

- `pnpm -r lint` 通过
- `pnpm build` 通过（删除后无悬空引用）
- grep 确认无残留 `database` 引用（`@/stores/database`、`sdk.database`、`/database/` 路由、`DatabaseSidebarPanel`）

---

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| tiptap 在 Babel standalone 沙箱中的运行兼容性（ProseMirror 依赖 DOM） | 第 1 步先单独验证 tiptap 白名单 + 一个最小 NotionEditor 在 mini-app 预览页能渲染编辑，再批量迁移 |
| `nested-tree` 重实现工作量（原依赖 file-tree 的 dnd 排序状态） | 复用 `@dnd-kit` 白名单，优先还原展开/选中/拖拽，复杂度高的特性降级 |
| 多端写覆盖 | 严格走 Services 单一写入方 + `ctx.updateConfig` 原子读改写（遵循 renderer 文档约定） |
| web 清理误删被复用的代码 | 删除前 grep 确认引用面（`database-tools.ts`、`shared/types/database.ts`） |
| `FloatingChatPanel` / `diff-viewer` 等 web 业务组件在沙箱不可用 | mini-app 内用 AgentSpacesUI 基础组件重组，不依赖原组件 |

---

## 11. 后续（非本次范围）

- workspace 绑定 mini-app：`workspace-shell` 的 database 入口改为嵌入 `notion-database` mini-app 预览，实现"workspace 内复用 mini-app 功能"。
- 多数据库支持：按内置 `Router` 多视图扩展。
