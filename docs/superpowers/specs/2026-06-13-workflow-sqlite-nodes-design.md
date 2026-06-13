# 工作流 SQLite 数据库节点 — 设计

- **日期**：2026-06-13
- **范围**：为工作流编辑器新增「SQL 数据库」资源子系统与 5 个内置节点（SQL 自定义 / 查询 / 新增 / 更新 / 删除），含数据库管理对话框与数据浏览卡
- **状态**：已确认，待实现

## 1. 背景与目标

当前工作流节点（`packages/web/src/lib/workflow-nodes/definitions/`）覆盖流程控制、AI、展示、交互，但缺少**结构化数据存取**能力。服务器已有一套成熟的通用 SQL 执行层 [mini-app-db.ts](packages/server/src/storage/mini-app-db.ts)（better-sqlite3，带 `checkSql`/`validateDbName`/`MAX_ROWS` 安全校验、WAL、连接池），但它是 **per-project（mini-app 沙箱专用）**，无法被工作流复用。现有 [database-store.ts](packages/server/src/storage/database-store.ts) 是「文档数据库」（Notion 风格 + 向量搜索），**语义不符**，不复用。

本次新增**工作空间级 SQL 数据库资源**（可多对多关联工作流、按工作流过滤），并暴露为 5 个工作流节点。节点通过新的 `'sqlite'` 属性字段选择数据库；列表对话框支持 CRUD 与数据浏览；浏览卡用通用 `ResultTable` 展示任意查询结果。

**核心约束**：所有用户 SQL 经 `checkSql`（禁 ATTACH/DETACH），表名/列名经白名单校验，参数用 `?` 绑定（防注入），结果行数受 `MAX_ROWS=10000` 限制。

## 2. 关键决策

| 决策点 | 选择 |
|--------|------|
| 数据库归属 | 工作空间级全局资源，多对多关联工作流（`workflowIds[]`） |
| 列表过滤语义 | 「全部 / 当前工作流 / 未关联」三态，默认当前工作流 |
| 后端组织 | 方案 A：新建独立 `sqlite-store` + `routes/sqlite`，抽 `sql-safety` 共享模块供 mini-app-db 复用 |
| 数据库文件命名 | 用 `id`（uuid）作文件名 `~/.agent-spaces-data/sqlite/{id}.sqlite`，避免重命名/非法字符问题 |
| 元信息存储 | JSON 文件 `~/.agent-spaces-data/sqlite/databases.json`（与项目 JSON+SQLite 混合持久化一致） |
| 专用节点形态 | 4 个节点用结构化表单，**执行器**生成参数化 SQL；SQL 自定义节点写原生 SQL |
| 参数化方式 | `?` 占位符 + 节点「输入字段」(allowInputFields) 绑定上游变量 |
| 浏览卡能力 | 选表只读浏览（分页）+ 执行任意 SQL（含建表 DDL） |
| 表/列字段填写 | 动态下拉：扩展 `NodeProperty.dynamicOptions`，options 按已选 database 从后端拉取 |
| 通用表格 | 新建 `ResultTable`（动态列），不改造现有固定结构的 sortable-table |

## 3. 数据模型

### 3.1 新增 `packages/shared/src/types/sqlite.ts`

```ts
export interface SqliteDatabaseMeta {
  id: string;
  name: string;
  description: string;
  workflowIds: string[];      // 关联的工作流（多对多）
  createdAt: number;          // Unix ms
  updatedAt: number;
}

export interface SqliteTableInfo {
  name: string;
  rowCount: number;
}

export interface SqliteColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  pk: boolean;
  defaultValue: string | null;
}

export interface SqliteQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated?: boolean;        // 是否触达 MAX_ROWS 截断
}

export interface SqliteExecResult {
  changes: number;
  lastInsertRowid: number | null;
}
```

在 `packages/shared/src/types/index.ts` 聚合导出 `./sqlite.js`。

### 3.2 扩展 `NodeProperty`（`packages/shared/src/types/workflow.ts:196`）

- `type` 联合增加 `'sqlite'`。
- 新增可选字段 `dynamicOptions`，用于让 `select` 字段的 options 依赖同节点其它字段值动态加载：

```ts
export interface NodePropertyDynamicOptions {
  source: 'sqlite-tables' | 'sqlite-columns';
  dependsOn: string;          // 依赖属性 key（database 字段的 key，值为 dbId）
  dependsOnTableKey?: string; // source='sqlite-columns' 时，表名字段 key
  allOption?: boolean;        // columns 是否带「*（全部）」选项（查询节点用）
  placeholder?: string;       // 依赖未满足时的占位提示 i18n key
}

// NodeProperty 增加：
dynamicOptions?: NodePropertyDynamicOptions;
```

