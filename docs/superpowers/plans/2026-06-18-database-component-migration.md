# database 组件迁移至 notion-database mini-app 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `packages/web/src/components/database` 的文档数据库功能整体迁移为独立的 `notion-database` mini-app，编辑器抽为跨 web/mini-app 公共组件，并清理 web 侧 workspace 原生 database 实现。

**Architecture:** 编辑器（notion/markdown）抽到 `web/components/common/editors/` 并经 `ui-exports.ts` 暴露 + renderer 加 tiptap 外部模块白名单，实现 web 与 mini-app 单源复用。其余 14 个组件迁入 `notion-database` mini-app，容器 `index.jsx` 集中状态 + 回调联动（无共享 store），数据走 SQLite + service 单一写入方 + config 事件，向量走 `kb_*` 内置工具、AI 走 `agent_run`。web 侧 database 组件/store/sdk/server 路由/存储层/workspace 入口全部移除。

**Tech Stack:** React, tiptap, SQLite(better-sqlite3 经 `window.AgentSpaces.db`), mini-app Services(`invokeService`+`configChanged`), `callPluginTool`(`kb_add_text`/`kb_query`/`kb_delete`/`agent_run`/`list_agent_presets`), shadcn/ui(`window.AgentSpacesUI`), `@dnd-kit`(白名单), Next.js 16, Express 5。

**参考文档：** `docs/superpowers/specs/2026-06-17-database-component-migration-design.md`、`docs/mini-app-renderer.md`、`packages/server/agent-spaces-data/mini-apps/copywriting/src/`（数据层/kb 范式参考）。

---

## 关键约定与改造规则（迁移类任务通用）

本计划大量任务是"把现有 `.tsx` 组件迁移成 mini-app 沙箱 `.jsx` 组件"。统一遵循以下确定性改造规则，迁移任务不再重复展开，只标注差异。

### R1. 依赖映射表（import 改写）

| 原写法 | 迁移后 |
|--------|--------|
| `import { useDatabaseStore } from '@/stores/database'` | **删除**；改由容器经 props 传入数据与回调 |
| `import { sdk } from '@/lib/sdk'` | **删除**；改用 `await window.AgentSpaces.invokeService(name, payload)` |
| `import { useTranslations } from 'next-intl'` | **删除**；文案从 `../utils/constants.js` 导入 |
| `import { cn } from '@/lib/utils'` | 内联实现：`const cn = (...a) => a.filter(Boolean).join(' ')`（每个 jsx 文件顶部） |
| `import { X } from 'lucide-react'` | `const { X } = window.AgentSpacesUI;`（顶部解构，按需） |
| `import { Button, ... } from '@/components/ui/xxx'` | `const { Button, ... } = window.AgentSpacesUI;`（按需解构，确认该组件已在 ui-exports 暴露） |
| `import NotionEditor from './notion-editor'` | `const { NotionEditor } = window.AgentSpacesUI;` |
| `import MarkdownEditor from './markdown-editor'` | `const { MarkdownEditor } = window.AgentSpacesUI;` |
| `import { htmlToMarkdown, markdownToHtml } from '@/lib/converter'` | `const { markdownToHtml } = window.AgentSpacesUI;`（htmlToMarkdown 若用到：在 utils/constants.js 内联一个简易实现，见 Task 3） |
| `import { NestedTree, ... } from '@/components/editor/file-tree'` | 改用本项目内重写的 `./nested-tree.jsx` |
| `import type { DocNode } from '@agent-spaces/shared'` | **删除**；TS 类型全部剥离，改 JSDoc |
| `import { PRESET_COVERS, ... } from '@agent-spaces/shared'` | 改从 `../utils/constants.js` 导入 |
| `import { ... } from '@/components/ui/floating-chat-widget'` / `expandable-dock` / `images-badge` / `@/components/file-card-collections` / `@/components/git/diff-viewer` / `@/components/sidebar/agent-dialog` | **不复用原组件**；在 jsx 内用 `window.AgentSpacesUI` 基础组件重组（任务内给骨架） |

### R2. TS → JSX 剥离规则

- 删除所有 `interface`、`type`、泛型 `<T>`、`as X`、`!`、`?:` 类型注解。
- `'use client'` 顶部指令删除（沙箱不需要）。
- `export default function Foo(props: FooProps)` → `export default function Foo(props)`，props 契约用 JSDoc 注释。
- 事件类型 `React.MouseEvent` → 内联注释或删除。
- `useRef<HTMLDivElement>(null)` → `useRef(null)`。

### R3. 数据访问改写规则

- 任何 `store.xxx(workspaceId, ...)` → `await window.AgentSpaces.invokeService('<handler>', { ... })`（handler 名见 Task 4）。
- 组件读取持久状态（如 UI 偏好）→ 经 props 由容器传入（容器订阅 `onConfigChanged`）。
- 组件不再持有 `workspaceId`（mini-app 单实例）。

### R4. 验证约定

- **web 侧改动**：`cd packages/web && pnpm lint`（若 web 有 lint 脚本，否则 `pnpm -r lint`）+ `pnpm build`；server 侧改动 `cd packages/server && pnpm test`（vitest）。
- **mini-app 组件**：沙箱 jsx 无法单元测试 → 在 mini-app 编辑器预览页（`/mini-apps/notion-database` 编辑器，或独立预览页 `/mini-apps-preview/notion-database`）手动验证每个任务的检查清单。每个 mini-app 任务末尾给「预览验证清单」。
- 频繁提交：每个任务末尾 commit。

### R5. mini-app 文件根

所有 mini-app 新文件位于 `packages/server/agent-spaces-data/mini-apps/notion-database/src/`，下文简称 `MDB/src/`。manifest 在 `MDB/manifest.json`（已存在，`mainFile: index.jsx`）。

### R6. handler 名约定（Task 4 定义，迁移组件按此调用）

`list_nodes` / `get_node` / `create_node` / `update_node` / `rename_node` / `update_icon` / `update_cover` / `move_node` / `trash_node` / `restore_node` / `delete_node` / `list_versions` / `get_prefs` / `update_prefs`。

---

## File Structure

**新增（web）：**
- `packages/web/src/components/common/editors/notion-editor.tsx` — 从 database 迁入的 tiptap 富文本编辑器（公共组件）
- `packages/web/src/components/common/editors/markdown-editor.tsx` — 从 database 迁入的 Markdown 编辑器（公共组件）

**修改（web）：**
- `packages/web/src/lib/ui-exports.ts` — 暴露 `NotionEditor` / `MarkdownEditor` / `markdownToHtml`
- `packages/web/src/components/mini-apps/react-renderer.tsx` — `resolveExternalModule` 加 tiptap 白名单 + 顶部 import
- `packages/web/src/components/mini-apps/use-mini-app-host-api.ts` — 注入 `markdownToHtml` 到 `window.AgentSpacesUI`
- `packages/web/src/components/layout/workspace-shell.tsx` — 移除 DatabaseSidebarPanel 入口
- 各 web 文件清理：删除 `components/database/`、`stores/database.ts`、`sdk/modules/database.ts`、`sdk/index.ts` 引用

**新增（mini-app `MDB/src/`）：**
- `index.jsx` — 容器（布局 + 状态 + 回调桥接）
- `components/database-sidebar.jsx`、`database-tree-node.jsx`、`database-main-panel.jsx`、`database-dialog.jsx`、`database-vector-dialog.jsx`、`database-ai-chat.jsx`、`quick-search-modal.jsx`、`table-of-contents.jsx`、`trash-bin-modal.jsx`、`version-history-dialog.jsx`、`nested-tree.jsx`
- `services/nodes.js`、`services/config.js`
- `utils/db.js`、`utils/vector.js`、`utils/ai-chat.js`、`utils/constants.js`
- `configs/config.json`

**修改（mini-app）：** `MDB/manifest.json`（无结构变更，必要时更新 updatedAt）

