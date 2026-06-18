# Kanban 迁移到 Mini-app 子系统 — 设计文档

- **日期**：2026-06-18
- **状态**：待评审
- **范围**：第一阶段（功能分离为独立 mini-app）；workspace 集成推迟到第二阶段
- **参考**：`docs/mini-app-renderer.md`

## 1. 背景与现状

当前 Kanban 是一套完整的 **REST + Zustand + SDK + Server** 实现，散落在 4 个包：

| 层 | 文件 |
|----|------|
| 前端组件 | `packages/web/src/components/kanban/`（6 个 tsx：board / column / card / task-modal / column-modal / column-manage-dialog） |
| 前端状态 | `packages/web/src/stores/kanban.ts`（Zustand，`load/save/updateColumns/updateTasks/attachWS`） |
| 前端 SDK | `packages/sdk/src/modules/kanban.ts`（`get/save` → REST `/api/workspaces/:id/kanban`） |
| 后端路由 | `packages/server/src/routes/kanban.ts` |
| 后端服务 | `packages/server/src/services/kanban.ts` |
| 后端存储 | `packages/server/src/storage/kanban-store.ts`（JSON/文件） |
| Agent 工具 | `packages/server/src/services/builtin-tools/kanban-tools.ts`（List/View/Create/Update/Delete Board） |
| 共享类型 | `packages/shared/src/types/kanban.ts` |
| i18n | `packages/web/src/locales/{en,zh}/kanban.json` |
| 命令面板 | `packages/web/src/components/sidebar/tools-dialog.tsx`（kanban 工具条目） |

**当前数据流**：UI → `useKanbanStore` → `sdk.kanban.get/save`(REST) → server service → storage；多端同步靠 WS 事件 `kanban.updated` / `kanban.deleted`。

**数据模型**（`KanbanBoard`，绑定 `workspaceId`，一 workspace 一 board）：`columns[]`（id/title/color/order）+ `tasks[]`（id/title/description/priority/columnId/order/createdAt/dueDate）+ `layoutMode`。

**入口**：`packages/web/src/components/layout/workspace-shell.tsx` 两处动态 `import('@/components/kanban/kanban-board')`，作为工作空间内的一个 tab。

## 2. 目标与非目标

### 目标（第一阶段）
1. 将 kanban 功能从「web 组件 + REST 后端」**分离为自包含的 mini-app**（UI 源码 + service 写入方 + config 存储）。
2. 通讯方式从 REST + WS `kanban.updated` 迁移为 **mini-app 的 `invokeService` + `getConfig/onConfigChanged`**（由 mini-app 宿主层提供 WS 多端同步）。
3. 删除全部旧 kanban 后端代码，无残留引用。
4. 产出 1 个可直接预览验证的 mini-app 实例（`projectId = kanban`）。

### 非目标（推迟到第二阶段）
- workspace tab 入口改造（tab → 「打开 Kanban」按钮）。
- per-workspace 自动实例化（`kanban-<workspaceId>`）与 `ensureKanbanProject`。
- 新增 `POST /api/mini-apps/from-template` 便捷接口。
- 模板 zip 的 per-workspace 实例化流程。

## 3. 决策摘要

| 维度 | 决策 | 备注 |
|------|------|------|
| 数据隔离（第一阶段） | 单实例 `projectId = kanban` | per-workspace 推迟 |
| 入口 | mini-app 列表/编辑器/预览页（`/mini-apps-preview/kanban`） | workspace 集成推迟 |
| 旧后端 | **全删**，不迁移历史数据 | 现有 board 数据丢弃，全新开始 |
| 数据存储 | config JSON（`configs/board.json`） | `updateConfig` + `getConfig/onConfigChanged` |
| 源码组织 | 集中模板 + 运行实例 | 见 §5 |

## 4. 架构与数据流

```
[ Kanban JSX (Babel 沙箱 @agent-spaces/ui + @dnd-kit) ]
   │ getConfig('board.json')          ← 读：内存缓存（configSnapshot 建立）
   │ onConfigChanged(setBoard)        ← 订阅：WS 自动同步
   ▼
[ invokeService('update_columns', {columns}) ]
   ▼  RPC → POST /api/mini-apps/:id/services/invoke  body { name, payload }
[ src/services/board.js handler（服务端 Node，唯一写入方）]
   │ ctx.updateConfig('board.json', prev => ({ ...prev, columns }))
   ▼
服务端单线程原子读-改-写 → 广播 miniApp.configChanged { path, value }
   ▼  WS 频道（projectId = kanban）
所有客户端 onConfigChanged → 看板自动刷新
```