`'sqlite'` 类型字段的值即选中的 `databaseId`（string）。

## 4. 后端

### 4.1 抽取共享安全模块 `packages/server/src/storage/sql-safety.ts`（新）

把 [mini-app-db.ts](packages/server/src/storage/mini-app-db.ts) 的纯函数原样迁出：`DB_NAME_RE`、`MAX_ROWS`、`validateDbName`、`checkSql`、`bindArgs`、`SqlParams`、`BLOCKED_RE`。`mini-app-db.ts` 改为 `import { ... } from './sql-safety.js'`，删除本地副本（行为不变，消除重复）。

新增标识符白名单校验（供专用节点生成的 SQL 防注入）：

```ts
export const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function validateIdentifier(name: string, kind: 'table' | 'column'): void {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Invalid ${kind} name: ${name}`);
  }
}
```

### 4.2 `packages/server/src/storage/sqlite-store.ts`（新）

- 元信息：`databases.json`（`SqliteDatabaseMeta[]`），读写经内存缓存 + 防抖落盘（参考现有 JSON store 模式）。
- 数据库文件：`{dataDir}/sqlite/{id}.sqlite`；连接池 `Map<dbId, Database>`，`journal_mode=WAL`、`busy_timeout=5000`。
- 方法：
  - `listDatabases(workflowId?: string): SqliteDatabaseMeta[]` — `workflowId` 非空时过滤 `workflowIds` 包含它；为空返回全部。
  - `getDatabase(id)` / `createDatabase({name,description,workflowIds})` / `updateDatabase(id, updates)` / `deleteDatabase(id)`（先 `db.close()` 再 `unlink` 文件 + 删元信息）。
  - `setWorkflowAssociations(id, workflowIds[])` — 整体覆盖关联（`updateDatabase` 内部也支持）。
  - `listTables(id): SqliteTableInfo[]` — 查 `sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`，逐表 `SELECT COUNT(*)`。
  - `describeTable(id, table): SqliteColumnInfo[]` — `validateIdentifier(table)` 后 `PRAGMA table_info(table)`。
  - `query(id, sql, params?): SqliteQueryResult` — `checkSql(sql)`；`stmt.all(...bindArgs(params))`；列名取 `stmt.columns()?.map(c=>c.name)` 或首行 keys；超 `MAX_ROWS` 置 `truncated=true`。
  - `exec(id, sql, params?): SqliteExecResult` — `checkSql`；`stmt.run(...)` 返回 `{changes, lastInsertRowid}`。
  - `execTransaction(id, statements)` — 复用 better-sqlite3 事务。
- `name` 仍经 `validateDbName`（虽然文件名用 id，name 作展示与 slug 候选需规整）；`id` 由 store 生成（uuid）。

### 4.3 `packages/server/src/routes/sqlite.ts`（新）

挂载到 `/api/sqlite`（在 `app.ts` 注册，Bearer Token 鉴权，zod 校验 body）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/databases?workflowId=` | 列表（可按工作流过滤） |
| POST | `/databases` | 创建 `{name,description,workflowIds}` |
| PATCH | `/databases/:id` | 更新（含 `workflowIds` 关联） |
| DELETE | `/databases/:id` | 删除 |
| GET | `/databases/:id/tables` | 表列表 |
| GET | `/databases/:id/tables/:table/columns` | 表结构 |
| POST | `/databases/:id/query` | `{sql, params}` → `SqliteQueryResult` |
| POST | `/databases/:id/exec` | `{sql, params}` → `SqliteExecResult` |

`:table` 路径段经 `validateIdentifier` 校验，非法返回 400。

### 4.4 SDK `packages/sdk/src/sqlite.ts`（新）+ 注册

新增适配器模块，方法与上述 REST 一一对应；在 `packages/sdk/src/index.ts`（或 sdk 单例聚合处）注册为 `sdk.sqlite.*`。web 经 `@agent-spaces/sdk` 调用。

## 5. 工作流节点定义

新增 `packages/web/src/lib/workflow-nodes/definitions/sqlite.ts`，导出 `sqliteNodes: NodeTypeDefinition[]`；在 `definitions/index.ts` 与 `registry.ts`（`allNodeDefinitions`）聚合。`category = 'nodes.categories.sqlite'`（新分类「数据库」，`icon='Database'`）。