**删除（server）：**
- `packages/server/src/routes/database.ts` + `packages/server/src/app.ts` 挂载（line 39 import, line 301 use）
- `packages/server/src/services/database-vector.ts`、`packages/server/src/services/builtin-tools/database-tools.ts`（确认无复用后）
- `packages/server/src/storage/database-store.ts`

**删除（shared，确认无引用后）：** `packages/shared/src/types/database.ts` 相关导出

---

## Task 1: 抽离公共编辑器组件

**Files:**
- Create: `packages/web/src/components/common/editors/notion-editor.tsx`
- Create: `packages/web/src/components/common/editors/markdown-editor.tsx`
- Delete: `packages/web/src/components/database/notion-editor.tsx`
- Delete: `packages/web/src/components/database/markdown-editor.tsx`
- Modify: `packages/web/src/components/database/database-main-panel.tsx`（临时改 import 路径，Task 7 迁移时整体搬走）

- [ ] **Step 1: 创建目录并复制 notion-editor**

```bash
mkdir -p packages/web/src/components/common/editors
cp packages/web/src/components/database/notion-editor.tsx packages/web/src/components/common/editors/notion-editor.tsx
```

- [ ] **Step 2: 创建 markdown-editor**

```bash
cp packages/web/src/components/database/markdown-editor.tsx packages/web/src/components/common/editors/markdown-editor.tsx
```

- [ ] **Step 3: 修正 common/editors/notion-editor.tsx 的 import**

确认 import 仅含：`react`、`@tiptap/*`、`lucide-react`、`@/lib/utils`。这些路径在 web 侧不变，无需改动。确认导出为 `export default NotionEditor` 与 `export { NotionEditor }`（若无命名导出则补一行 `export { default as NotionEditor } from ...` 留到 Task 2 在 ui-exports 处理）。

- [ ] **Step 4: 修正 database-main-panel.tsx 临时引用**

`packages/web/src/components/database/database-main-panel.tsx:16-17` 改为：

```tsx
import NotionEditor from '@/components/common/editors/notion-editor';
import MarkdownEditor from '@/components/common/editors/markdown-editor';
```

- [ ] **Step 5: 删除原文件**

```bash
rm packages/web/src/components/database/notion-editor.tsx
rm packages/web/src/components/database/markdown-editor.tsx
```

- [ ] **Step 6: 验证 web 构建**

```bash
cd packages/web && pnpm lint && cd ../.. && pnpm build
```
Expected: 通过，无 `database/notion-editor` 残留引用报错。

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/common/editors packages/web/src/components/database
git commit -m "refactor(web): 抽离 notion/markdown 编辑器为公共组件"
```

---

## Task 2: ui-exports 暴露编辑器 + renderer 加 tiptap 白名单

**Files:**
- Modify: `packages/web/src/lib/ui-exports.ts`
- Modify: `packages/web/src/components/mini-apps/react-renderer.tsx:1-30`（顶部 import）与 `:120-154`（`resolveExternalModule`）
- Modify: `packages/web/src/components/mini-apps/use-mini-app-host-api.ts`

- [ ] **Step 1: ui-exports.ts 末尾追加暴露**

在 `packages/web/src/lib/ui-exports.ts` 末尾追加：

```ts
export { default as NotionEditor } from '@/components/common/editors/notion-editor';
export { default as MarkdownEditor } from '@/components/common/editors/markdown-editor';
export { markdownToHtml, htmlToMarkdown } from '@/lib/converter';
```

> 若 `@/lib/converter` 无 `htmlToMarkdown` 导出，仅导出 `markdownToHtml`。

- [ ] **Step 2: 确认 AgentSpacesUI 来源包含 ui-exports**

grep 确认 `window.AgentSpacesUI` 由 ui-exports 聚合（`react-renderer.tsx` 的 `@agent-spaces/ui` 分支 `return { __esModule: true, ...AgentSpacesUI }`）：

```bash
grep -n "AgentSpacesUI" packages/web/src/components/mini-apps/react-renderer.tsx | head
```
Expected: 能看到 `AgentSpacesUI` 变量来源（经 ui-exports 导入）。若 ui-exports 新增导出会自动经 `...AgentSpacesUI` 进入 mini-app，无需额外改动。

- [ ] **Step 3: react-renderer.tsx 顶部 import tiptap**

在 `packages/web/src/components/mini-apps/react-renderer.tsx` 现有 import 区（`@dnd-kit/utilities` 之后）追加：

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
```

- [ ] **Step 4: resolveExternalModule 增加 tiptap 分支**

在 `packages/web/src/components/mini-apps/react-renderer.tsx` 的 `resolveExternalModule` 函数（约 line 120-154），在 `@agent-spaces/ui` 分支**之前**插入：

```tsx
  if (id === '@tiptap/react') {
    return { __esModule: true, useEditor, EditorContent };
  }
  if (id === '@tiptap/starter-kit') {
    return { __esModule: true, default: StarterKit };
  }
  if (id === '@tiptap/extension-placeholder') {
    return { __esModule: true, default: Placeholder };
  }
  if (id === '@tiptap/extension-task-list') {
    return { __esModule: true, default: TaskList };
  }
  if (id === '@tiptap/extension-task-item') {
    return { __esModule: true, default: TaskItem };
  }
```

- [ ] **Step 5: 注入 markdownToHtml 到 window.AgentSpacesUI**

在 `packages/web/src/components/mini-apps/use-mini-app-host-api.ts` 中，找到构建 `AgentSpacesUI` 对象的位置，追加 `markdownToHtml`（从 `@/lib/ui-exports` 或 `@/lib/converter` 导入）。若该文件直接 spread ui-exports（`...uiExports`），则 Step 1 已覆盖，本步跳过。验证：

```bash
grep -n "AgentSpacesUI\s*=" packages/web/src/components/mini-apps/use-mini-app-host-api.ts
```

- [ ] **Step 6: 验证 web 构建**

```bash
pnpm build
```
Expected: 通过。

- [ ] **Step 7: tiptap 沙箱最小验证**

在 `MDB/src/index.jsx` 临时写入最小 tiptap 验证（Task 5 会重写，本步只验证白名单生效）：

```jsx
const { NotionEditor } = window.AgentSpacesUI;

export default function App() {
  return <div style={{ padding: 24 }}><NotionEditor content="<h2>hello</h2><p>tiptap sandbox ok</p>" onChange={() => {}} /></div>;
}
```

打开 mini-app 编辑器预览页（`/mini-apps` → 选 `notion-database` → 预览），确认编辑器可渲染、可输入、工具栏可点。
Expected: tiptap 在沙箱正常工作。若报错（如 ProseMirror DOM 相关），记录错误并在计划注释，但通常 `immediatelyRender:false` 已规避 SSR 问题。

- [ ] **Step 8: 还原 index.jsx 为最小占位（避免影响后续）**

```jsx
export default function App() {
  return <div style={{ padding: 24 }}>notion-database bootstrap</div>;
}
```

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/lib/ui-exports.ts packages/web/src/components/mini-apps/react-renderer.tsx packages/web/src/components/mini-apps/use-mini-app-host-api.ts packages/server/agent-spaces-data/mini-apps/notion-database/src/index.jsx
git commit -m "feat(mini-app): ui-exports 暴露编辑器并注册 tiptap 外部模块白名单"
```

---

## Task 3: mini-app 数据层 utils（db / constants / vector / ai-chat）

**Files:**
- Create: `MDB/src/utils/db.js`
- Create: `MDB/src/utils/constants.js`
- Create: `MDB/src/utils/vector.js`
- Create: `MDB/src/utils/ai-chat.js`
- Create: `MDB/configs/config.json`

- [ ] **Step 1: 写 utils/db.js**

```js
// SQLite 句柄与 schema 初始化（参考 copywriting/src/utils/db.js）。
// 落盘：项目 data/db/notion-database.sqlite（后端 better-sqlite3 管理）。
const DB_NAME = 'notion-database';

export function getDb() {
  return window.AgentSpaces.db(DB_NAME);
}