**取代**：旧 `sdk.kanban.get/save` + `useKanbanStore` + REST + WS `kanban.updated`。多端同步由 mini-app 宿主层天然提供；项目代码不直连 WS（遵循 `docs/mini-app-renderer.md` 约定）。

### 关键设计点
- **单一写入方**：所有 board 变更经 `src/services/board.js` 的 `ctx.updateConfig`（原子读改写），杜绝多客户端并发覆盖。
- **乐观更新**：前端拖拽先改本地 React state，再 `invokeService` 落盘广播；`onConfigChanged` 作为权威来源回填。
- **不直连 WS**：项目代码只用 `onConfigChanged` / `onTaskEvent`，不调用 `getWS`。

## 5. 产物结构

### 5.1 运行实例（第一阶段验证用，对应原始命令路径）

```
packages/server/agent-spaces-data/mini-apps/kanban/   ← projectId = kanban
  manifest.json              # { name:"Kanban", mainFile:"src/index.jsx", type:"react", ... }
  configs/
    board.json               # 初始空 board（见 §6）
  src/
    index.jsx                # 入口：组合 board，注入 useBoard hook
    components/
      kanban-board.jsx       # 看板视图（horizontal/vertical）+ DndContext
      kanban-column.jsx      # 列容器 + SortableContext
      kanban-card.jsx        # 卡片 + useSortable
      task-modal.jsx         # 新建/编辑任务弹窗
      column-modal.jsx       # 新建/编辑列弹窗
      column-manage-dialog.jsx
    hooks/
      use-board.js           # 封装 getConfig/onConfigChanged + invokeService
    services/
      board.js               # 服务端唯一写入方（见 §7）
    utils/
      constants.js           # priority 颜色、layout 常量、id 生成
```

组件职责 **1:1 对应** 原 web 的 6 个 tsx（功能不增不减）。UI 走 `@agent-spaces/ui` / `window.AgentSpacesUI`，拖拽走已映射的 `@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`。

### 5.2 模板（源码集中维护，供第二阶段实例化）

`packages/templates/mini-app/kanban.zip`（zip 内容同 §5.1 的 `src/` + `manifest.json` + `configs/board.json`），并在 `packages/templates/mini-app/index.json` 注册。第一阶段不依赖它运行，仅作为源码集中处与第二阶段实例化的输入。

> 模板 zip 为二进制，不便 diff；维护流程约定为「编辑源码目录 → 本地打包 zip → 覆盖」，与现有 `copywriting.zip` / `tts.zip` 一致。

## 6. 数据契约 `configs/board.json`

保留现有 `KanbanBoard` 结构，去掉宿主字段（实例已绑定单一 project，无需 `workspaceId`）：

```json
{
  "title": "Kanban",
  "layoutMode": "horizontal",
  "columns": [
    { "id": "col_todo", "title": "待办", "color": "#6b7280", "order": 0 }
  ],
  "tasks": [
    {
      "id": "task_001",
      "title": "示例任务",
      "description": "",
      "priority": "medium",
      "columnId": "col_todo",
      "order": 0,
      "createdAt": 1716000000000,
      "dueDate": null
    }
  ]
}
```

字段语义与原 `KanbanTask` / `KanbanColumn` 完全一致；`createdAt` 为 Unix 毫秒，`dueDate` 为 ISO 字符串或 `null`，`priority` ∈ `low | medium | high`，`layoutMode` ∈ `horizontal | vertical`。

> 上述 JSON 仅用于展示字段结构。**初始实例** `board.json` 为空 board：
> ```json
> { "title": "Kanban", "layoutMode": "horizontal", "columns": [], "tasks": [] }
> ```
> 前端 `use-board.js` 检测到 `columns.length === 0` 时展示引导态（如「新建第一列」按钮），不预置任何示例数据。

## 7. 通讯方式：service handler 清单（`src/services/board.js`）

| handler | payload | 行为（`ctx.updateConfig('board.json', prev => next)`） |
|---------|---------|--------------------------------------------------------|
| `update_title` | `{ title: string }` | `{ ...prev, title }` |
| `update_layout` | `{ layoutMode: 'horizontal' \| 'vertical' }` | `{ ...prev, layoutMode }` |
| `update_columns` | `{ columns: KanbanColumn[] }` | `{ ...prev, columns }`（增删改列、列排序） |
| `update_tasks` | `{ tasks: KanbanTask[] }` | `{ ...prev, tasks }`（增删改任务、跨列拖拽、卡排序） |