公共属性：每个节点都有 `database`（type `'sqlite'`，必填）。

| type | label | 关键 properties | outputs |
|------|-------|-----------------|---------|
| `sqlite_query` | 查询数据 | `database`(sqlite) / `table`(select, dynamicOptions=sqlite-tables) / `columns`(select, dynamicOptions=sqlite-columns 依赖 table, allOption) / `where`(textarea) / `orderBy`(text) / `limit`(number, default 1000) | `rows`(object[]) / `rowCount`(number) |
| `sqlite_insert` | 新增数据 | `database` / `table`(select, dynamic) / `fields`(array: {column(select,dynamic), value(text 变量)}) | `insertedId`(number) / `changes`(number) |
| `sqlite_update` | 更新数据 | `database` / `table`(select, dynamic) / `setFields`(array: {column(select,dynamic), value(text 变量)}) / `where`(textarea) | `changes`(number) |
| `sqlite_delete` | 删除数据 | `database` / `table`(select, dynamic) / `where`(textarea) | `changes`(number) |
| `sqlite_raw` | SQL 自定义 | `database`(sqlite) / `sql`(textarea) / `mode`(select: query/exec, default query) | `rows`(object[]) / `execResult`(object) |

- `where` / `setFields[].value` / `fields[].value` 的**值**用 `?` 占位，从节点「输入字段」按出现顺序绑定上游变量；列名/表名经 `validateIdentifier` 白名单。
- 4 个专用节点的 SQL 由执行器拼装（见 §6），节点定义只声明表单。
- `sqlite_raw`：用户写完整 SQL，`?` 参数同样从输入字段绑定。

## 6. 执行集成

### 6.1 后端执行器 `packages/server/src/services/execution-manager.ts`

在 `executeNode` 的 `switch(node.type)`（约 600 行，`case 'table_display'` 同级）增加 5 个分支，各调一个新私有方法，签名沿用 `(session, node, resolvedData)`：

```ts
case 'sqlite_query':  return this.executeSqliteQuery(session, node, resolvedData);
case 'sqlite_insert': return this.executeSqliteInsert(session, node, resolvedData);
case 'sqlite_update': return this.executeSqliteUpdate(session, node, resolvedData);
case 'sqlite_delete': return this.executeSqliteDelete(session, node, resolvedData);
case 'sqlite_raw':    return this.executeSqliteRaw(session, node, resolvedData);
```

各方法逻辑：

- **executeSqliteQuery**：读 `database`(dbId)、`table`、`columns`、`where`、`orderBy`、`limit`。校验 `table`/各 `column` 经 `validateIdentifier`；拼 `SELECT <cols|*> FROM "<table>" [WHERE <where>] [ORDER BY <orderBy>] LIMIT ?`（`where`/`orderBy` 为用户文本，作为「受信任模板片段」直接拼接——**仅限执行器内部、且表/列已白名单**；值用 `?`）；`limit` 作参数；调 `sqliteStore.query(dbId, sql, params)` → 返回 `{rows, rowCount}`。
- **executeSqliteInsert**：`table` + `fields[]`（column+value）。拼 `INSERT INTO "<table>" (c1,c2) VALUES (?,?)`，value 作参数。
- **executeSqliteUpdate**：`table` + `setFields[]` + `where`。拼 `UPDATE "<table>" SET c1=?,c2=? WHERE <where>`。
- **executeSqliteDelete**：`table` + `where`。拼 `DELETE FROM "<table>" WHERE <where>`。
- **executeSqliteRaw**：`database` + `sql` + `mode`。直接调 `sqliteStore.query/exec(dbId, sql, params)`（仍经 `checkSql`）。

`params` 来源：节点「输入字段」`inputFields`（`resolvedData.inputFields`，已含上游变量解析），按 `?` 出现顺序取值；参考现有 `buildOutputObject(resolvedData.inputFields)` 模式。

**安全说明**：`where` 是自由文本字段。因表名/列名已白名单、值已参数化，`where` 模板由用户在工作流设计期填写（非运行期外部输入），风险可控；若未来要开放运行期 where 拼接，需改为条件构建器。本设计在节点 tooltip 注明「where 中值请用 ? 占位」。

### 6.2 前端调试执行器（无需改动）

前端调试执行器 [use-workflow-editor-execution.ts](packages/web/src/components/workflow/use-workflow-editor-execution.ts) 通过 `executionLogApi`（REST）发起执行 + `getWS()`（WebSocket）接收执行事件，**不在前端本地模拟节点执行**。因此 5 个新节点的执行完全由后端 `execution-manager` 承担，后端支持后前端调试（单节点 debug、整流程运行、断点）自然生效，**前端无需为新节点增加任何执行分支**。