export async function initSchema() {
  const db = getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id         TEXT PRIMARY KEY,
      title      TEXT DEFAULT '',
      icon       TEXT DEFAULT '',
      cover      TEXT DEFAULT '',
      content    TEXT DEFAULT '',
      parentId   TEXT,
      type       TEXT DEFAULT 'document',
      createdAt  INTEGER,
      updatedAt  INTEGER,
      isTrash    INTEGER DEFAULT 0,
      trashedAt  INTEGER,
      kbFileId   TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parentId);
    CREATE INDEX IF NOT EXISTS idx_nodes_trash  ON nodes(isTrash);
    CREATE TABLE IF NOT EXISTS node_versions (
      id         TEXT PRIMARY KEY,
      nodeId     TEXT,
      title      TEXT,
      oldContent TEXT,
      newContent TEXT,
      createdAt  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_versions_node ON node_versions(nodeId);
  `);
  // 兼容旧库：kbFileId 列若不存在则补
  await db.run('ALTER TABLE nodes ADD COLUMN kbFileId TEXT DEFAULT ""').catch(() => {});
}

export function nowTs() {
  return Date.now();
}

export function genId(prefix = 'n') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 2: 写 utils/constants.js**

```js
// 文案、枚举、预设。集中存放，替代 next-intl。
export const NODE_TYPE = { FOLDER: 'folder', DOCUMENT: 'document' };
export const EDITOR_MODE = { NOTION: 'notion', MARKDOWN: 'markdown' };
export const THEME = { SANS: 'sans', SERIF: 'serif', MONO: 'mono' };

export const EMOJIS = [
  '📄','📁','📝','📌','🏷️','💡','✅','❤️','🔥','⭐','🎯','📚','🗂️','🔧','🎨','🚀'
];

export const PRESET_COVERS = [
  'linear-gradient(to right, #10b981, #06b6d4)',
  'linear-gradient(to right, #ec4899, #8b5cf6)',
  'linear-gradient(to right, #f43f5e, #f97316)',
  'linear-gradient(to right, #1e293b, #0f172a)',
  'linear-gradient(to right, #3b82f6, #06b6d4)',
  'linear-gradient(to right, #f59e0b, #e11d48)',
  'linear-gradient(to right, #475569, #1e293b)',
];

export const KB_ID = 'notion-database-fixed-knowledge-base';

// 文案（zh）
export const T = {
  newDoc: '新建文档',
  newFolder: '新建文件夹',
  rename: '重命名',
  delete: '删除',
  move: '移动',
  trash: '移入回收站',
  restore: '恢复',
  search: '搜索',
  empty: '暂无内容',
  versions: '版本历史',
  vector: '向量索引',
  aiChat: 'AI 对话',
  toTrash: '回收站',
};

// 简易 htmlToMarkdown（@/lib/converter 在沙箱不可用，提供兜底；notion 模式保存为 html，此处仅在需要转 md 预览时使用）
export function htmlToMarkdown(html = '') {
  return String(html)
    .replace(/<h1[^>]*>/gi, '\n# ').replace(/<\/h1>/gi, '\n')
    .replace(/<h2[^>]*>/gi, '\n## ').replace(/<\/h2>/gi, '\n')
    .replace(/<h3[^>]*>/gi, '\n### ').replace(/<\/h3>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
```

- [ ] **Step 3: 写 utils/vector.js**

```js
// 向量索引/查询封装（参考 copywriting/src/utils/knowledge-base.js）。
import { KB_ID } from './constants.js';

function unwrap(result) {
  return result?.result || result;
}

// 索引单个文档。nodeId 编码进 title 前缀以支持回连。
export async function indexNode(node) {
  if (!node || !String(node.content || '').trim()) return null;
  const title = `node:${node.id} ${node.title || 'untitled'}`;
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_add_text', {
    knowledgeBase: KB_ID,
    title,
    text: node.content,
  });
  return unwrap(result); // { fileId, fileName, chunkCount, status }
}

export async function queryNodes(query, topK = 8) {
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_query', {
    knowledgeBase: KB_ID,
    query,
    topK,
  });
  const data = unwrap(result);
  // 回连 nodeId：从 title 前缀 node:<id> 解析
  const matches = (data?.matches || []).map((m) => {
    const matched = String(m?.title || m?.fileName || '').match(/^node:([^\s]+)\s*/);
    return { ...m, nodeId: matched ? matched[1] : null, score: m?.score ?? 0 };
  });
  return { matches, count: data?.count ?? matches.length };
}

export async function deleteIndexed(fileId) {
  if (!fileId) return;
  const result = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'kb_delete', {
    knowledgeBase: KB_ID,
    fileId,
  });
  return unwrap(result);
}
```

- [ ] **Step 4: 写 utils/ai-chat.js**

```js
// AI 对话封装：list_agent_presets + agent_run。
export async function listPresets() {
  const resp = await window.AgentSpaces.callPluginTool('@agent-spaces/builtin', 'list_agent_presets', {});
  const data = resp?.result || resp;
  return data?.presets || [];
}

export async function runAgent({ agentConfigId, prompt, taskId, meta }) {
  const resp = await window.AgentSpaces.callPluginTool(
    '@agent-spaces/builtin',
    'agent_run',
    { agentConfigId, prompt, permissionMode: 'dontAsk' },
    taskId ? { taskId, meta } : undefined,
  );
  const data = resp?.result || resp;
  return data?.result || data;
}
```

- [ ] **Step 5: 写 configs/config.json**

`MDB/configs/config.json`：

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

- [ ] **Step 6: 预览验证清单**

在 mini-app 编辑器打开 notion-database，临时在 `index.jsx` 调用 `initSchema()` 与一次 `indexNode`，确认建表无报错、`callPluginTool` 返回含 `fileId`。验证后还原 index.jsx。
Expected: SQLite 建表成功；kb_add_text 返回 `{ fileId, chunkCount, status }`。

- [ ] **Step 7: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/utils packages/server/agent-spaces-data/mini-apps/notion-database/configs
git commit -m "feat(mini-app/notion-database): 数据层 utils (db/constants/vector/ai-chat)"
```

---

## Task 4: mini-app service handlers（nodes / config）

**Files:**
- Create: `MDB/src/services/nodes.js`
- Create: `MDB/src/services/config.js`

> 约定（`docs/mini-app-renderer.md`）：handler 默认导出对象，键为事件名，值为 `(payload, ctx) => result`；`ctx` 注入 `readConfig`/`writeConfig`/`updateConfig`/`broadcast`/`projectId`。handler 不能 import 外部模块（import 行会被剥离）—— 所以**这些文件不写 import**，能力经 ctx 与 `window.AgentSpaces.db`（注意：service 在服务端 Node 执行，`window` 不存在，数据访问只能经 ctx 注入的 db 句柄）。

**重要**：service handler 运行在**服务端 Node**，无 `window.AgentSpaces.db`。SQLite 访问需经 ctx。若当前 ctx 未注入 db 句柄，则节点 CRUD 不能放 service，需改为前端直接 `window.AgentSpaces.db()`（前端运行）+ `getConfig/onConfigChanged` 广播变更。**本计划采用前端直接访问 SQLite + service 仅负责 config 偏好广播的混合模式**（见下）。

- [ ] **Step 1: 确认 service ctx 是否注入 db 句柄**

```bash
grep -n "db\b\|invokeService\|ctx\." packages/server/src/services/mini-app-services.ts | head -30
```

判定：若 ctx 无 db 句柄方法 → 节点 CRUD 走**前端** `window.AgentSpaces.db()`；service 只管 `config.json`（经 `ctx.updateConfig` 广播）。

- [ ] **Step 2: 写 services/config.js（服务端 config 唯一写入方）**

```js
export default {
  get_prefs: (_input, ctx) => ctx.readConfig('config.json') || null,
  update_prefs: (input, ctx) => {
    const next = ctx.updateConfig('config.json', (prev) => ({ ...prev, ...input }));
    return { ok: true, prefs: next };
  },
};
```