- handler 不 `import` 外部模块（加载时剥离 import 行），能力通过 `ctx` 注入。
- 每次 `updateConfig` 自动广播 `miniApp.configChanged`，所有客户端 `onConfigChanged` 同步。
- 前端封装在 `hooks/use-board.js`：`getConfig('board.json')` 初始化 + `onConfigChanged` 订阅 + 暴露 `updateTitle/updateLayout/updateColumns/updateTasks` 调 `invokeService`。

## 8. 删除清单（全删不迁移）

```
packages/web/src/components/kanban/                          # 6 文件全删
packages/web/src/stores/kanban.ts
packages/sdk/src/modules/kanban.ts                           # + SDK 中 kanban 模块的注册处（`createSDK` 聚合，删除 kanban 字段）
packages/server/src/routes/kanban.ts                         # + app.ts 路由挂载
packages/server/src/services/kanban.ts
packages/server/src/storage/kanban-store.ts
packages/server/src/services/builtin-tools/kanban-tools.ts   # + BUILT_IN_AGENT_TOOLS 注册的 5 个 kanban 工具
packages/shared/src/types/kanban.ts                          # + packages/shared/src/types/index.ts 的 export
packages/web/src/components/sidebar/tools-dialog.tsx         # 移除 kanban 命令面板条目（List/View/Create/Update/Delete KanbanBoard）
packages/web/src/locales/en/kanban.json
packages/web/src/locales/zh/kanban.json
```

**删除前确认无残留依赖**：
- `shared/types/kanban` 当前仅被 store / sdk / server-builtin-tools 引用，均在删除清单内。
- `BUILT_IN_AGENT_TOOLS` 注册处同步移除 `ListKanbanBoards` / `ViewKanbanBoard` / `CreateKanbanBoard` / `UpdateKanbanBoard` / `DeleteKanbanBoard`。
- 全局搜索 `kanban`（小写）确认无其他 import 残留后删除。

## 9. 验收标准

1. mini-app 列表能看到 `kanban`，预览页（`/mini-apps-preview/kanban`）渲染完整看板（horizontal/vertical 布局、列、卡片）。
2. 新建/编辑/删除列与卡片、拖拽排序（列内 + 跨列）、改 priority/dueDate 均正常落盘。
3. **多标签同步**：同一 `kanban` 实例开两个预览标签 → 一端改动，另一端实时同步（验证 `configChanged` WS 链路）。
4. 刷新预览页后状态正确恢复（`configSnapshot` 建立缓存）。
5. 旧 kanban 后端全部删除，`pnpm lint` 与 `pnpm build`（shared → sdk → server → web）通过，无残留 `kanban` 引用报错。

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 删除 `shared/types/kanban` 后有隐藏依赖 | 删除前全局 `grep kanban` 复核；mini-app 内为 JSX，不依赖 shared 类型 |
| `board.json` 全量重写，任务量大时性能下降 | 看板场景数据量可控，可接受；第二阶段若需可迁 SQLite（`db()` 句柄 + service 手动 broadcast） |
| service handler 不能 import 外部模块 | 校验/常量内联在 handler 或 `utils/`（运行于前端），handler 仅用 `ctx` |
| 模板 zip 维护成本 | 第一阶段验证不依赖 zip；zip 打包流程与现有模板一致 |
| dnd-kit 动态增删 slide 需 reInit（doc 已提示） | 列/卡片增删后注意 SortableContext 重建时机 |

## 11. 第二阶段（后续，本次不做）

- workspace-shell 原 kanban tab → 「打开 Kanban」入口按钮，点击 `ensureKanbanProject(workspaceId)`：`get('kanban-<ws>')` 不存在则创建 + 初始化，跳转 `/mini-apps-preview/kanban-<ws>`。
- 新增 `POST /api/mini-apps/from-template`：封装「createProject + 导入 kanban.zip + 初始化 board.json」，支持 per-workspace 幂等实例化。
- 并发首开由 `assertNameUnique` + `existsSync` 双重校验防重复，失败方 fallback `get`。

## 12. 相关代码（mini-app 宿主层，复用不改）

| 文件 | 作用 |
|------|------|
| `packages/web/src/components/mini-apps/mini-app-renderer.tsx` | Babel 编译 + 本地模块解析 + `onConfigChanged` 分发 |
| `packages/web/src/components/mini-apps/mini-app-preview.tsx` | 预览容器，桥接 `miniApp.*` WS 事件 |
| `packages/web/src/components/mini-apps/use-mini-app-host-api.ts` | 注入 `getConfig/onConfigChanged/invokeService/callPluginTool/db` |
| `packages/server/src/services/mini-app-services.ts` | service 编译、`invokeService`、`ctx` 注入、configs 读写广播 |
| `packages/server/src/storage/mini-app-store.ts` | project CRUD、`safeNameId`、`createProject(files)` |
