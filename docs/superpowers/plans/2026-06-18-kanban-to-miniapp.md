# Kanban 迁移到 Mini-app 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `packages/web/src/components/kanban` 迁移为自包含的 mini-app（`agent-spaces-data/mini-apps/kanban`），通讯改为 `invokeService` + `getConfig/onConfigChanged`，删除全部旧 kanban 后端。

**Architecture:** kanban 成为 mini-app project（projectId=kanban）。UI 是 Babel 沙箱 JSX（复用 `@dnd-kit/*`、`window.AgentSpacesUI`、tailwind）。数据存 `configs/board.json`；写经 `src/services/board.js` 的 `ctx.updateConfig`（唯一写入方，自动广播 `miniApp.configChanged`），读经 `getConfig` + `onConfigChanged`，多端同步由宿主 WS 频道天然提供。

**Tech Stack:** React（CDN 全局）、`@dnd-kit/core`/`sortable`/`utilities`（renderer 已映射）、`window.AgentSpacesUI`（shadcn 组件 + lucide 图标）、`window.AgentSpaces`（getConfig/onConfigChanged/invokeService）、better-sqlite3（不用，本期 config JSON）。

---

## 适配说明（相对 spec 的必要调整，执行前知悉）

1. **无单元测试框架**：mini-app 运行在浏览器 Babel 沙箱（`new Function`），没有 jest/vitest。本计划用**预览验证**（打开 `/mini-apps-preview/kanban` 操作看板）+ **build/lint/grep 验证**（删除任务的回归保障）替代 TDD 的红绿循环。
2. **移除「创建为 Issue」功能**：原 `kanban-board.tsx` 的 `onCreateIssue`/`CreateIssueDialog`/`useIssueStore`/`useAgentStore` 依赖 host store 与组件，mini-app 沙箱内不存在。第一阶段移除该功能（task-modal 的「创建为 Issue」按钮 + board 的 CreateIssueDialog），其余功能 1:1 复刻。属 spec 未预见的实现约束。
3. **i18n 改硬编码**：原 `useTranslations('kanban')`(next-intl) 在沙箱不可用。文案集中到 `src/utils/i18n.js`，与 tts 项目硬编码中文的做法一致。
4. **workspace 旧 kanban tab 必然移除**：组件被删 + 后端被删后，`workspace-shell.tsx` 的 kanban tab 失去支撑。本计划移除该 tab 引用（属「删除旧代码」范畴，**不是**做新的 workspace 嵌入——后者是第二阶段）。
5. **tailwind 可用**：预览页是 Next.js 页面（`/mini-apps-preview/[id]`），继承 root layout 的 globals.css（Tailwind 4），iframe 加载的也是该页。故原 kanban 的 tailwind class 直接复用。

## File Structure

**创建（mini-app 实例，`packages/server/agent-spaces-data/mini-apps/kanban/`）：**

| 文件 | 职责 |
|------|------|
| `manifest.json` | project 元数据，`mainFile: "index.jsx"` |
| `configs/board.json` | 运行时 board 数据（初始空） |
| `src/index.jsx` | 入口，组合 board，注入 useBoard |
| `src/components/kanban-board.jsx` | 看板视图 + DndContext + 工具栏 |
| `src/components/kanban-column.jsx` | 列容器 + SortableContext |
| `src/components/kanban-card.jsx` | 卡片 + useSortable |
| `src/components/task-modal.jsx` | 任务新建/编辑弹窗 |
| `src/components/column-modal.jsx` | 列新建/编辑弹窗 |
| `src/components/column-manage-dialog.jsx` | 列管理（排序/编辑/删除） |
| `src/hooks/use-board.js` | getConfig/onConfigChanged + invokeService 封装 |
| `src/services/board.js` | 服务端唯一写入方（4 handler） |
| `src/utils/i18n.js` | 硬编码中文文案表 |
| `src/utils/constants.js` | 颜色/优先级常量、genId |

**创建（模板）：** `packages/templates/mini-app/kanban.zip`（实例 src 的打包）+ 在 `packages/templates/mini-app/index.json` 注册。

**删除（旧代码）：** 见 Task 10/11 清单。

---

## Task 1: 创建 mini-app 骨架 + manifest + 初始 board.json

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/manifest.json`
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/configs/board.json`
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`

- [ ] **Step 1: 写 manifest.json**

`packages/server/agent-spaces-data/mini-apps/kanban/manifest.json`：
```json
{
  "id": "kanban",
  "name": "kanban",
  "version": "1.0.0",
  "type": "react",
  "tags": ["productivity"],
  "mainFile": "index.jsx",
  "createdAt": "2026-06-18T00:00:00.000Z",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "description": "看板",
  "icon": "📋",
  "avatarUrl": ""
}
```

- [ ] **Step 2: 写初始 board.json（空 board）**

`packages/server/agent-spaces-data/mini-apps/kanban/configs/board.json`：
```json
{
  "title": "Kanban",
  "layoutMode": "horizontal",
  "columns": [],
  "tasks": []
}
```

- [ ] **Step 3: 写最小入口 index.jsx（冒烟测试 tailwind + 渲染）**

`packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`：
```jsx
const { useState, useEffect } = React;