## 7. 前端组件

### 7.1 property 的 `'sqlite'` 渲染 — `packages/web/src/components/workflow/workflow-fields-property.tsx`

`PropertyField` 的 `switch(prop.type)` 增加：

```tsx
case 'sqlite':
  return <SqliteDatabasePicker value={String(value ?? '')} onChange={onChange} />;
```

新建 `SqliteDatabasePicker`（同目录新文件 `workflow-fields-sqlite.tsx`）：只读输入框显示当前库名 + 「选择数据库」按钮；点击打开 `SqliteDatabaseListDialog`（传入 `mode='pick'`），选中后 `onChange(databaseId)`。

### 7.2 动态 options 接入 — `workflow-properties-list.tsx`

`PropertyField` 的调用方需把「同节点 data」与「databaseId 变化回调」下传：

- 遍历 `properties` 渲染时，维护当前 node data 快照。
- 当某 select 字段带 `dynamicOptions` 时，用一个内部 hook（如 `useDynamicOptions(prop, nodeData)`）：
  - 读 `nodeData[dynamicOptions.dependsOn]`（databaseId）；为空 → options=[]，显示 `placeholder`。
  - 有值且 `source='sqlite-tables'` → `sdk.sqlite.listTables(dbId)` → options=tables.map(t=>({label:t.name,value:t.name}))。
  - `source='sqlite-columns'` → 再读 `nodeData[dependsOnTableKey]`（表名）→ `sdk.sqlite.describeTable` → options=columns（`allOption` 时 prepend `{label:'*',value:'*'}`）。
  - 依赖值变化时重新拉取，结果本地缓存。
- 当 `database` 字段值变化时，依赖它的 `table`/`columns` 字段需重置（在 node data 更新处级联清空）。

### 7.3 `SqliteDatabaseListDialog`（新，`components/workflow/`）

- 顶部工具栏：过滤（全部/当前工作流/未关联，默认当前工作流）+ 名称搜索 + 「新建数据库」按钮。
- 列表行：库名、描述、关联工作流标签、表数量、操作（选择 / 浏览数据 / 编辑 / 删除）。
- `mode='pick'`（从节点属性打开）：行内「选择」按钮回填 databaseId 后关闭；`mode='manage'`（独立管理）：无「选择」按钮。
- 新建/编辑：小弹窗（name + description + 关联工作流多选）。
- 删除：二次确认（提示将删除 .sqlite 文件）。
- 「浏览数据」→ 打开 `SqliteDataBrowserDialog`。

### 7.4 `SqliteDataBrowserDialog`（新）

- 左侧：表列表（`sdk.sqlite.listTables`），点选切换。
- 右侧：`ResultTable` 分页只读展示选中表数据（`SELECT * FROM "<table>" LIMIT ? OFFSET ?`）。
- 顶部「执行 SQL」折叠区：textarea + 「运行」按钮 → `sdk.sqlite.query/exec` → 结果在右侧 `ResultTable` 展示（DDL/exec 显示 changes）。

### 7.5 `ResultTable`（新，`components/table/result-table.tsx`）

- 泛化动态列表格：`columns` 从 `SqliteQueryResult.columns` 生成 `ColumnDef`（每列 `accessorKey` = 列名，单元格按值类型渲染）。
- 复用现有 `DataGrid`/`DataGridContainer`/`DataGridTable`/`DataGridPagination`/`ScrollArea`（与 [sortable-table.tsx](packages/web/src/components/table/sortable-table.tsx) 同源）。
- 支持：排序、分页（pageSize 可选 10/20/50）、空态、加载骨架、`truncated` 提示（"结果已截断至 N 行"）。
- props：`{ result: SqliteQueryResult | null, isLoading, error }`。

## 8. i18n

- 新增命名空间 `sqlite.json`（中/英），覆盖列表对话框、浏览卡、新建/编辑弹窗、过滤标签。
- `nodes.json`（现有节点命名空间）补 5 节点的 `label`/`description`/各 props 的 `label`/`tooltip`/`placeholder`，以及 `nodes.categories.sqlite`。
- 命名空间总数 34 → 35。

## 9. 测试

新增 `packages/server/test/sqlite-store.test.ts`（沿用 `mini-app-db.test.ts` 的 node:test 风格）：