- [ ] **Step 3: 写 services/nodes.js（仅广播节点变更事件，数据由前端直接读写 SQLite）**

```js
// 节点数据由前端经 window.AgentSpaces.db('notion-database') 直接读写（前端运行）。
// service 仅负责在写操作后广播 miniApp.nodeChanged 事件，通知其他客户端刷新。
export default {
  node_changed: (input, ctx) => {
    ctx.broadcast('miniApp.nodeChanged', input || {});
    return { ok: true };
  },
};
```

> 说明：`node_changed` 的 payload 形如 `{ kind: 'create'|'update'|'move'|'trash'|'restore'|'delete', nodeId, parentId }`。前端写完 SQLite 后调 `invokeService('node_changed', payload)` 触发广播；其他客户端 `onTaskEvent` 监听 `miniApp.nodeChanged` 重新 `list_nodes`。

- [ ] **Step 4: 前端节点数据访问封装**

由于节点 CRUD 在前端，在 `MDB/src/utils/db.js` 追加节点操作函数（这些在前端运行，可用 `window.AgentSpaces.db`）。在 Task 3 的 `db.js` 末尾追加：

```js
// ===== 节点 CRUD（前端执行，写后由调用方 invokeService('node_changed') 广播）=====
export async function listNodes() {
  return getDb().all('SELECT * FROM nodes ORDER BY updatedAt DESC');
}
export async function getNode(id) {
  return getDb().get('SELECT * FROM nodes WHERE id = ?', [id]);
}
export async function createNode({ id, parentId = null, type = 'document', title = '' }) {
  const ts = nowTs();
  await getDb().run(
    'INSERT INTO nodes(id, title, icon, cover, content, parentId, type, createdAt, updatedAt, isTrash) VALUES(?,?,?,?,?,?,?,?,?,0)',
    [id, title, '', '', '', parentId, type, ts, ts],
  );
  return getNode(id);
}
export async function updateNode(id, patch) {
  const cur = await getNode(id);
  if (!cur) return null;
  if (patch.content !== undefined && patch.content !== cur.content) {
    await getDb().run(
      'INSERT INTO node_versions(id, nodeId, title, oldContent, newContent, createdAt) VALUES(?,?,?,?,?,?)',
      [genId('v'), id, cur.title, cur.content, patch.content, nowTs()],
    );
  }
  const next = { ...cur, ...patch, updatedAt: nowTs() };
  await getDb().run(
    'UPDATE nodes SET title=?, icon=?, cover=?, content=?, parentId=?, type=?, updatedAt=? WHERE id=?',
    [next.title, next.icon, next.cover, next.content, next.parentId, next.type, next.updatedAt, id],
  );
  return next;
}
export async function renameNode(id, title) {
  await getDb().run('UPDATE nodes SET title=?, updatedAt=? WHERE id=?', [title, nowTs(), id]);
  return getNode(id);
}
export async function updateIcon(id, icon) {
  await getDb().run('UPDATE nodes SET icon=?, updatedAt=? WHERE id=?', [icon, nowTs(), id]);
  return getNode(id);
}
export async function updateCover(id, cover) {
  await getDb().run('UPDATE nodes SET cover=?, updatedAt=? WHERE id=?', [cover, nowTs(), id]);
  return getNode(id);
}
export async function moveNode(id, parentId) {
  await getDb().run('UPDATE nodes SET parentId=?, updatedAt=? WHERE id=?', [parentId, nowTs(), id]);
  return getNode(id);
}
export async function trashNode(id) {
  await getDb().run('UPDATE nodes SET isTrash=1, trashedAt=?, updatedAt=? WHERE id=?', [nowTs(), nowTs(), id]);
  return getNode(id);
}
export async function restoreNode(id) {
  await getDb().run('UPDATE nodes SET isTrash=0, trashedAt=NULL, updatedAt=? WHERE id=?', [nowTs(), id]);
  return getNode(id);
}
export async function deleteNode(id) {
  await getDb().run('DELETE FROM node_versions WHERE nodeId=?', [id]);
  await getDb().run('DELETE FROM nodes WHERE id=?', [id]);
}
export async function listVersions(nodeId) {
  return getDb().all('SELECT * FROM node_versions WHERE nodeId=? ORDER BY createdAt DESC', [nodeId]);
}
```

- [ ] **Step 5: 预览验证清单**

临时在 `index.jsx` 调 `createNode` → `updateNode`（触发版本）→ `listNodes` → `listVersions`，确认数据落盘与版本记录。验证后还原。
Expected: 节点增改查可用，版本表有记录。

- [ ] **Step 6: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/services packages/server/agent-spaces-data/mini-apps/notion-database/src/utils/db.js
git commit -m "feat(mini-app/notion-database): service handlers + 前端节点 CRUD"
```

---

## Task 5: mini-app 容器 index.jsx + nested-tree.jsx

**Files:**
- Create: `MDB/src/components/nested-tree.jsx`
- Create: `MDB/src/index.jsx`

- [ ] **Step 1: 写 components/nested-tree.jsx（沙箱版嵌套树，复用 @dnd-kit 白名单）**

```jsx
// 沙箱版嵌套树渲染。原 @/components/editor/file-tree 的 NestedTree 在沙箱不可用。
// 这里实现：递归渲染 + 展开折叠 + 选中 + 拖拽排序（@dnd-kit）。
const { useState } = React;
const { DndContext, closestCenter, PointerSensor, useSensor, useSensors, SortableContext, useSortable, arrayMove, verticalListSortingStrategy } = window.AgentSpacesUI;

const cn = (...a) => a.filter(Boolean).join(' ');