function App() {
  const [board, setBoard] = useState(null);

  useEffect(() => {
    // configSnapshot 连入后建立缓存；轮询 getConfig 直到拿到 board.json
    const timer = setInterval(() => {
      const b = window.AgentSpaces?.getConfig?.('board.json');
      if (b) { setBoard(b); clearInterval(timer); }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  if (!board) return <div className="p-4 text-sm text-muted-foreground">加载中...</div>;
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-primary">{board.title}</h1>
      <p className="text-xs text-muted-foreground mt-1">layout: {board.layoutMode}</p>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: 验证 project 被识别 + tailwind 生效**

启动 `pnpm dev`，浏览器打开 `http://localhost:3000/mini-apps-preview/kanban`。
Expected: 显示「Kanban」标题（`text-primary` 着色，证明 tailwind 生效）+ 「layout: horizontal」。若标题无颜色（黑色），说明 tailwind 未注入——停止并排查 layout 链（不应发生）。

- [ ] **Step 5: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban"
git commit -m "feat(kanban-miniapp): 添加骨架 manifest/初始 board/冒烟入口"
```

---

## Task 2: services/board.js（服务端唯一写入方）+ utils

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/services/board.js`
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/utils/constants.js`

- [ ] **Step 1: 写 utils/constants.js**

`packages/server/agent-spaces-data/mini-apps/kanban/src/utils/constants.js`：
```js
// id 生成：crypto.randomUUID 优先，回退 Date.now+random
export function genId(prefix) {
  const g = globalThis.crypto;
  const uid = g?.randomUUID ? g.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}_${uid}`;
}

export const PRIORITY_OPTIONS = ['low', 'medium', 'high'];
export const LAYOUT_MODES = ['horizontal', 'vertical'];
export const COLUMN_COLORS = ['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'];
```

- [ ] **Step 2: 写 services/board.js（4 handler，唯一写入方）**

handler 不能 `import`（加载时剥离 import 行），校验内联；能力通过 `ctx` 注入。

`packages/server/agent-spaces-data/mini-apps/kanban/src/services/board.js`：
```js
const BOARD_PATH = 'board.json';

function normBoard(prev) {
  // 兜底：保证字段完整，避免旧/空数据缺字段
  return {
    title: (prev && prev.title) || 'Kanban',
    layoutMode: (prev && prev.layoutMode) || 'horizontal',
    columns: Array.isArray(prev && prev.columns) ? prev.columns : [],
    tasks: Array.isArray(prev && prev.tasks) ? prev.tasks : [],
  };
}

export default {
  update_title: ({ title }, ctx) => {
    const t = typeof title === 'string' ? title.slice(0, 100) : 'Kanban';
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), title: t }));
  },
  update_layout: ({ layoutMode }, ctx) => {
    const m = layoutMode === 'vertical' ? 'vertical' : 'horizontal';
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), layoutMode: m }));
  },
  update_columns: ({ columns }, ctx) => {
    const cols = Array.isArray(columns) ? columns : [];
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), columns: cols }));
  },
  update_tasks: ({ tasks }, ctx) => {
    const ts = Array.isArray(tasks) ? tasks : [];
    return ctx.updateConfig(BOARD_PATH, (prev) => ({ ...normBoard(prev), tasks: ts }));
  },
};
```

- [ ] **Step 3: 验证 service 写入（浏览器 console）**

打开 `http://localhost:3000/mini-apps-preview/kanban`，DevTools Console 执行：
```js
await window.AgentSpaces.invokeService('update_title', { title: '测试看板' })
```
Expected: 返回新 board 对象，`title === '测试看板'`。再执行 `window.AgentSpaces.getConfig('board.json')` 应看到 `title: '测试看板'`。失败则检查 server 日志的 service 编译错误。

- [ ] **Step 4: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/services/board.js" "packages/server/agent-spaces-data/mini-apps/kanban/src/utils/constants.js"
git commit -m "feat(kanban-miniapp): 添加 board service(4 handler) 与常量工具"
```

---

## Task 3: hooks/use-board.js + i18n，index.jsx 接入

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/hooks/use-board.js`
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/utils/i18n.js`
- Modify: `packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`

- [ ] **Step 1: 写 utils/i18n.js（硬编码中文，替代 next-intl）**

`packages/server/agent-spaces-data/mini-apps/kanban/src/utils/i18n.js`：
```js
export const t = {
  // toolbar
  searchPlaceholder: '搜索卡片...',
  newCard: '新卡片',
  section: '管理分区',
  vertical: '纵向',
  horizontal: '横向',
  // empty
  noSections: '还没有分区',
  useTemplate: '使用模板',
  addSection: '添加分区',
  newSection: '新建分区',
  // priority
  priorityAll: '全部',
  priorityHigh: '高',
  priorityMedium: '中',
  priorityLow: '低',
  low: '低',
  medium: '中',
  high: '高',
  // column
  emptySection: '空分区',
  dropHint: '拖放卡片到这里',
  addTask: '添加任务',
  // task modal
  taskDetails: '任务详情',
  title: '标题',
  titlePlaceholder: '输入任务标题',
  descriptionLabel: '描述',
  descriptionPlaceholder: '输入任务描述（可选）',
  sectionLabel: '分区',
  selectSection: '选择分区',
  dueDate: '截止日期',
  priority: '优先级',
  deleteConfirm: '确认删除？',
  yes: '是',
  // column modal
  editSection: '编辑分区',
  sectionName: '分区名称',
  sectionNamePlaceholder: '输入分区名称',
  theme: '主题',
  // manage dialog
  manageSections: '管理分区',
  confirm: '确认',
  no: '否',
  // card
  done: '已完成',
  archived: '已归档',
  // common
  loading: '加载中...',
  cancel: '取消',
  delete: '删除',
  save: '保存',
  create: '创建',
};
```

- [ ] **Step 2: 写 hooks/use-board.js**

`packages/server/agent-spaces-data/mini-apps/kanban/src/hooks/use-board.js`：
```js
import { genId } from '../utils/constants.js';

const BOARD_PATH = 'board.json';
const EMPTY_BOARD = { title: 'Kanban', layoutMode: 'horizontal', columns: [], tasks: [] };

export function useBoard() {
  const [board, setBoard] = React.useState(EMPTY_BOARD);
  const [loaded, setLoaded] = React.useState(false);

  // 初始化：configSnapshot 建立缓存后 getConfig 拿到；轮询至就绪
  React.useEffect(() => {
    let timer;
    const read = () => {
      const b = window.AgentSpaces?.getConfig?.(BOARD_PATH);
      if (b) { setBoard(b); setLoaded(true); clearInterval(timer); }
    };
    read();
    timer = setInterval(read, 100);
    return () => clearInterval(timer);
  }, []);

  // 订阅变更：service 写盘后自动广播 miniApp.configChanged → 多端同步
  React.useEffect(() => {
    const AS = window.AgentSpaces;
    if (!AS?.onConfigChanged) return;
    const unsub = AS.onConfigChanged((path, value) => {
      if (path === BOARD_PATH && value) setBoard(value);
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  const update = React.useCallback((patch) => {
    // 乐观更新本地 + 落盘（service 广播后会用权威值回填）
    setBoard((prev) => ({ ...prev, ...patch }));
    if (patch.title !== undefined) AS_invoke('update_title', { title: patch.title });
    else if (patch.layoutMode !== undefined) AS_invoke('update_layout', { layoutMode: patch.layoutMode });
    else if (patch.columns !== undefined) AS_invoke('update_columns', { columns: patch.columns });
    else if (patch.tasks !== undefined) AS_invoke('update_tasks', { tasks: patch.tasks });
  }, []);

  return { board: { ...EMPTY_BOARD, ...board }, loaded, update };
}

function AS_invoke(name, payload) {
  window.AgentSpaces?.invokeService?.(name, payload).catch((e) => {
    console.error('[kanban] service failed:', name, e);
  });
}

// 便捷 action 工厂（供 board 组件调用）
export function createBoardActions(board, update) {
  return {
    updateLayout: (layoutMode) => update({ layoutMode }),
    addColumn: (title, color) => {
      const col = { id: genId('col'), title, color, order: board.columns.length };
      update({ columns: [...board.columns, col] });
    },
    editColumn: (colId, title, color) => update({
      columns: board.columns.map((c) => (c.id === colId ? { ...c, title, color } : c)),
    }),
    deleteColumn: (colId) => {
      update({ columns: board.columns.filter((c) => c.id !== colId) });
      update({ tasks: board.tasks.filter((tk) => tk.columnId !== colId) });
    },
    reorderColumns: (columns) => update({ columns: columns.map((c, i) => ({ ...c, order: i })) }),
    setTasks: (tasks) => update({ tasks }),
    saveTask: (task) => {
      const exists = board.tasks.some((tk) => tk.id === task.id);
      update({ tasks: exists ? board.tasks.map((tk) => (tk.id === task.id ? task : tk)) : [...board.tasks, task] });
    },
    deleteTask: (taskId) => update({ tasks: board.tasks.filter((tk) => tk.id !== taskId) }),
  };
}
```

> 说明：`update` 内乐观 `setBoard` 后异步 `invokeService`；服务端广播的 `configChanged` 会回填权威值（多端一致）。两个 `update` 连续调用（如 deleteColumn 同时清 tasks）会各自落盘，服务端 `updateConfig` 单线程串行读改写，无并发覆盖。

- [ ] **Step 3: index.jsx 接入 useBoard 显示 board**

`packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`（替换 Task 1 内容）：
```jsx
import { useBoard } from './hooks/use-board.js';
import { t } from './utils/i18n.js';

function App() {
  const { board, loaded } = useBoard();
  if (!loaded) return <div className="p-4 text-sm text-muted-foreground">{t.loading}</div>;
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-primary">{board.title}</h1>
      <p className="text-xs text-muted-foreground mt-1">
        layout: {board.layoutMode} · columns: {board.columns.length} · tasks: {board.tasks.length}
      </p>
    </div>
  );
}

export default App;
```

- [ ] **Step 4: 验证 hook 读 config + 订阅**

打开 `http://localhost:3000/mini-apps-preview/kanban`，Console 执行 `await window.AgentSpaces.invokeService('update_columns', { columns: [{ id: 'c1', title: '待办', color: 'sky', order: 0 }] })`。
Expected: 页面无需刷新即显示 `columns: 1`（证明 `onConfigChanged` 订阅生效）。再执行清空 `{ columns: [] }`，数字回到 0。

- [ ] **Step 5: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/hooks/use-board.js" "packages/server/agent-spaces-data/mini-apps/kanban/src/utils/i18n.js" "packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx"
git commit -m "feat(kanban-miniapp): useBoard hook(config 读写+订阅) 与 i18n 文案"
```

---

## Task 4: 迁移 kanban-card.jsx

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-card.jsx`

转换要点：去 `"use client"`、React 从全局、`useTranslations`→`t`、`@dnd-kit/*` 直接 import、lucide 图标从 `window.AgentSpacesUI` 解构、去 `KanbanTask`/`KanbanPriority` 类型 import（JSX 无类型）。

- [ ] **Step 1: 写 kanban-card.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-card.jsx`：
```jsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../utils/i18n.js';

const { Calendar, AlignLeft, GripVertical, CheckCircle2, AlertCircle } = window.AgentSpacesUI;

const PRIORITY_STYLES = {
  low: { text: 'text-emerald-700 bg-emerald-50 border border-emerald-100', dot: 'bg-emerald-500' },
  medium: { text: 'text-amber-700 bg-amber-50 border border-amber-100', dot: 'bg-amber-500' },
  high: { text: 'text-rose-700 bg-rose-50 border border-rose-100', dot: 'bg-rose-500' },
};

const PRIORITY_LABEL = { low: t.low, medium: t.medium, high: t.high };

function formatDate(dateStr) {
  try { return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return dateStr; }
}

export default function KanbanCard({ task, onClick, isOverlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isOverlay,
  });

  const style = isOverlay
    ? { transform: 'rotate(2.5deg) scale(1.04)', cursor: 'grabbing' }
    : { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1, cursor: isDragging ? 'grabbing' : 'pointer' };

  const ps = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.columnId !== 'done' && task.columnId !== 'archive';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => { if (!isDragging) onClick(); }}
      className={`group relative flex flex-col p-4 bg-white dark:bg-neutral-800 rounded-xl border border-stone-200 dark:border-neutral-700 hover:border-stone-400 dark:hover:border-neutral-500 hover:shadow-md transition-all duration-200 ${isOverlay ? 'shadow-2xl border-2 scale-105 rotate-2 z-20' : 'shadow-xs'}`}
      {...(!isOverlay ? attributes : {})}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ${ps.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ps.dot}`} />
          {PRIORITY_LABEL[task.priority]}
        </span>
        {!isOverlay && (
          <div {...listeners} className="p-1 text-stone-300 group-hover:text-stone-500 rounded-md hover:bg-stone-50 dark:hover:bg-neutral-700 transition cursor-grab active:cursor-grabbing" onClick={(e) => e.stopPropagation()}>
            <GripVertical className="h-4 w-4" />
          </div>
        )}
      </div>
      <h4 className="text-sm font-semibold text-stone-800 dark:text-neutral-100 line-clamp-2 leading-snug mb-1.5">{task.title}</h4>
      {task.description ? <p className="text-xs text-stone-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-3">{task.description}</p> : null}
      <div className="border-t border-stone-100 dark:border-neutral-700 my-2" />
      <div className="flex items-center justify-between text-[11px] text-stone-400 dark:text-neutral-500 font-medium">
        <div className="flex items-center gap-1">
          {task.description ? <AlignLeft className="h-3.5 w-3.5 text-stone-300" /> : null}
          {task.columnId === 'done' ? <span className="flex items-center gap-0.5 text-emerald-600 font-bold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{t.done}</span> : null}
          {task.columnId === 'archive' ? <span className="flex items-center gap-0.5 text-stone-500 font-bold"><AlertCircle className="h-3.5 w-3.5 text-stone-400" />{t.archived}</span> : null}
        </div>
        {task.dueDate ? (
          <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${overdue ? 'text-rose-600 bg-rose-50 font-bold border border-rose-100' : 'text-stone-500'}`}>
            <Calendar className="h-3 w-3" />{formatDate(task.dueDate)}
          </span>
        ) : (
          <span className="text-[10px] text-stone-300">{formatDate(new Date(task.createdAt).toISOString())}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 临时挂到 index.jsx 验证渲染**

临时在 `index.jsx` 的 `App` 里 `{board.tasks.length > 0 && <KanbanCard task={board.tasks[0]} onClick={() => {}} />}`（import KanbanCard），Console 执行：
```js
await window.AgentSpaces.invokeService('update_tasks', { tasks: [{ id: 'tk1', title: '示例', description: '描述', priority: 'high', columnId: 'c1', order: 0, createdAt: Date.now(), dueDate: null }] })
```
Expected: 页面出现「示例」卡片（红色 high 徽章）。验证后**移除临时挂载**，恢复 index.jsx 为 Task 3 的内容。

- [ ] **Step 3: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-card.jsx"
git commit -m "feat(kanban-miniapp): 迁移 kanban-card 组件"
```

---

## Task 5: 迁移 kanban-column.jsx

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-column.jsx`

- [ ] **Step 1: 写 kanban-column.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-column.jsx`：
```jsx
import { useState } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import KanbanCard from './kanban-card.jsx';
import { t } from '../utils/i18n.js';

const { Plus, ChevronDown, ChevronUp } = window.AgentSpacesUI;

const COLOR_OPTIONS = [
  { name: 'slate', headerBg: 'border-t-stone-500 bg-stone-50 dark:bg-neutral-800 text-stone-700 dark:text-neutral-200' },
  { name: 'sky', headerBg: 'border-t-sky-500 bg-sky-50/40 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300' },
  { name: 'emerald', headerBg: 'border-t-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' },
  { name: 'amber', headerBg: 'border-t-amber-500 bg-amber-50/40 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300' },
  { name: 'rose', headerBg: 'border-t-rose-500 bg-rose-50/40 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300' },
  { name: 'purple', headerBg: 'border-t-purple-500 bg-purple-50/40 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300' },
];

const DOT_COLORS = {
  slate: 'bg-stone-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400', purple: 'bg-purple-400',
};

export default function KanbanColumn({ column, tasks, layoutMode, onCardClick, onAddTask }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeColor = COLOR_OPTIONS.find((c) => c.name === column.color) || COLOR_OPTIONS[0];
  const taskIds = tasks.map((tk) => tk.id);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl border transition-all duration-200 dark:border-neutral-700 ${isOver ? 'bg-stone-100/60 dark:bg-neutral-700/40 scale-[1.01] shadow-xs' : 'bg-stone-50/25 dark:bg-neutral-800/50 border-stone-200 dark:border-neutral-700'} ${layoutMode === 'horizontal' ? 'w-full md:w-[310px] lg:w-[330px] shrink-0 h-full max-h-[75vh] md:max-h-[80vh]' : 'w-full'}`}
    >
      <div className={`px-4 py-3.5 border-t-2 rounded-t-2xl border-b border-stone-200/80 dark:border-neutral-700 flex items-center justify-between ${activeColor.headerBg}`}>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={`block h-3 w-3 rounded-full ${DOT_COLORS[column.color] || 'bg-stone-400'}`} />
          <h3 className="text-sm font-bold truncate">{column.title}</h3>
          <span className="bg-stone-200/70 dark:bg-neutral-600 text-stone-700 dark:text-neutral-300 text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[18px] text-center">{tasks.length}</span>
        </div>
        {layoutMode === 'vertical' && (
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-neutral-200 hover:bg-stone-100 dark:hover:bg-neutral-700 rounded-md transition cursor-pointer">
            {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        )}
      </div>

      {(!isCollapsed || layoutMode === 'horizontal') && (
        <div className={`p-3.5 flex-1 flex flex-col gap-3 min-h-[140px] select-none ${layoutMode === 'horizontal' ? 'overflow-y-auto' : ''}`}>
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.length > 0 ? (
              <div className={`grid gap-3 ${layoutMode === 'vertical' ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
                {tasks.map((task) => <KanbanCard key={task.id} task={task} onClick={() => onCardClick(task)} />)}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-6 px-4 border border-dashed border-stone-200 dark:border-neutral-600 rounded-xl text-stone-400">
                <p className="text-xs font-medium">{t.emptySection}</p>
                <p className="text-[10px] mt-1">{t.dropHint}</p>
              </div>
            )}
          </SortableContext>
          <button onClick={() => onAddTask(column.id)} className="w-full flex items-center justify-center gap-1.5 py-2 px-3 mt-1 text-xs font-semibold text-stone-500 dark:text-neutral-400 hover:text-stone-900 dark:hover:text-neutral-100 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 hover:border-stone-400 dark:hover:border-neutral-500 rounded-xl transition cursor-pointer">
            <Plus className="h-4 w-4" />{t.addTask}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-column.jsx"
git commit -m "feat(kanban-miniapp): 迁移 kanban-column 组件"
```

（此组件的渲染验证在 Task 8 整合时统一进行。）

---

## Task 6: 迁移 task-modal.jsx（移除「创建为 Issue」）

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/task-modal.jsx`

转换要点：去 `onCreateIssue`/`CreateIssueDialog` 相关；UI 组件从 `window.AgentSpacesUI` 解构。

- [ ] **Step 1: 写 task-modal.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/task-modal.jsx`：
```jsx
import { useState, useEffect } from 'react';
import { t } from '../utils/i18n.js';

const {
  Calendar, AlertCircle, FileText, LayoutGrid, Trash2, Clock,
  Input, Textarea, Label, Button, SearchSelect,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  ToggleGroup, ToggleGroupItem,
} = window.AgentSpacesUI;

const PRIORITY_COLORS = {
  low: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100', activeBg: '!bg-emerald-600 !text-white !border-emerald-600', dot: 'bg-emerald-500' },
  medium: { bg: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100', activeBg: '!bg-amber-500 !text-white !border-amber-500', dot: 'bg-amber-500' },
  high: { bg: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100', activeBg: '!bg-rose-600 !text-white !border-rose-600', dot: 'bg-rose-500' },
};

const PRIORITY_LABEL = { low: t.low, medium: t.medium, high: t.high };

export default function TaskModal({ task, columns, isOpen, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [columnId, setColumnId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setColumnId(task.columnId);
      setDueDate(task.dueDate || '');
      setIsConfirmingDelete(false);
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!title.trim()) return;
    onSave({ ...task, title: title.trim(), description: description.trim(), priority, columnId, dueDate: dueDate || undefined });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />{t.taskDetails}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" />{t.title}
            </Label>
            <Input type="text" required placeholder={t.titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm font-medium" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <AlertCircle className="h-3.5 w-3.5" />{t.descriptionLabel}
            </Label>
            <Textarea rows={4} placeholder={t.descriptionPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <LayoutGrid className="h-3.5 w-3.5" />{t.sectionLabel}
              </Label>
              <SearchSelect value={columnId} onChange={setColumnId} options={columns.map((col) => ({ value: col.id, label: col.title }))} placeholder={t.selectSection} allowCustom={false} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5" />{t.dueDate}
              </Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Clock className="h-3.5 w-3.5" />{t.priority}
            </Label>
            <ToggleGroup variant="outline" value={[priority]} onValueChange={(v) => { if (v.length) setPriority(v[v.length - 1]); }} className="grid grid-cols-3 w-full">
              {['low', 'medium', 'high'].map((p) => {
                const colors = PRIORITY_COLORS[p];
                const active = priority === p;
                return (
                  <ToggleGroupItem key={p} value={p} aria-label={`Priority ${p}`} className={`flex items-center justify-center gap-1.5 text-xs font-semibold ${active ? colors.activeBg + ' !border' : colors.bg}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : colors.dot}`} />
                    {PRIORITY_LABEL[p]}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
          </div>
        </form>
        <DialogFooter className="!-mx-0 !-mb-0 px-6 py-4 border-t flex-row justify-between sm:justify-between">
          {isConfirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-rose-600 animate-pulse">{t.deleteConfirm}</span>
              <Button size="sm" variant="destructive" onClick={() => { onDelete(task.id); onClose(); }}>{t.yes}</Button>
              <Button size="sm" variant="outline" onClick={() => setIsConfirmingDelete(false)}>{t.cancel}</Button>
            </div>
          ) : (
            <Button size="sm" variant="destructive" onClick={() => setIsConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" />{t.delete}
            </Button>
          )}
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>{t.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/components/task-modal.jsx"
git commit -m "feat(kanban-miniapp): 迁移 task-modal(移除创建为 Issue)"
```

---

## Task 7: 迁移 column-modal.jsx + column-manage-dialog.jsx

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-modal.jsx`
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-manage-dialog.jsx`

- [ ] **Step 1: 写 column-modal.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-modal.jsx`：
```jsx
import { useState, useEffect } from 'react';
import { t } from '../utils/i18n.js';

const { Layout, Sparkles, Input, Label, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } = window.AgentSpacesUI;

const BG_COLORS = {
  sky: 'bg-sky-400', amber: 'bg-amber-400', emerald: 'bg-emerald-400', rose: 'bg-rose-400', purple: 'bg-purple-400', slate: 'bg-stone-400',
};

export default function ColumnModal({ isOpen, onClose, onCreate, onEdit, editingColumn }) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('sky');

  useEffect(() => {
    if (isOpen) {
      if (editingColumn) { setTitle(editingColumn.title); setColor(editingColumn.color); }
      else { setTitle(''); setColor('sky'); }
    }
  }, [isOpen, editingColumn]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (editingColumn && onEdit) onEdit(editingColumn.id, title.trim(), color);
    else onCreate(title.trim(), color);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {editingColumn ? t.editSection : t.newSection}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Layout className="h-3.5 w-3.5" />{t.sectionName}
            </Label>
            <Input type="text" required autoFocus placeholder={t.sectionNamePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={25} className="h-9 text-sm font-medium" />
          </div>
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />{t.theme}
            </Label>
            <div className="flex items-center gap-3 py-1">
              {['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'].map((opt) => (
                <button key={opt} type="button" onClick={() => setColor(opt)} className={`h-7 w-7 rounded-full ${BG_COLORS[opt]} hover:scale-115 active:scale-95 transition-all duration-150 cursor-pointer ${color === opt ? 'ring-2 ring-stone-800 dark:ring-neutral-100 ring-offset-2' : 'opacity-85 hover:opacity-100'}`} />
              ))}
            </div>
          </div>
        </form>
        <DialogFooter className="!-mx-0 !-mb-0 px-6 py-4 border-t flex-row justify-end sm:justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>{editingColumn ? t.save : t.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 写 column-manage-dialog.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-manage-dialog.jsx`：
```jsx
import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from '../utils/i18n.js';

const { GripVertical, Edit2, Trash2, Plus, Button, Dialog, DialogContent, DialogHeader, DialogTitle } = window.AgentSpacesUI;

const DOT_COLORS = {
  slate: 'bg-stone-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400', purple: 'bg-purple-400',
};

function SortableColumnItem({ column, onEdit, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: column.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-700 rounded-lg">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-stone-400 hover:text-stone-600 dark:hover:text-neutral-300 p-0.5">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className={`h-3 w-3 rounded-full shrink-0 ${DOT_COLORS[column.color] || 'bg-stone-400'}`} />
      <span className="flex-1 text-sm font-medium truncate">{column.title}</span>
      <button onClick={() => onEdit(column)} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-neutral-200 hover:bg-stone-100 dark:hover:bg-neutral-700 rounded-md transition cursor-pointer">
        <Edit2 className="h-3.5 w-3.5" />
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button onClick={() => { onDelete(column.id); setConfirmDelete(false); }} className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] rounded transition cursor-pointer">{t.confirm}</button>
          <button onClick={() => setConfirmDelete(false)} className="px-1 py-0.5 bg-white dark:bg-neutral-600 border border-stone-200 dark:border-neutral-500 text-stone-600 dark:text-neutral-300 text-[9px] rounded transition cursor-pointer">{t.no}</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)} className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md transition cursor-pointer">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function ColumnManageDialog({ isOpen, onClose, columns, onReorder, onEdit, onDelete, onAdd }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((c) => c.id === active.id);
    const newIndex = columns.findIndex((c) => c.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(arrayMove(columns, oldIndex, newIndex));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.manageSections}</DialogTitle>
        </DialogHeader>
        <div className="px-4 py-4 max-h-[400px] overflow-y-auto">
          {columns.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {columns.map((col) => <SortableColumnItem key={col.id} column={col} onEdit={onEdit} onDelete={onDelete} />)}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="text-sm text-stone-400 text-center py-8">{t.noSections}</p>
          )}
        </div>
        <div className="px-4 py-3 border-t">
          <Button size="sm" variant="outline" onClick={onAdd} className="w-full"><Plus className="h-3.5 w-3.5 mr-1.5" />{t.addSection}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-modal.jsx" "packages/server/agent-spaces-data/mini-apps/kanban/src/components/column-manage-dialog.jsx"
git commit -m "feat(kanban-miniapp): 迁移 column-modal 与 column-manage-dialog"
```

---

## Task 8: 迁移 kanban-board.jsx（整合 + DnD + 移除 CreateIssue）

**Files:**
- Create: `packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-board.jsx`
- Modify: `packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`

- [ ] **Step 1: 写 kanban-board.jsx**

`packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-board.jsx`：
```jsx
import { useState, useCallback, useMemo } from 'react';
import {
  DndContext, useSensor, useSensors, PointerSensor, TouchSensor, KeyboardSensor,
  DragOverlay, defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import KanbanColumnComponent from './kanban-column.jsx';
import KanbanCard from './kanban-card.jsx';
import TaskModal from './task-modal.jsx';
import ColumnModal from './column-modal.jsx';
import ColumnManageDialog from './column-manage-dialog.jsx';
import { useBoard, createBoardActions } from '../hooks/use-board.js';
import { genId } from '../utils/constants.js';
import { t } from '../utils/i18n.js';

const { Plus, LayoutGrid, Search, Layers, WandSparkles } = window.AgentSpacesUI;

export default function KanbanBoard() {
  const { board, loaded, update } = useBoard();
  const actions = useMemo(() => createBoardActions(board, update), [board, update]);

  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [activeDragTask, setActiveDragTask] = useState(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [isManageOpen, setIsManageOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columns = board.columns;
  const tasks = board.tasks;
  const layoutMode = board.layoutMode;

  const filteredTasks = useMemo(() => tasks.filter((tk) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || tk.title.toLowerCase().includes(q) || (tk.description || '').toLowerCase().includes(q);
    const matchesPriority = priorityFilter === 'all' || tk.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  }), [tasks, searchQuery, priorityFilter]);

  // --- Drag handlers (tasks only) ---
  const handleDragStart = useCallback(({ active }) => {
    const taskObj = tasks.find((tk) => tk.id === active.id);
    if (taskObj) setActiveDragTask(taskObj);
  }, [tasks]);

  const handleDragOver = useCallback(({ active, over }) => {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;
    if (columns.some((c) => c.id === activeId)) return;
    const activeTaskObj = tasks.find((tk) => tk.id === activeId);
    if (!activeTaskObj) return;
    const isOverAColumn = columns.some((c) => c.id === overId);
    const targetColumnId = isOverAColumn ? overId : tasks.find((tk) => tk.id === overId)?.columnId;
    if (targetColumnId && activeTaskObj.columnId !== targetColumnId) {
      actions.setTasks(tasks.map((tk) => (tk.id === activeId ? { ...tk, columnId: targetColumnId } : tk)));
    }
  }, [columns, tasks, actions]);

  const handleDragEnd = useCallback(({ active, over }) => {
    setActiveDragTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (columns.some((c) => c.id === activeId)) return;
    const activeTaskObj = tasks.find((tk) => tk.id === activeId);
    if (!activeTaskObj) return;
    const isOverAColumn = columns.some((c) => c.id === overId);
    const targetColumnId = isOverAColumn ? overId : tasks.find((tk) => tk.id === overId)?.columnId;
    if (!targetColumnId) return;
    const ai = tasks.findIndex((tk) => tk.id === activeId);
    const oi = tasks.findIndex((tk) => tk.id === overId);
    const updated = tasks.map((tk) => (tk.id === activeId ? { ...tk, columnId: targetColumnId } : tk));
    if (oi !== -1) actions.setTasks(arrayMove(updated, ai, oi));
    else actions.setTasks(updated);
  }, [columns, tasks, actions]);

  // --- Actions ---
  const handleAddTask = (columnId) => {
    const newTask = {
      id: genId('task'), title: '', description: '', priority: 'medium',
      columnId, order: tasks.filter((tk) => tk.columnId === columnId).length,
      createdAt: Date.now(),
    };
    setSelectedTask(newTask);
    setIsTaskModalOpen(true);
  };

  const handleApplyTemplate = () => {
    const template = [
      { title: 'Draft', color: 'slate' }, { title: 'Todo', color: 'sky' },
      { title: 'In Progress', color: 'amber' }, { title: 'Done', color: 'emerald' }, { title: 'Bug', color: 'rose' },
    ];
    const now = Date.now();
    const newCols = template.map((tp, i) => ({ id: genId('col'), title: tp.title, color: tp.color, order: columns.length + i }));
    update({ columns: [...columns, ...newCols] });
    void now;
  };

  if (!loaded) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.loading}</div>;

  const priorityLabels = { all: t.priorityAll, high: t.priorityHigh, medium: t.priorityMedium, low: t.priorityLow };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-stone-200 dark:border-neutral-700 px-4 py-2.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input type="text" placeholder={t.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-stone-50 dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-stone-500/10 transition" />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {['all', 'high', 'medium', 'low'].map((p) => (
            <button key={p} onClick={() => setPriorityFilter(p)} className={`px-2.5 py-1 text-[10px] rounded-full border transition font-medium cursor-pointer ${priorityFilter === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-white dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-300 hover:bg-stone-50 text-stone-600 border-stone-200'}`}>{priorityLabels[p]}</button>
          ))}
        </div>
        <button onClick={() => handleAddTask(columns[0]?.id || '')} disabled={columns.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50"><Plus className="h-3.5 w-3.5" />{t.newCard}</button>
        <button onClick={() => setIsManageOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-semibold text-stone-600 dark:text-neutral-300 shadow-xs transition cursor-pointer"><Layers className="h-3.5 w-3.5" />{t.section}</button>
        <button onClick={() => actions.updateLayout(layoutMode === 'horizontal' ? 'vertical' : 'horizontal')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 rounded-lg text-xs font-semibold text-stone-600 dark:text-neutral-300 shadow-xs transition cursor-pointer"><LayoutGrid className="h-3.5 w-3.5" />{layoutMode === 'horizontal' ? t.vertical : t.horizontal}</button>
      </div>

      <div className="flex-1 overflow-hidden p-4">
        {columns.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 border border-dashed border-stone-200 dark:border-neutral-600 rounded-3xl">
            <Layers className="h-10 w-10 text-stone-300 mb-3" />
            <p className="text-sm font-bold text-stone-500 dark:text-neutral-400">{t.noSections}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={handleApplyTemplate} className="px-4 py-2 bg-white dark:bg-neutral-800 border border-stone-200 dark:border-neutral-600 text-stone-600 dark:text-neutral-300 rounded-xl text-xs font-bold cursor-pointer hover:bg-stone-50 dark:hover:bg-neutral-700 transition"><WandSparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />{t.useTemplate}</button>
              <button onClick={() => setIsColumnModalOpen(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold cursor-pointer">{t.addSection}</button>
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className={`flex-1 h-full ${layoutMode === 'horizontal' ? 'flex flex-row overflow-x-auto items-start gap-4 pb-4' : 'flex flex-col gap-4 overflow-y-auto'}`}>
              <SortableContext items={columns.map((c) => c.id)} strategy={layoutMode === 'horizontal' ? horizontalListSortingStrategy : verticalListSortingStrategy}>
                {columns.map((col) => (
                  <KanbanColumnComponent
                    key={col.id} column={col} tasks={filteredTasks.filter((tk) => tk.columnId === col.id)}
                    layoutMode={layoutMode} onCardClick={(task) => { setSelectedTask(task); setIsTaskModalOpen(true); }}
                    onAddTask={handleAddTask}
                  />
                ))}
              </SortableContext>
              {layoutMode === 'horizontal' && (
                <button onClick={() => setIsColumnModalOpen(true)} className="w-[280px] shrink-0 h-[120px] rounded-2xl border-2 border-dashed border-stone-200 dark:border-neutral-600 hover:border-stone-400 dark:hover:border-neutral-400 text-stone-400 hover:text-stone-800 dark:hover:text-neutral-200 flex flex-col items-center justify-center gap-1.5 transition cursor-pointer">
                  <Plus className="h-5 w-5" /><span className="text-xs font-bold">{t.newSection}</span>
                </button>
              )}
            </div>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
              {activeDragTask ? <KanbanCard task={activeDragTask} onClick={() => {}} isOverlay /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <TaskModal task={selectedTask} columns={columns} isOpen={isTaskModalOpen} onClose={() => { setIsTaskModalOpen(false); setSelectedTask(null); }} onSave={actions.saveTask} onDelete={actions.deleteTask} />
      <ColumnModal isOpen={isColumnModalOpen} onClose={() => { setIsColumnModalOpen(false); setEditingColumn(null); }} onCreate={actions.addColumn} onEdit={actions.editColumn} editingColumn={editingColumn} />
      <ColumnManageDialog
        isOpen={isManageOpen}
        onClose={() => setIsManageOpen(false)}
        columns={columns}
        onReorder={actions.reorderColumns}
        onEdit={(col) => { setIsManageOpen(false); setEditingColumn(col); setIsColumnModalOpen(true); }}
        onDelete={actions.deleteColumn}
        onAdd={() => { setIsManageOpen(false); setIsColumnModalOpen(true); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: index.jsx 挂载 KanbanBoard**

`packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx`：
```jsx
import KanbanBoard from './components/kanban-board.jsx';

function App() {
  return <KanbanBoard />;
}

export default App;
```

- [ ] **Step 3: 验证完整看板功能**

打开 `http://localhost:3000/mini-apps-preview/kanban`：
1. 空态：显示「还没有分区」+「使用模板」+「添加分区」。
2. 点「使用模板」→ 出现 5 列（Draft/Todo/In Progress/Done/Bug）。
3. 列内「添加任务」→ 弹窗填标题/优先级 → 保存 → 卡片出现。
4. 点卡片 → 编辑 → 改优先级/截止日期 → 保存生效。
5. 拖拽卡片：列内换序、跨列拖动（columnId 改变）。
6. 工具栏：搜索过滤、优先级过滤、横向/纵向切换、管理分区（排序/编辑/删除）。
7. 删除列 → 该列下任务一并清除。

Expected: 全部通过。失败看 DevTools Console / Network（invokeService 报错）。

- [ ] **Step 4: 验证多端同步**

开两个浏览器标签都打开 `http://localhost:3000/mini-apps-preview/kanban`。在 A 标签添加一张卡片。
Expected: B 标签无需刷新即出现该卡片（`onConfigChanged` 广播生效）。

- [ ] **Step 5: Commit**

```bash
git add "packages/server/agent-spaces-data/mini-apps/kanban/src/components/kanban-board.jsx" "packages/server/agent-spaces-data/mini-apps/kanban/src/index.jsx"
git commit -m "feat(kanban-miniapp): 整合 kanban-board(DnD+工具栏，移除 CreateIssue)"
```

---

## Task 9: 删除旧 web kanban 组件 / store / i18n / 命令面板条目

**Files:**
- Delete: `packages/web/src/components/kanban/` (6 files)
- Delete: `packages/web/src/stores/kanban.ts`
- Delete: `packages/web/src/locales/en/kanban.json`
- Delete: `packages/web/src/locales/zh/kanban.json`
- Modify: `packages/web/src/components/layout/workspace-shell.tsx` (移除 kanban tab 引用)
- Modify: `packages/web/src/components/sidebar/tools-dialog.tsx` (移除 kanban 命令条目)

- [ ] **Step 1: 移除 workspace-shell.tsx 的 kanban tab 引用**

先定位：
```bash
cd packages/web && grep -n "kanban\|KanbanBoard" src/components/layout/workspace-shell.tsx
```
Expected 输出含三处：第 84 行 `const KanbanBoard = dynamic(...)`、第 501 与 622 行 `return <KanbanBoard workspaceId={workspaceId} />`，以及 tab 配置数组里的一项（形如 `{ id: 'kanban', ... }` 或类似）。

逐一处理：
- 删除 `const KanbanBoard = dynamic(() => import("@/components/kanban/kanban-board")...)` 整行（约第 84 行）。
- 删除两处 `return <KanbanBoard workspaceId={workspaceId} />`（约 501、622 行）所在的 tab 分支——把该分支改为返回 `null` 或并入相邻分支，使该 tab 不再渲染 kanban。若该 tab 仅服务于 kanban，连同 tab 注册项一并删除。
- 删除 tab 注册数组里的 kanban 项（含 label/icon 等）。

> 若不确定 tab 结构，先完整读 `workspace-shell.tsx` 中 `KanbanBoard` 出现的上下文（前后各 15 行）再决策，目标是：删除后 `grep -n kanban src/components/layout/workspace-shell.tsx` 无输出。

- [ ] **Step 2: 移除 tools-dialog.tsx 的 kanban 命令条目**

```bash
cd packages/web && grep -n "KanbanBoard\|kanban" src/components/sidebar/tools-dialog.tsx
```
删除第 56 行附近的条目：`keys: ['ListKanbanBoards', 'ViewKanbanBoard', 'CreateKanbanBoard', 'UpdateKanbanBoard', 'DeleteKanbanBoard'],` 所在的整个命令对象（含其 label/icon/handler）。删除后 `grep -n -i kanban src/components/sidebar/tools-dialog.tsx` 无输出。

- [ ] **Step 3: 删除旧组件、store、i18n 文件**

```bash
cd packages/web
rm -rf src/components/kanban
rm -f src/stores/kanban.ts
rm -f src/locales/en/kanban.json
rm -f src/locales/zh/kanban.json
```

- [ ] **Step 4: 验证 web 包无 kanban 残留引用**

```bash
cd packages/web && grep -rn "components/kanban\|stores/kanban\|useKanbanStore\|locales.*kanban" src
```
Expected: 无输出（或仅注释）。若有残留，按报错位置修复。

- [ ] **Step 5: web 包 build 通过**

```bash
cd packages/web && pnpm lint
```
Expected: 无 kanban 相关报错。

- [ ] **Step 6: Commit**

```bash
git add -A packages/web
git commit -m "refactor(web): 删除旧 kanban 组件/store/i18n/命令面板条目与 workspace tab"
```

---

## Task 10: 删除旧 sdk / server kanban / shared 类型

**Files:**
- Delete: `packages/sdk/src/modules/kanban.ts`
- Modify: `packages/sdk/src/index.ts`（或 lib/sdk.ts）的 kanban 注册
- Delete: `packages/server/src/routes/kanban.ts`
- Delete: `packages/server/src/services/kanban.ts`
- Delete: `packages/server/src/storage/kanban-store.ts`
- Delete: `packages/server/src/services/builtin-tools/kanban-tools.ts`
- Modify: `packages/server/src/services/builtin-tools/index.ts`（移除 kanban 工具注册）
- Modify: `packages/server/src/app.ts`（移除 kanban 路由挂载）
- Delete: `packages/shared/src/types/kanban.ts`
- Modify: `packages/shared/src/types/index.ts`（移除 kanban 聚合导出）

- [ ] **Step 1: 定位 sdk kanban 注册处并移除**

```bash
cd packages/sdk && grep -rn "kanban" src/index.ts src/lib/sdk.ts 2>/dev/null; grep -rln "createKanbanApi\|modules/kanban" src
```
删除注册行（形如 `kanban: createKanbanApi(http)` 或 `import { createKanbanApi } from './modules/kanban'`），删除文件 `src/modules/kanban.ts`。

- [ ] **Step 2: 定位 server kanban 路由挂载并移除**

```bash
cd packages/server && grep -rn "kanban" src/app.ts
```
删除形如 `app.use('/api/workspaces/:workspaceId/kanban', kanbanRouter)` 及其 import。再：
```bash
rm -f src/routes/kanban.ts src/services/kanban.ts src/storage/kanban-store.ts
```

- [ ] **Step 3: 定位并移除 builtin-tools kanban 注册**

```bash
cd packages/server && grep -rn "kanban-tools\|kanbanTools\|ListKanbanBoards" src/services/builtin-tools/index.ts src/services/builtin-tools/*.ts
```
- 在 builtin-tools 的聚合文件（`index.ts` 或注册 BUILT_IN_AGENT_TOOLS 处）移除 5 个 kanban 工具的注册与 import。
- `rm -f src/services/builtin-tools/kanban-tools.ts`

- [ ] **Step 4: 删除 shared 类型并移除聚合导出**

```bash
cd packages/shared && grep -n "kanban" src/types/index.ts
```
删除第 28 行 `export * from './kanban.js';`，再 `rm -f src/types/kanban.ts`。

- [ ] **Step 5: 全仓确认无 kanban 残留引用**

```bash
grep -rn "KanbanBoard\|kanban-store\|kanban-tools\|createKanbanApi\|@agent-spaces/shared.*Kanban\|kanban\.updated\|kanban\.deleted" packages/sdk/src packages/server/src packages/shared/src packages/web/src
```
Expected: 无输出。残留按报错修复（注意：mini-app 实例目录 `agent-spaces-data/mini-apps/kanban` 不算残留，是产物）。

- [ ] **Step 6: 全量 build 通过**

```bash
pnpm build
```
Expected: shared → sdk → server → web 全部编译通过，无 kanban 相关报错。

- [ ] **Step 7: Commit**

```bash
git add -A packages/sdk packages/server packages/shared
git commit -m "refactor: 删除旧 kanban sdk/server/storage/builtin-tools/shared 类型"
```

---

## Task 11: 打包 kanban.zip 模板并注册

**Files:**
- Create: `packages/templates/mini-app/kanban.zip`
- Modify: `packages/templates/mini-app/index.json`

- [ ] **Step 1: 打包实例为 kanban.zip**

zip 顶层结构需与 mini-app project 一致（`manifest.json`、`configs/`、`src/`，**不要**多套一层 `kanban/` 目录）：
```bash
cd packages/server/agent-spaces-data/mini-apps/kanban
# 确认目录内容为 manifest.json configs/ src/
# 打包（在 kanban 目录内执行，避免多套一层目录）
# Windows PowerShell: Compress-Archive -Path manifest.json,configs,src -DestinationPath ../../../../templates/mini-app/kanban.zip -Force
```
PowerShell 等价命令（在仓库根执行）：
```powershell
Compress-Archive -Path "packages\server\agent-spaces-data\mini-apps\kanban\manifest.json","packages\server\agent-spaces-data\mini-apps\kanban\configs","packages\server\agent-spaces-data\mini-apps\kanban\src" -DestinationPath "packages\templates\mini-app\kanban.zip" -Force
```

- [ ] **Step 2: 注册到 templates/mini-app/index.json**

读取 `packages/templates/mini-app/index.json`，照现有条目格式（参考 tts/copywriting 条目）追加 kanban：
```json
{ "id": "kanban", "name": "看板", "file": "kanban.zip", "description": "看板（分区+卡片+拖拽，多端同步）", "icon": "📋" }
```
（字段名以 index.json 现有 schema 为准——先读再对齐字段。）

- [ ] **Step 3: 验证 zip 可被导入（可选冒烟）**

在 mini-app 列表页用「从模板创建」选 kanban，创建一个新 project，打开预览。
Expected: 新 project 渲染出 kanban 空态（「还没有分区」）。若导入后 mainFile 解析失败（渲染空白），多半是 zip 多套了一层目录——重新打包确保顶层即 `manifest.json`。

- [ ] **Step 4: Commit**

```bash
git add packages/templates/mini-app/kanban.zip packages/templates/mini-app/index.json
git commit -m "feat(templates): 添加 kanban mini-app 模板并注册"
```

---

## Task 12: 最终验收

- [ ] **Step 1: 全量构建**

```bash
pnpm build
```
Expected: 全部通过。

- [ ] **Step 2: 全仓残留扫描**

```bash
grep -rn "useKanbanStore\|createKanbanApi\|kanban-store\|kanban-tools\|/api/workspaces/.*kanban\|kanban\.updated\|kanban\.deleted" packages --include="*.ts" --include="*.tsx"
```
Expected: 无输出。

- [ ] **Step 3: 端到端功能验收**

`pnpm dev` 后打开 `http://localhost:3000/mini-apps-preview/kanban`：
1. 空态 → 使用模板 → 5 列。
2. 增删改任务、改优先级/截止日期、删除任务。
3. 拖拽（列内 + 跨列）。
4. 横向/纵向布局切换、列管理（排序/编辑/删除带级联清任务）。
5. 搜索 + 优先级过滤。
6. 双标签同步：A 改动 → B 实时刷新。
7. 刷新页面 → 状态恢复（configSnapshot）。

Expected: 全部通过。

- [ ] **Step 4: 标记完成**

确认 spec 验收标准（`docs/superpowers/specs/2026-06-18-kanban-to-miniapp-design.md` §9）全部满足。提交收尾（如有未提交改动）：
```bash
git add -A && git commit -m "chore(kanban-miniapp): 第一阶段迁移收尾" --allow-empty
```

---

## Self-Review 结果

**Spec 覆盖**：§3 产物结构→Task 1/2/3/4/5/6/7/8；§4 数据流→Task 2(service)+Task 3(hook)；§5 产物结构→Task 1-8+Task 11；§6 board.json→Task 1 Step 2；§7 service handler→Task 2 Step 2（4 个 handler 齐全）；§8 删除清单→Task 9/10；§9 验收→Task 12。全覆盖。

**相对 spec 的偏差（已在「适配说明」注明）**：移除「创建为 Issue」功能（host 依赖）；workspace tab 移除（旧组件被删的必然结果，非新增嵌入）。

**Placeholder 扫描**：无 TBD/TODO；删除类任务给出 grep 定位 + 删除指令 + 验证命令（删除无需代码块）；所有新建文件含完整代码。

**类型一致性**：`useBoard` 返回 `{ board, loaded, update }`；`createBoardActions(board, update)` 返回 `{ updateLayout, addColumn, editColumn, deleteColumn, reorderColumns, setTasks, saveTask, deleteTask }`——board.jsx 调用名全部对齐。service handler 名 `update_title/update_layout/update_columns/update_tasks` 与 hook 内 `AS_invoke` 调用名一致。`genId` 来自 `utils/constants.js`，board.jsx 与 hook 均正确 import。

**风险点**：Task 11 的 zip 打包路径/层级（Step 3 给了冒烟验证）；Task 9/10 删除定位（每个 grep 命令可直接执行得到行号）。