1. `createDatabase` → `listDatabases` 含之；`name` 非法抛错。
2. `query`/`exec` 基本 CRUD（建表→插入→查询→更新→删除）。
3. 注入防护：`ATTACH`/`DETACH` 被 `checkSql` 拦；`validateIdentifier` 拒绝 `t; DROP TABLE`、`col" OR 1=1`。
4. `MAX_ROWS` 截断：插入 >10000 行后 `query` 返回 `truncated=true`。
5. 关联过滤：`listDatabases(workflowId)` 只返回关联库。
6. `deleteDatabase` 连带删 .sqlite 文件。
7. `listTables`/`describeTable` 正确返回（排除 `sqlite_%` 系统表）。

无前端单测基础设施（与现有项目一致），前端走手动验证。

## 10. 范围外（不做）

- 表结构可视化设计器（建表/改列 UI）—— DDL 经 SQL 自定义节点或浏览卡执行。
- 运行期动态 `where` 条件构建器（当前 where 为设计期文本，见 §6.1 安全说明）。
- 数据库导入/导出、跨工作空间迁移、备份集成。
- 现有 sortable-table / filter-panel 的改造（它们是固定结构示例，保持不动）。
- 文档数据库（database-store）的任何改动。

## 11. 验证（手动）

1. 新建数据库 `db1`，关联当前工作流 → 列表默认（当前工作流）可见。
2. 浏览卡执行 `CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)` → 表列表出现 `users`。
3. 插入若干行 → 选表浏览可见数据、分页正常。
4. 工作流：`sqlite_insert` 节点（选 db1/users，fields=[{column:id,value:1},{column:name,value:?}]，输入字段绑定上游 `name`）→ 执行 → 浏览卡确认写入。
5. `sqlite_query` 节点（columns 动态下拉显示 users 的列）→ 执行输出 `rows`。
6. `sqlite_update`/`sqlite_delete` 验证 `changes` 输出。
7. `sqlite_raw` 执行 `SELECT * FROM users` 与 `DELETE FROM users WHERE id=?`。
8. 注入测试：raw 节点执行 `ATTACH...` 被拒；专用节点 table 字段无法填入非法标识符。
9. 删除数据库 → .sqlite 文件消失，关联工作流列表不再含之。
10. `pnpm build`（shared→sdk→server→web）类型检查通过；`pnpm -r lint` 通过。

## 12. 涉及文件

**新增**
1. `packages/shared/src/types/sqlite.ts` — 类型定义
2. `packages/server/src/storage/sql-safety.ts` — 抽出的安全纯函数 + `validateIdentifier`
3. `packages/server/src/storage/sqlite-store.ts` — 数据库 store
4. `packages/server/src/routes/sqlite.ts` — REST 路由
5. `packages/sdk/src/sqlite.ts` — SDK 适配器
6. `packages/web/src/lib/workflow-nodes/definitions/sqlite.ts` — 5 节点定义
7. `packages/web/src/components/workflow/workflow-fields-sqlite.tsx` — `SqliteDatabasePicker`
8. `packages/web/src/components/workflow/sqlite-database-list-dialog.tsx` — 列表/管理对话框
9. `packages/web/src/components/workflow/sqlite-data-browser-dialog.tsx` — 数据浏览卡
10. `packages/web/src/components/table/result-table.tsx` — 通用结果表格
11. `packages/web/src/locales/{zh,en}/sqlite.json` — i18n
12. `packages/server/test/sqlite-store.test.ts` — 后端测试

**修改**
13. `packages/shared/src/types/workflow.ts` — `NodeProperty.type` 加 `'sqlite'`、加 `dynamicOptions`
14. `packages/shared/src/types/index.ts` — 聚合导出 sqlite
15. `packages/server/src/storage/mini-app-db.ts` — 改为引用 `sql-safety`
16. `packages/server/src/app.ts` — 注册 `/api/sqlite` 路由
17. `packages/sdk/src/index.ts`（聚合处） — 注册 sqlite 模块
18. `packages/web/src/lib/workflow-nodes/definitions/index.ts` + `registry.ts` — 聚合 `sqliteNodes`
19. `packages/web/src/components/workflow/workflow-fields-property.tsx` — `case 'sqlite'`
20. `packages/web/src/components/workflow/workflow-properties-list.tsx` — 动态 options 接入
21. `packages/server/src/services/execution-manager.ts` — 5 个执行分支
22. `packages/web/src/locales/{zh,en}/nodes.json` — 节点文案 + `categories.sqlite`

> 注：前端调试执行器（use-workflow-editor-execution.ts）走后端 API + WS，无需改动（见 §6.2）。