export function NestedTree({ nodes, activeId, openFolders, onSelect, onToggle, onReorder, renderNode }) {
  // nodes: 扁平数组；按 parentId 构建子树
  const childrenOf = (pid) => nodes.filter((n) => (n.parentId || null) === (pid || null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const renderLevel = (parentId, depth) => {
    const items = childrenOf(parentId);
    return (
      <DndContext key={`lvl-${parentId || 'root'}`} sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={(e) => {
          const { active, over } = e;
          if (over && active.id !== over.id) {
            const ordered = arrayMove(items, items.findIndex((i) => i.id === active.id), items.findIndex((i) => i.id === over.id));
            onReorder && onReorder(parentId, ordered.map((i) => i.id));
          }
        }}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((node) => {
            const isOpen = !!openFolders[node.id];
            const children = node.type === 'folder' && isOpen ? renderLevel(node.id, depth + 1) : null;
            return (
              <TreeRow key={node.id} node={node} depth={depth} active={node.id === activeId}
                isOpen={isOpen} onSelect={onSelect} onToggle={onToggle} renderNode={renderNode}>
                {children}
              </TreeRow>
            );
          })}
        </SortableContext>
      </DndContext>
    );
  };
  return <div>{renderLevel(null, 0)}</div>;
}

function TreeRow({ node, depth, active, isOpen, onSelect, onToggle, renderNode, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style = { transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition, paddingLeft: depth * 12 };
  return (
    <div ref={setNodeRef} style={style}>
      <div className={cn('flex items-center gap-1 px-2 py-1 rounded cursor-pointer', active && 'bg-accent', isDragging && 'opacity-50')}
        onClick={() => onSelect && onSelect(node)} {...attributes} {...listeners}>
        {renderNode ? renderNode({ node, isOpen, onToggle }) : <span>{node.title || node.id}</span>}
      </div>
      {children}
    </div>
  );
}
```

> 注：`React` 在沙箱为全局可用（react 已映射）；`@dnd-kit` 经 `window.AgentSpacesUI` 解构（react-renderer 已映射 dnd-kit 到 `@agent-spaces/ui` 展开？—— **核对**：dnd-kit 是独立 bare import，不在 `@agent-spaces/ui`。需改用 `import { ... } from '@dnd-kit/core'` 等本地 bare import（白名单已支持）。**修正 Step 1 顶部**：

```jsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
const { useState } = React;
```

- [ ] **Step 2: 写 index.jsx 容器（最小可跑骨架，后续 Task 接入子组件）**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { initSchema, listNodes } from './utils/db.js';
import { DatabaseSidebar } from './components/database-sidebar.jsx';
import { DatabaseMainPanel } from './components/database-main-panel.jsx';

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState({ activeId: '', editorMode: 'notion', theme: 'sans', openFolders: {}, openTabs: [], recentIds: [] });

  // 初始化 schema + 加载节点 + 订阅 config
  useEffect(() => {
    (async () => {
      await initSchema();
      setNodes(await listNodes());
      const p = window.AgentSpaces.getConfig('config.json');
      if (p) setPrefs((prev) => ({ ...prev, ...p }));
      setReady(true);
    })();
    const off = window.AgentSpaces.onConfigChanged((path, value) => {
      if (path === 'config.json' && value) setPrefs((prev) => ({ ...prev, ...value }));
    });
    const offTask = window.AgentSpaces.onTaskEvent((event, data) => {
      if (event === 'miniApp.nodeChanged') listNodes().then(setNodes);
    });
    return () => { off && off(); offTask && offTask(); };
  }, []);

  const refresh = useCallback(() => { listNodes().then(setNodes); }, []);
  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      window.AgentSpaces.invokeService('update_prefs', next);
      return next;
    });
  }, []);

  if (!ready) return <div style={{ padding: 24 }}>loading…</div>;

  const activeNode = nodes.find((n) => n.id === prefs.activeId) || null;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 280, borderRight: '1px solid #eee', overflow: 'auto' }}>
        <DatabaseSidebar
          nodes={nodes}
          prefs={prefs}
          activeId={prefs.activeId}
          onSelect={(id) => updatePrefs({ activeId: id })}
          onToggle={(id) => updatePrefs({ openFolders: { ...prefs.openFolders, [id]: !prefs.openFolders[id] } })}
          onNodeChanged={refresh}
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <DatabaseMainPanel
          node={activeNode}
          prefs={prefs}
          onContentChange={(content) => activeNode && window.AgentSpaces.db /* 占位 */ }
          onModeChange={(m) => updatePrefs({ editorMode: m })}
          onNodeChanged={refresh}
        />
      </div>
    </div>
  );
}
```

> 子组件 `DatabaseSidebar` / `DatabaseMainPanel` 在 Task 6/7 创建；本步骤先建占位 stub（见下）让容器可渲染。

- [ ] **Step 3: 建子组件占位 stub（Task 6/7 替换）**

`MDB/src/components/database-sidebar.jsx`：

```jsx
export function DatabaseSidebar(props) {
  return <div style={{ padding: 12 }}>sidebar stub</div>;
}
```

`MDB/src/components/database-main-panel.jsx`：

```jsx
export function DatabaseMainPanel(props) {
  return <div style={{ padding: 12 }}>main-panel stub</div>;
}
```

- [ ] **Step 4: 预览验证清单**

打开 notion-database 预览，确认：布局左右分栏、loading 后显示 stub、控制台无报错、`initSchema` 建表成功。
Expected: 容器渲染，两侧栏 + 主面板 stub 可见。

- [ ] **Step 5: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/components/nested-tree.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-sidebar.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-main-panel.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/index.jsx
git commit -m "feat(mini-app/notion-database): 容器 index.jsx + nested-tree 骨架"
```

---

## Task 6: database-sidebar.jsx + database-tree-node.jsx

**Files:**
- Create: `MDB/src/components/database-tree-node.jsx`
- Modify: `MDB/src/components/database-sidebar.jsx`（替换 stub）

**源参考：** `packages/web/src/components/database/database-sidebar.tsx`（15KB）、`database-tree-node.tsx`（6.4KB）、`database-sidebar-panel.tsx`（3.9KB，合并入 sidebar）。

- [ ] **Step 1: 写 database-tree-node.jsx（应用 R1/R2/R3 改造 database-tree-node.tsx）**

读取源文件：

```bash
cat packages/web/src/components/database/database-tree-node.tsx
```

按改造规则转换：
- 顶部 `const { ChevronDown, ChevronRight, Edit2, Plus, Trash2, Move } = window.AgentSpacesUI;` 与 `const cn = (...a) => a.filter(Boolean).join(' ');`
- 删除 `import type { DocNode }`、`NestedTreeRenderState`/`NestedTreeRowProps` 类型，改用 `nested-tree.jsx` 的 renderNode 契约 `{ node, isOpen, onToggle }`。
- `EMOJIS` 从 `../utils/constants.js` 导入。
- 导出 `export function DatabaseTreeNode({ node, isOpen, onToggle, onRename, onDelete, onAddChild })`。
- 交互（重命名/删除/新增子节点）改为调用 props 回调，回调由 sidebar 上报容器。

- [ ] **Step 2: 写 database-sidebar.jsx（合并 sidebar-panel + sidebar）**

读取源文件 `database-sidebar.tsx` 与 `database-sidebar-panel.tsx`，合并为单组件。改造：
- 顶部解构：`const { Button, Input, ... , FolderOpen, Search, Plus, Trash2 } = window.AgentSpacesUI;` + `cn` 内联。
- 删除 `useDatabaseStore`、`useLLMStore`、`sdk`、`next-intl`、`Workspaces/WorkspaceTrigger`（workspace 切换 UI，mini-app 不需要）、`ImportFileDialog`、`NestedTree from '@/components/editor/file-tree'`。
- `NestedTree` 改为本项目 `./nested-tree.jsx`。
- 数据：所有创建/删除/重命名/移动 → 调用 `../utils/db.js` 函数 + 完成后 `props.onNodeChanged()` + `window.AgentSpaces.invokeService('node_changed', { kind, nodeId })` 广播。
- 新建数据库/编辑数据库元信息（database-dialog）：本次单库，简化为不允许新建多库；保留「数据库设置」入口（改库的展示名，存 config）。
- 向量设置入口（database-vector-dialog）与回收站入口（trash-bin-modal）以按钮挂载，组件在 Task 8/9 实现，本步先挂占位按钮（onClick 弹 alert）。
- 导出 `export function DatabaseSidebar({ nodes, prefs, activeId, onSelect, onToggle, onNodeChanged })`。

骨架（关键结构，细节按源文件补全）：

```jsx
import { useState, useMemo } from 'react';
import { NestedTree } from './nested-tree.jsx';
import { DatabaseTreeNode } from './database-tree-node.jsx';
import * as dbApi from '../utils/db.js';
import { genId } from '../utils/db.js';
import { T, NODE_TYPE } from '../utils/constants.js';

const cn = (...a) => a.filter(Boolean).join(' ');
const { Button, Input } = window.AgentSpacesUI;

export function DatabaseSidebar({ nodes, prefs, activeId, onSelect, onToggle, onNodeChanged }) {
  const [search, setSearch] = useState(prefs.sidebarSearch || '');
  const notify = (payload) => window.AgentSpaces.invokeService('node_changed', payload).then(onNodeChanged);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = nodes.filter((n) => !n.isTrash);
    if (!q) return list;
    return list.filter((n) => String(n.title).toLowerCase().includes(q));
  }, [nodes, search]);

  const handleCreate = async (parentId = null, type = NODE_TYPE.DOCUMENT) => {
    const node = await dbApi.createNode({ id: genId(), parentId, type, title: type === NODE_TYPE.FOLDER ? '新文件夹' : '无标题' });
    await notify({ kind: 'create', nodeId: node.id, parentId });
    onSelect(node.id);
  };

  const handleRename = async (id, title) => { await dbApi.renameNode(id, title); await notify({ kind: 'update', nodeId: id }); };
  const handleDelete = async (id) => { await dbApi.deleteNode(id); await notify({ kind: 'delete', nodeId: id }); if (activeId === id) onSelect(null); };

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 flex items-center gap-1">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={T.search} />
        <Button size="sm" onClick={() => handleCreate(null, NODE_TYPE.DOCUMENT)}>+{''}</Button>
        <Button size="sm" variant="ghost" onClick={() => handleCreate(null, NODE_TYPE.FOLDER)}>📁</Button>
      </div>
      <div className="flex-1 overflow-auto px-1">
        <NestedTree nodes={visible} activeId={activeId} openFolders={prefs.openFolders || {}}
          onSelect={(n) => onSelect(n.id)} onToggle={(id) => onToggle(id)}
          onReorder={async (parentId, ids) => { for (const id of ids) await dbApi.moveNode(id, parentId); await notify({ kind: 'move', nodeId: ids[0], parentId }); }}
          renderNode={({ node, isOpen, onToggle }) => (
            <DatabaseTreeNode node={node} isOpen={isOpen} onToggle={() => onToggle(node.id)}
              onRename={handleRename} onDelete={handleDelete}
              onAddChild={(type) => handleCreate(node.id, type)} />
          )} />
      </div>
      <div className="p-2 border-t flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => alert('向量索引（Task 8）')}>{T.vector}</Button>
        <Button size="sm" variant="ghost" onClick={() => alert('回收站（Task 8）')}>{T.toTrash}</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 预览验证清单**

新建文档/文件夹、重命名、删除、搜索过滤、展开折叠、拖拽移动。每步确认 SQLite 落盘 + 多端 `nodeChanged` 广播（开两个预览标签验证同步）。
Expected: 树操作全可用，两标签同步。

- [ ] **Step 4: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-tree-node.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-sidebar.jsx
git commit -m "feat(mini-app/notion-database): sidebar + tree-node 组件"
```

---

## Task 7: database-main-panel.jsx（编辑器接入 + 内容保存）

**Files:**
- Modify: `MDB/src/components/database-main-panel.jsx`（替换 stub）
- Create: `MDB/src/components/table-of-contents.jsx`

**源参考：** `database-main-panel.tsx`（23KB，最大）、`table-of-contents.tsx`（4.3KB）。

- [ ] **Step 1: 写 table-of-contents.jsx**

读取 `table-of-contents.tsx`，改造（R1/R2）：剥离类型；`extractTocFromHtml`/`extractTocFromMarkdown` 为纯函数，原样保留逻辑（无外部依赖）；导出 `TableOfContents` 组件 + 两个 extract 函数。

- [ ] **Step 2: 写 database-main-panel.jsx**

读取 `database-main-panel.tsx`，改造：
- 顶部：`const { useState, useEffect, useRef, useMemo, useCallback } = React;`
- `const { NotionEditor, MarkdownEditor, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, markdownToHtml } = window.AgentSpacesUI;` + `cn` 内联。
- 删除 `useDatabaseStore`、`sdk`、`next-intl`、`ExpandableDock`、`ImagesBadge`、`FileCard`、`react-resizable-panels` 类型 import。
- `htmlToMarkdown` 用 `../utils/constants.js` 的兜底实现。
- `PRESET_COVERS` 从 constants 导入。
- props：`{ node, prefs, onContentChange, onModeChange, onThemeChange, onCoverChange, onIconChange, onNodeChanged }`。
- 内容保存：防抖（~600ms）调 `dbApi.updateNode(node.id, { content })`（自动写版本快照）+ `invokeService('node_changed', {kind:'update', nodeId})` 广播；`onContentChange` 仅更新本地预览态。
- 模式切换 notion/markdown：notion 存 html，markdown 存 md。切换时用 `markdownToHtml`/`htmlToMarkdown` 转换并保存。
- TOC：用 `extractTocFromHtml`/`extractTocFromMarkdown` 根据当前模式生成。
- 封面/图标：通过 `onCoverChange`/`onIconChange` 回调 → 容器调 `dbApi.updateCover/updateIcon`。
- 空状态：`node` 为 null 时显示空提示。

骨架（编辑区核心）：

```jsx
import { useState, useEffect, useRef } from 'react';
import { TableOfContents, extractTocFromHtml, extractTocFromMarkdown } from './table-of-contents.jsx';
import * as dbApi from '../utils/db.js';
import { EDITOR_MODE, PRESET_COVERS, T, htmlToMarkdown } from '../utils/constants.js';

const cn = (...a) => a.filter(Boolean).join(' ');
const { NotionEditor, MarkdownEditor, markdownToHtml, Button, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } = window.AgentSpacesUI;

export function DatabaseMainPanel({ node, prefs, onContentChange, onModeChange, onCoverChange, onIconChange, onNodeChanged }) {
  const [content, setContent] = useState(node?.content || '');
  const saveTimer = useRef(null);

  useEffect(() => { setContent(node?.content || ''); }, [node?.id]);

  const persist = (next) => {
    setContent(next);
    if (!node) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await dbApi.updateNode(node.id, { content: next });
      window.AgentSpaces.invokeService('node_changed', { kind: 'update', nodeId: node.id }).then(onNodeChanged);
    }, 600);
  };

  const switchMode = async (mode) => {
    if (mode === prefs.editorMode || !node) return;
    const converted = mode === EDITOR_MODE.MARKDOWN ? htmlToMarkdown(content) : markdownToHtml(content);
    setContent(converted);
    await dbApi.updateNode(node.id, { content: converted });
    onModeChange(mode);
  };

  if (!node) return <div style={{ padding: 48, color: '#999' }}>{T.empty}</div>;

  const toc = prefs.editorMode === EDITOR_MODE.NOTION ? extractTocFromHtml(content) : extractTocFromMarkdown(content);

  return (
    <div className={cn('flex', prefs.isFullWidth ? 'w-full' : 'max-w-3xl mx-auto')} style={{ minHeight: '100%' }}>
      <div className="flex-1 p-8">
        {node.cover && <div style={{ height: 180, background: node.cover, borderRadius: 8, marginBottom: 16 }} />}
        <h1 contentEditable suppressContentEditableWarning onBlur={(e) => onCoverChange && (null)}
          style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>{node.icon} {node.title}</h1>
        <div className="flex gap-2 mb-4">
          <Button size="sm" variant={prefs.editorMode === EDITOR_MODE.NOTION ? 'default' : 'ghost'} onClick={() => switchMode(EDITOR_MODE.NOTION)}>Notion</Button>
          <Button size="sm" variant={prefs.editorMode === EDITOR_MODE.MARKDOWN ? 'default' : 'ghost'} onClick={() => switchMode(EDITOR_MODE.MARKDOWN)}>Markdown</Button>
        </div>
        {prefs.editorMode === EDITOR_MODE.NOTION
          ? <NotionEditor content={content} onChange={persist} theme={prefs.theme} />
          : <MarkdownEditor content={content} onChange={persist} />}
      </div>
      {toc.length > 0 && <div className="w-56 p-4 border-l"><TableOfContents items={toc} /></div>}
    </div>
  );
}
```

> 标题编辑（重命名）与封面/图标选择 UI 按源文件补全：标题双击进入编辑 → `dbApi.renameNode`；封面下拉选 `PRESET_COVERS` → `dbApi.updateCover`；图标选 `EMOJIS` → `dbApi.updateIcon`。每步完成后 `invokeService('node_changed')` + `onNodeChanged()`。

- [ ] **Step 3: 预览验证清单**

选中文档 → notion 编辑输入 → 自动保存 → 切 markdown → 内容转换正确 → TOC 随内容更新 → 改标题/封面/图标 → 多标签同步。版本：多次保存后查 `node_versions` 表有记录。
Expected: 编辑/保存/模式切换/TOC/元信息编辑全可用。

- [ ] **Step 4: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-main-panel.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/table-of-contents.jsx
git commit -m "feat(mini-app/notion-database): main-panel 编辑器接入 + TOC"
```

---

## Task 8: 对话框组（database-dialog / vector-dialog / quick-search / version-history / trash-bin）

**Files:**
- Create: `MDB/src/components/database-dialog.jsx`
- Create: `MDB/src/components/database-vector-dialog.jsx`
- Create: `MDB/src/components/quick-search-modal.jsx`
- Create: `MDB/src/components/version-history-dialog.jsx`
- Create: `MDB/src/components/trash-bin-modal.jsx`
- Modify: `MDB/src/components/database-sidebar.jsx`（接通 vector/trash 入口）

**源参考：** 对应 `database/*.tsx` 同名文件。

- [ ] **Step 1: database-dialog.jsx（库设置/节点属性对话框）**

读取 `database-dialog.tsx`，改造（R1/R2）。本次单库：用于编辑库显示名（存 config `dbName`）与展示统计。props `{ open, onClose, stats }`。用 `Dialog/DialogContent/...` from `window.AgentSpacesUI`。

- [ ] **Step 2: database-vector-dialog.jsx（向量索引/搜索）**

读取 `database-vector-dialog.tsx`，改造：
- 顶部 `import { indexNode, queryNodes, deleteIndexed } from '../utils/vector.js';`
- `import * as dbApi from '../utils/db.js';`
- 索引按钮：遍历 `dbApi.listNodes()`（type=document, 非回收站），对每个 `indexNode(node)`，把返回 `fileId` 写回 `dbApi.updateNode(node.id, { kbFileId })`。显示进度 + stats（已索引/总数）。
- 搜索框：`queryNodes(q)` → 按 `nodeId` 过滤出本库文档，展示 `{ title, score, snippet }`，点击跳转（`onSelect(nodeId)` → 容器 `updatePrefs({activeId})`）。
- 删除索引：`deleteIndexed(node.kbFileId)` + 清空 `kbFileId`。

骨架：

```jsx
import { useState } from 'react';
import { indexNode, queryNodes, deleteIndexed } from '../utils/vector.js';
import * as dbApi from '../utils/db.js';
import { T } from '../utils/constants.js';
const { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, Progress } = window.AgentSpacesUI;

export function DatabaseVectorDialog({ open, onClose, onSelect }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState(0);

  const doIndex = async () => {
    setIndexing(true);
    const docs = (await dbApi.listNodes()).filter((n) => !n.isTrash);
    let done = 0;
    for (const n of docs) {
      const r = await indexNode(n);
      if (r?.fileId) await dbApi.updateNode(n.id, { kbFileId: r.fileId });
      done++; setProgress(Math.round((done / docs.length) * 100));
    }
    setIndexing(false);
  };
  const doSearch = async () => { const { matches } = await queryNodes(q); setResults(matches.filter((m) => m.nodeId)); };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{T.vector}</DialogTitle></DialogHeader>
        <Button onClick={doIndex} disabled={indexing}>{indexing ? `索引中 ${progress}%` : '开始索引'}</Button>
        {indexing && <Progress value={progress} />}
        <div className="flex gap-2 mt-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search} />
          <Button onClick={doSearch}>查</Button>
        </div>
        {results.map((m, i) => (
          <div key={i} className="py-1 cursor-pointer hover:bg-accent rounded px-2" onClick={() => { onSelect(m.nodeId); onClose(); }}>
            <div className="font-medium">{m.title}</div>
            <div className="text-xs opacity-60">score: {Number(m.score).toFixed(3)}</div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: quick-search-modal.jsx**

读取 `quick-search-modal.tsx`，改造：纯本地 `dbApi.listNodes()` 按 title 模糊过滤 + 键盘导航（↑↓⏎）。props `{ open, onClose, onSelect }`。

- [ ] **Step 4: version-history-dialog.jsx**

读取 `version-history-dialog.tsx`，改造：
- 数据 `dbApi.listVersions(nodeId)`。
- 原 `DiffViewer`（git）不可用 → 简易并排展示 `oldContent` vs `newContent`（纯文本/HTML 对比，高亮差异可省，先并排）。
- 「还原」→ `dbApi.updateNode(nodeId, { content: version.newContent })` + 广播。
props `{ open, onClose, nodeId }`。

- [ ] **Step 5: trash-bin-modal.jsx**

读取 `trash-bin-modal.tsx`，改造：
- 数据 `(await dbApi.listNodes()).filter((n) => n.isTrash)`。
- 恢复 `dbApi.restoreNode` / 彻底删除 `dbApi.deleteNode`，完成广播。
props `{ open, onClose }`。

- [ ] **Step 6: sidebar 接通 vector/trash 入口**

修改 `database-sidebar.jsx` Task 6 的占位按钮：引入 `useState` 控制 dialog 开关，挂载 `DatabaseVectorDialog` 与 `TrashBinModal`。

- [ ] **Step 7: 预览验证清单**

向量：索引 → 搜索语义相关词 → 命中正确文档 → 点结果跳转。版本：多次保存后打开历史 → 并排展示 → 还原。回收站：删除文档 → 回收站见 → 恢复/彻底删。快速搜索：模糊匹配 + 键盘选择。
Expected: 五个对话框全可用。

- [ ] **Step 8: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-dialog.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-vector-dialog.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/quick-search-modal.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/version-history-dialog.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/trash-bin-modal.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-sidebar.jsx
git commit -m "feat(mini-app/notion-database): 对话框组 (vector/version/trash/quick-search/db)"
```

---

## Task 9: database-ai-chat.jsx（AI 对话，走 agent_run）

**Files:**
- Create: `MDB/src/components/database-ai-chat.jsx`
- Modify: `MDB/src/index.jsx` 或 `database-main-panel.jsx`（挂载入口）

**源参考：** `database-ai-chat.tsx`（4.7KB）。

- [ ] **Step 1: 写 database-ai-chat.jsx**

读取 `database-ai-chat.tsx`，改造：
- `import { listPresets, runAgent } from '../utils/ai-chat.js';`
- 删除 `sdk`、`AgentDialog`、`FloatingChatPanel`（若 ui-exports 无）→ 用 `window.AgentSpacesUI` 的 `Popover`/`Button`/`ScrollArea` 组合一个浮动对话面板。
- preset 选择：`listPresets()` → 下拉选 `agentConfigId`。
- 发送：`runAgent({ agentConfigId, prompt: 用户输入 + 当前文档上下文 })` → 追加 AI 回复到消息列表。
- 消息列表本地 state（不持久化，会话级）。
props `{ open, onClose, context }`（context 可包含当前文档 title+content 作为 AI 上下文）。

骨架：

```jsx
import { useState, useEffect } from 'react';
import { listPresets, runAgent } from '../utils/ai-chat.js';
import { T } from '../utils/constants.js';
const { Button, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Popover, PopoverContent, PopoverTrigger } = window.AgentSpacesUI;

export function DatabaseAiChat({ open, onClose, context }) {
  const [presets, setPresets] = useState([]);
  const [presetId, setPresetId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { listPresets().then((p) => { setPresets(p); setPresetId(p[0]?.id || ''); }); }, []);

  const send = async () => {
    if (!input.trim() || !presetId) return;
    const userMsg = { role: 'user', text: input };
    setMessages((m) => [...m, userMsg]); setInput(''); setLoading(true);
    try {
      const prompt = context ? `文档《${context.title}》内容：\n${context.content}\n\n用户问题：${input}` : input;
      const reply = await runAgent({ agentConfigId: presetId, prompt });
      setMessages((m) => [...m, { role: 'ai', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', text: `出错：${e.message}` }]);
    } finally { setLoading(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed bottom-4 right-4 w-96 h-[60vh] bg-background border rounded-lg shadow-xl flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <Select value={presetId} onValueChange={setPresetId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="选择 Agent" /></SelectTrigger>
          <SelectContent>{presets.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <span className={m.role === 'user' ? 'bg-primary text-primary-foreground px-2 py-1 rounded' : 'bg-muted px-2 py-1 rounded'}>{m.text}</span>
          </div>
        ))}
        {loading && <div className="text-xs opacity-60">AI 思考中…</div>}
      </div>
      <div className="p-2 border-t flex gap-1">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} className="flex-1" rows={2} />
        <Button onClick={send} disabled={loading}>发送</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 挂载入口**

在 `index.jsx` 加 `aiChatOpen` state + 右下角悬浮按钮（`window.AgentSpacesUI` 的 Button）打开 `DatabaseAiChat`，传入 `context={activeNode ? { title: activeNode.title, content: activeNode.content } : null}`。

- [ ] **Step 3: 预览验证清单**

选 preset → 提问 → AI 回复 → 带文档上下文提问。确认 `list_agent_presets` 返回非空、`agent_run` 返回结果。
Expected: AI 对话可用。

- [ ] **Step 4: Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/components/database-ai-chat.jsx packages/server/agent-spaces-data/mini-apps/notion-database/src/index.jsx
git commit -m "feat(mini-app/notion-database): AI 对话组件 (agent_run)"
```

---

## Task 10: web 侧清理

**Files:**
- Modify/Delete: `packages/web/src/components/layout/workspace-shell.tsx:528,653`
- Delete: `packages/web/src/components/database/`（剩余 14 文件）
- Delete: `packages/web/src/stores/database.ts`
- Modify/Delete: `packages/sdk/src/modules/database.ts`、`packages/sdk/src/index.ts`
- Modify/Delete: `packages/server/src/app.ts:39,301`、`packages/server/src/routes/database.ts`
- Delete: `packages/server/src/services/database-vector.ts`
- Delete: `packages/server/src/storage/database-store.ts`
- Delete (确认后): `packages/server/src/services/builtin-tools/database-tools.ts`
- Delete (确认后): `packages/shared/src/types/database.ts` 及聚合引用

- [ ] **Step 1: 移除 workspace-shell 入口**

```bash
grep -n "DatabaseSidebarPanel\|components/database" packages/web/src/components/layout/workspace-shell.tsx
```
删除 line 528、653 的 `DatabaseSidebarPanel` 渲染分支与对应 import。保留 sidebar 配置结构（database tab 暂时移除或置空），确保编译通过。

- [ ] **Step 2: 删除 web database 组件目录**

```bash
rm -rf packages/web/src/components/database
```

- [ ] **Step 3: 删除 web store**

```bash
rm packages/web/src/stores/database.ts
grep -rln "@/stores/database\|useDatabaseStore" packages/web/src
```
Expected: 第二条无输出（database 目录已删，无残留）。

- [ ] **Step 4: 删除 sdk database 模块**

```bash
rm packages/sdk/src/modules/database.ts
```
编辑 `packages/sdk/src/index.ts`：删除 line 39 `export { createDatabaseApi }`、line 85 import、line 134 `readonly database`、line 191 `database: createDatabaseApi`。

- [ ] **Step 5: 删除 server database 路由 + 挂载**

编辑 `packages/server/src/app.ts`：删除 line 39 `import databaseRouter` 与 line 301 `app.use('/api/workspaces/:id/database', databaseRouter)`。

```bash
rm packages/server/src/routes/database.ts
```

- [ ] **Step 6: 删除 server database 服务/存储**

```bash
rm packages/server/src/services/database-vector.ts
rm packages/server/src/storage/database-store.ts
```

- [ ] **Step 7: 确认并删除 database-tools.ts**

```bash
grep -rln "database-tools\|from './database-tools\|builtin-tools/database-tools" packages/server/src
```
若无其他引用 → `rm packages/server/src/services/builtin-tools/database-tools.ts`。若有引用，先迁移引用再删。

- [ ] **Step 8: 确认并删除 shared 类型**

```bash
grep -rln "from '@agent-spaces/shared'" packages/server/src packages/web/src packages/sdk/src | xargs grep -l "DatabaseMeta\|DocNode\|DatabaseNodeVersion\|DatabaseVector" 2>/dev/null
```
若结果只剩 shared 内部聚合 → 删除 `packages/shared/src/types/database.ts` 并从 `types/index.ts` 移除 re-export。若仍有 web/server 引用（理论上 Task 1-9 已清），先清引用。

- [ ] **Step 9: 确认 embedding-util 是否还有其他消费方**

```bash
grep -rln "embedding-util\|embedTexts\|requireEmbeddingModelConfig" packages/server/src
```
若仅 database-vector.ts（已删）引用 → 可保留 embedding-util（其他 KB 功能可能用），**不删**（保守，KB 工具仍需 embedding）。

- [ ] **Step 10: 全量构建与测试**

```bash
pnpm -r lint
pnpm build
cd packages/server && pnpm test && cd ../..
```
Expected: 全绿，无悬空 import / 类型错误。

- [ ] **Step 11: grep 终检无残留**

```bash
grep -rn "useDatabaseStore\|sdk.database\|/api/workspaces/.*/database\|DatabaseSidebarPanel\|components/database" packages/web/src packages/sdk/src packages/server/src 2>/dev/null | grep -v node_modules
```
Expected: 无输出（或仅注释/无关命中）。

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: 移除 web/workspace 原生 database 实现（迁移至 notion-database mini-app）"
```

---

## Task 11: 全量回归验证

- [ ] **Step 1: mini-app 全链路（参照 spec §9）**

在 `/mini-apps-preview/notion-database` 执行：
1. 建文件夹/文档嵌套树 → 重命名/移动/图标/封面
2. notion 编辑（slash、标题、列表、任务、代码）→ markdown 切换 → 保存
3. 快速搜索定位
4. 版本历史 → 还原
5. 回收站 → 恢复 / 彻底删
6. 向量索引 → 语义搜索 → 回连跳转
7. AI 对话（选 preset → agent_run）
8. 多标签同步（开两个预览，一端改动另一端刷新）
Expected: 全部通过。

- [ ] **Step 2: web 侧回归**

```bash
pnpm build
```
启动 `pnpm dev`，确认 workspace 不再有 database 面板入口、其余功能正常、控制台无报错。
Expected: 构建通过，workspace 正常。

- [ ] **Step 3: 更新文档**

更新 `MDB/src/CLAUDE.md`：填入 File Structure / Key Design Decisions / Dependencies / Notes（参考 copywriting 的 CLAUDE.md 风格）。

- [ ] **Step 4: 最终 Commit**

```bash
git add packages/server/agent-spaces-data/mini-apps/notion-database/src/CLAUDE.md
git commit -m "docs(notion-database): 补充 mini-app CLAUDE.md"
```

---

## Self-Review 记录

- **Spec coverage**：spec §4 公共编辑器 → Task 1-2；§5 组件结构 → Task 5-9（含 nested-tree 重写、回调联动）；§6 数据层 → Task 3-4；§7 向量/AI → Task 8(vector)/9(ai)；§8 web 清理 → Task 10；§9 验证 → Task 11。全覆盖。
- **关键修正（相对 spec）**：
  1. kb 工具参数确认为 `knowledgeBase`（非 `kbId`），无 metadata → nodeId 回连靠 title 前缀 `node:<id>` + nodes 表 `kbFileId` 列（Task 3/8）。
  2. service handler 运行在服务端 Node，无 `window.AgentSpaces.db` → 节点 CRUD 改为**前端**直接访问 SQLite，service 仅负责 config 偏好广播 + node_changed 事件广播（Task 4）。
  3. tiptap 白名单注册点精确定位在 `react-renderer.tsx` 的 `resolveExternalModule`（Task 2）。
- **Placeholder 扫描**：无 TBD/TODO；组件迁移因源文件已存在，采用「读取源 + 改造规则(R1-R6)」确定性指令，非占位。
- **类型/命名一致性**：handler 名（R6）与各任务调用一致；`db.js` 导出函数名（createNode/updateNode/...）在 Task 4 定义、Task 6-9 引用一致；`KB_ID` 常量跨 vector.js/constants.js 一致；props 契约（onSelect/onToggle/onNodeChanged/onContentChange/onModeChange）跨容器与子组件一致。
- **风险任务**：Task 2 Step 7（tiptap 沙箱兼容）是最高风险点，前置独立验证；若失败需回评估"是否改用 Task 1 备选方案（mini-app 仅 markdown）"。
