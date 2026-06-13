# 工作流 SQLite 数据库节点 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增工作空间级 SQL 数据库资源子系统 + 5 个工作流节点（SQL 自定义/查询/新增/更新/删除），含数据库管理对话框与数据浏览卡。

**Architecture:** 方案 A —— 抽取 `sql-safety` 共享纯函数模块（供 mini-app-db 复用）；新建 `sqlite-store`（node:sqlite 驱动，与 database-store/kanban-store 一致）+ `routes/sqlite` + SDK 适配器；前端新增 `'sqlite'` 属性类型、动态 options 机制、列表对话框、浏览卡、通用 ResultTable；执行器为 5 节点生成参数化 SQL。

**Tech Stack:** TypeScript（strict, ESM）、Node.js `node:sqlite`（DatabaseSync）、Express 5 + zod、Next.js 16 + Zustand、@tanstack/react-table（现有）、TailwindCSS + shadcn/ui、next-intl、node:test。

**Spec:** [docs/superpowers/specs/2026-06-13-workflow-sqlite-nodes-design.md](../specs/2026-06-13-workflow-sqlite-nodes-design.md)

---

## 文件结构总览

| # | 文件 | 职责 | 任务 |
|---|------|------|------|
| 新 | `packages/shared/src/types/sqlite.ts` | 数据库/表/列/查询结果类型 | T1 |
| 改 | `packages/shared/src/types/workflow.ts` | `NodeProperty.type` 加 `'sqlite'` + `dynamicOptions` | T1 |
| 改 | `packages/shared/src/types/index.ts` | 聚合导出 sqlite | T1 |
| 新 | `packages/server/src/storage/sql-safety.ts` | 纯校验函数（从 mini-app-db 抽出）+ `validateIdentifier` | T2 |
| 改 | `packages/server/src/storage/mini-app-db.ts` | 改为引用 sql-safety | T2 |
| 新 | `packages/server/src/storage/sqlite-store.ts` | 数据库 store（node:sqlite + JSON 元信息） | T3 |
| 新 | `packages/server/src/routes/sqlite.ts` | REST 路由 | T4 |
| 改 | `packages/server/src/app.ts` | 注册路由 | T4 |
| 新 | `packages/sdk/src/modules/sqlite.ts` | SDK 适配器 | T5 |
| 改 | `packages/sdk/src/index.ts` + `client.ts` | 导出 + 组装 | T5 |
| 新 | `packages/web/src/lib/workflow-nodes/definitions/sqlite.ts` | 5 节点定义 | T6 |
| 改 | `definitions/index.ts` + `registry.ts` | 聚合 | T6 |
| 改 | `packages/server/src/services/execution-manager.ts` | 5 执行分支 | T7 |
| 新 | `packages/web/src/components/workflow/workflow-fields-sqlite.tsx` | `SqliteDatabasePicker` | T8 |
| 改 | `workflow-fields-property.tsx` | `case 'sqlite'` | T8 |
| 改 | `workflow-properties-list.tsx` | 动态 options 接入 | T9 |
| 新 | `packages/web/src/components/table/result-table.tsx` | 通用结果表格 | T10 |
| 新 | `packages/web/src/components/workflow/sqlite-database-list-dialog.tsx` | 列表/管理对话框 | T11 |
| 新 | `packages/web/src/components/workflow/sqlite-data-browser-dialog.tsx` | 数据浏览卡 | T12 |
| 新 | `packages/web/src/locales/{zh,en}/sqlite.json` | i18n | T13 |
| 改 | `packages/web/src/locales/{zh,en}/nodes.json` | 节点文案 | T13 |
| 新 | `packages/server/test/sqlite-store.test.ts` | 后端测试 | T3/T7 |
| — | 全包 | `pnpm build` + `pnpm lint` 验证 | T14 |

## 任务依赖图（subagent 编排用）

```
T1 ──┬─▶ T2 ─▶ T3 ──┬─▶ T4
     │              ├─▶ T7 ──┐
     ├─▶ T5 ──┬─▶ T8 ─▶ T9  │
     │        ├─▶ T11       │
     │        └──────────▶ T12
     ├─▶ T6 ──┘             │
     ├─▶ T10 ──────────────▶ T12
     └─▶ T13                │
                            └─▶ T14
```

- **Wave 1（顺序）**：T1 → T2 → T3
- **Wave 2（T3 后并行）**：T4 / T5 / T6 / T10 / T13
- **Wave 3**：T7(需T3,T6) / T8(需T5) / T11(需T5)
- **Wave 4**：T9(需T8) / T12(需T10,T11)
- **Wave 5**：T14（全部完成后）

> 每个 subagent 任务必须先 `pnpm build`（按 shared→sdk→server→web 顺序）确保依赖类型就绪。T1 完成后必须先 `cd packages/shared && pnpm build` 再开始后续任务。

---

## Task 1: shared 类型定义

**Files:**
- Create: `packages/shared/src/types/sqlite.ts`
- Modify: `packages/shared/src/types/workflow.ts:196-212`（NodeProperty）
- Modify: `packages/shared/src/types/index.ts`（聚合）

- [ ] **Step 1: 创建 `packages/shared/src/types/sqlite.ts`**

```ts
export interface SqliteDatabaseMeta {
  id: string;
  name: string;
  description: string;
  workflowIds: string[];
  createdAt: number;
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
  truncated?: boolean;
}

export interface SqliteExecResult {
  changes: number;
  lastInsertRowid: number | null;
}
```

- [ ] **Step 2: 扩展 `NodeProperty`（`packages/shared/src/types/workflow.ts`）**

把 `type` 字段（约 199 行）改为：
```ts
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions' | 'array' | 'output_fields' | 'agent' | 'sqlite'
```

在 `visibleWhen?: NodePropertyVisibleWhen` 之后（约 211 行后）新增：
```ts
export interface NodePropertyDynamicOptions {
  source: 'sqlite-tables' | 'sqlite-columns';
  dependsOn: string;
  dependsOnTableKey?: string;
  allOption?: boolean;
  placeholder?: string;
}
```

并在 `NodeProperty` 接口末尾（`visibleWhen` 后）加：
```ts
  dynamicOptions?: NodePropertyDynamicOptions;
```

- [ ] **Step 3: 聚合导出（`packages/shared/src/types/index.ts`）**

在现有类型导出列表中追加：
```ts
export * from './sqlite.js';
```

- [ ] **Step 4: 构建验证**

```bash
cd packages/shared && pnpm build
```
Expected: 编译成功，无类型错误。

- [ ] **Step 5: 提交**
```bash
git add packages/shared/src/types/sqlite.ts packages/shared/src/types/workflow.ts packages/shared/src/types/index.ts
git commit -m "feat(shared): 新增 sqlite 类型与 NodeProperty sqlite/dynamicOptions 扩展"
```

---

## Task 2: 抽取 sql-safety 共享模块

**Files:**
- Create: `packages/server/src/storage/sql-safety.ts`
- Modify: `packages/server/src/storage/mini-app-db.ts`
- Test: `packages/server/test/mini-app-db.test.ts`（既有，验证不回归）

- [ ] **Step 1: 创建 `packages/server/src/storage/sql-safety.ts`**

```ts
// SQL 与数据库命名的纯校验函数。driver 无关，供 mini-app-db（better-sqlite3）
// 与 sqlite-store（node:sqlite）共用，确保安全规则单一真相源。
export const DB_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
export const MAX_ROWS = 10000;
const BLOCKED_RE = /\b(ATTACH|DETACH)\b/i;

export type SqlParams = unknown[] | Record<string, unknown>;

export function validateDbName(dbName: string): void {
  if (typeof dbName !== 'string' || !DB_NAME_RE.test(dbName)) {
    throw new Error(`Invalid db name: ${dbName}`);
  }
}

export function checkSql(sql: string): void {
  if (typeof sql !== 'string' || BLOCKED_RE.test(sql)) {
    throw new Error('ATTACH/DETACH are not allowed');
  }
}

// 数组 → 按位置展开；对象 → 包成单参；undefined → 空参数
export function bindArgs(params: SqlParams | undefined): unknown[] {
  if (params == null) return [];
  return Array.isArray(params) ? params : [params];
}

// 标识符（表名/列名）白名单，防专用节点生成的 SQL 注入
export const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
export function validateIdentifier(name: string, kind: 'table' | 'column'): void {
  if (typeof name !== 'string' || !IDENT_RE.test(name)) {
    throw new Error(`Invalid ${kind} name: ${name}`);
  }
}
```

- [ ] **Step 2: 写失败测试（`packages/server/test/sql-safety.test.ts`）**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDbName, checkSql, bindArgs, validateIdentifier } from '../src/storage/sql-safety.js';

test('validateDbName accepts legal names', () => {
  assert.doesNotThrow(() => validateDbName('logs'));
  assert.doesNotThrow(() => validateDbName('main_db-1'));
});

test('validateDbName rejects illegal names', () => {
  assert.throws(() => validateDbName(''), /Invalid db name/);
  assert.throws(() => validateDbName('a/b'), /Invalid db name/);
  assert.throws(() => validateDbName('a b'), /Invalid db name/);
});

test('checkSql blocks ATTACH/DETACH but allows normal SQL', () => {
  assert.throws(() => checkSql('ATTACH DATABASE "x" AS x'), /not allowed/i);
  assert.throws(() => checkSql('detach x'), /not allowed/i);
  assert.doesNotThrow(() => checkSql('SELECT * FROM t WHERE x = 1'));
});

test('bindArgs handles array/object/undefined', () => {
  assert.deepEqual(bindArgs([1, 2]), [1, 2]);
  assert.deepEqual(bindArgs(undefined), []);
  assert.deepEqual(bindArgs({ a: 1 }), [{ a: 1 }]);
});

test('validateIdentifier rejects injection', () => {
  assert.doesNotThrow(() => validateIdentifier('users', 'table'));
  assert.throws(() => validateIdentifier('t; DROP TABLE', 'table'), /Invalid table name/);
  assert.throws(() => validateIdentifier('col" OR 1=1', 'column'), /Invalid column name/);
});
```

- [ ] **Step 3: 运行测试**
```bash
cd packages/server && node --test --import tsx test/sql-safety.test.ts
```
Expected: 全部 PASS。

- [ ] **Step 4: 改 mini-app-db.ts 引用 sql-safety**

`packages/server/src/storage/mini-app-db.ts`：
- 删除文件内 `DB_NAME_RE / MAX_ROWS / BLOCKED_RE / SqlParams / validateDbName / checkSql / bindArgs` 的本地定义（第 7-29 行）。
- 文件顶部加：
```ts
import { validateDbName, checkSql, bindArgs, MAX_ROWS, type SqlParams } from './sql-safety.js';
```
- 保留 `import Database from 'better-sqlite3'` 等其余代码不动。

- [ ] **Step 5: 验证 mini-app-db 不回归**
```bash
cd packages/server && node --test --import tsx test/mini-app-db.test.ts
```
Expected: 既有测试全部 PASS。

- [ ] **Step 6: 提交**
```bash
git add packages/server/src/storage/sql-safety.ts packages/server/src/storage/mini-app-db.ts packages/server/test/sql-safety.test.ts
git commit -m "refactor(server): 抽取 sql-safety 共享模块并复用 validateIdentifier"
```

---

## Task 3: sqlite-store（node:sqlite + JSON 元信息）

**Files:**
- Create: `packages/server/src/storage/sqlite-store.ts`
- Test: `packages/server/test/sqlite-store.test.ts`

> 用 `node:sqlite`（DatabaseSync），与 database-store/kanban-store 一致。元信息用 `databases.json`（json-store 辅助）；数据库文件用 `{id}.sqlite`。

- [ ] **Step 1: 创建 store**

`packages/server/src/storage/sqlite-store.ts`：

```ts
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import type {
  SqliteDatabaseMeta, SqliteTableInfo, SqliteColumnInfo,
  SqliteQueryResult, SqliteExecResult,
} from '@agent-spaces/shared';
import { getDataDir, ensureDir, readJsonFile, writeJsonFile, deleteFile } from './json-store.js';
import { checkSql, validateDbName, bindArgs, MAX_ROWS, type SqlParams } from './sql-safety.js';

const META_FILE = join(getDataDir(), 'sqlite', 'databases.json');
const DB_DIR = join(getDataDir(), 'sqlite');
const POOL = new Map<string, DatabaseSync>();

let metaCache: SqliteDatabaseMeta[] | null = null;

function loadMeta(): SqliteDatabaseMeta[] {
  if (metaCache) return metaCache;
  metaCache = readJsonFile<SqliteDatabaseMeta[]>(META_FILE) ?? [];
  return metaCache;
}
function saveMeta(list: SqliteDatabaseMeta[]): void {
  metaCache = list;
  writeJsonFile(META_FILE, list);
}
function dbPath(id: string): string {
  ensureDir(DB_DIR);
  return join(DB_DIR, `${id}.sqlite`);
}
function openDb(id: string): DatabaseSync {
  const cached = POOL.get(id);
  if (cached) return cached;
  const db = new DatabaseSync(dbPath(id));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  POOL.set(id, db);
  return db;
}
function now(): number { return Date.now(); }

export function listDatabases(workflowId?: string): SqliteDatabaseMeta[] {
  const all = loadMeta();
  if (!workflowId) return [...all].sort((a, b) => a.createdAt - b.createdAt);
  return all.filter((d) => d.workflowIds.includes(workflowId)).sort((a, b) => a.createdAt - b.createdAt);
}

export function getDatabase(id: string): SqliteDatabaseMeta | null {
  return loadMeta().find((d) => d.id === id) ?? null;
}

export function createDatabase(input: { name: string; description?: string; workflowIds?: string[] }): SqliteDatabaseMeta {
  validateDbName(input.name);
  const list = loadMeta();
  const meta: SqliteDatabaseMeta = {
    id: uuid(), name: input.name.trim(), description: input.description ?? '',
    workflowIds: input.workflowIds ?? [], createdAt: now(), updatedAt: now(),
  };
  list.push(meta);
  saveMeta(list);
  openDb(meta.id); // 触发文件创建
  return meta;
}

export function updateDatabase(id: string, updates: Partial<Pick<SqliteDatabaseMeta, 'name' | 'description' | 'workflowIds'>>): SqliteDatabaseMeta | null {
  const list = loadMeta();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  if (updates.name !== undefined) validateDbName(updates.name);
  list[idx] = { ...list[idx], ...updates, updatedAt: now() };
  saveMeta(list);
  return list[idx];
}

export function setWorkflowAssociations(id: string, workflowIds: string[]): SqliteDatabaseMeta | null {
  return updateDatabase(id, { workflowIds });
}

export function deleteDatabase(id: string): boolean {
  const list = loadMeta();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  const db = POOL.get(id);
  if (db) { try { db.close(); } catch { /* noop */ } POOL.delete(id); }
  deleteFile(dbPath(id));
  list.splice(idx, 1);
  saveMeta(list);
  return true;
}

export function listTables(id: string): SqliteTableInfo[] {
  const db = openDb(id);
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all() as { name: string }[];
  return tables.map((t) => {
    const c = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number };
    return { name: t.name, rowCount: c.n };
  });
}

export function describeTable(id: string, table: string): SqliteColumnInfo[] {
  const db = openDb(id);
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string; type: string; notnull: number; pk: number; dflt_value: string | null;
  }>;
  return cols.map((c) => ({
    name: c.name, type: c.type, notNull: !!c.notnull, pk: !!c.pk, defaultValue: c.dflt_value,
  }));
}

export function query(id: string, sql: string, params?: SqlParams): SqliteQueryResult {
  checkSql(sql);
  const db = openDb(id);
  const stmt = db.prepare(sql);
  const columns = stmt.columns().map((c) => c.name);
  const rows = stmt.all(...bindArgs(params)) as Record<string, unknown>[];
  const truncated = rows.length > MAX_ROWS;
  return { columns, rows: truncated ? rows.slice(0, MAX_ROWS) : rows, rowCount: rows.length, truncated };
}

export function exec(id: string, sql: string, params?: SqlParams): SqliteExecResult {
  checkSql(sql);
  const db = openDb(id);
  const r = db.prepare(sql).run(...bindArgs(params)) as { changes: number; lastInsertRowid?: number | bigint };
  return { changes: r.changes, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
}

export function closeAllDbs(): void {
  for (const [, db] of POOL) { try { db.close(); } catch { /* noop */ } }
  POOL.clear();
}
```

> **注**：`StatementSync.columns()` 在 Node 22.5+ 可用。若运行环境 `stmt.columns` 不存在，退化为 `columns = rows[0] ? Object.keys(rows[0]) : []`（实现时如遇此情况替换 query 中 columns 取法）。

- [ ] **Step 2: 写测试 `packages/server/test/sqlite-store.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatabase, listDatabases, getDatabase, updateDatabase, deleteDatabase,
  listTables, describeTable, query, exec,
} from '../src/storage/sqlite-store.js';

function setup() {
  const db = createDatabase({ name: 'test_' + Math.random().toString(36).slice(2, 8), description: 't' });
  return db.id;
}
function cleanup(id: string) { try { deleteDatabase(id); } catch { /* noop */ } }

test('createDatabase + listDatabases + getDatabase', () => {
  const db = createDatabase({ name: 'lst_' + Date.now() });
  assert.ok(getDatabase(db.id));
  assert.ok(listDatabases().some((d) => d.id === db.id));
  cleanup(db.id);
});

test('createDatabase rejects invalid name', () => {
  assert.throws(() => createDatabase({ name: 'a/b' }));
});

test('CRUD via query/exec', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    exec(id, 'INSERT INTO users(name) VALUES(?)', ['alice']);
    exec(id, 'INSERT INTO users(name) VALUES(?)', ['bob']);
    const r = query(id, 'SELECT * FROM users ORDER BY id');
    assert.equal(r.rowCount, 2);
    assert.deepEqual(r.columns, ['id', 'name']);
    exec(id, 'UPDATE users SET name = ? WHERE id = ?', ['ALICE', 1]);
    assert.equal((query(id, 'SELECT name FROM users WHERE id = 1').rows[0] as any).name, 'ALICE');
    exec(id, 'DELETE FROM users WHERE id = ?', [2]);
    assert.equal(query(id, 'SELECT * FROM users').rowCount, 1);
  } finally { cleanup(id); }
});

test('checkSql blocks ATTACH in store layer', () => {
  const id = setup();
  try { assert.throws(() => query(id, 'ATTACH DATABASE "x" AS x')); }
  finally { cleanup(id); }
});

test('listTables excludes sqlite_% system tables', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE t1(x)');
    const tables = listTables(id);
    assert.ok(tables.some((t) => t.name === 't1'));
    assert.ok(!tables.some((t) => t.name.startsWith('sqlite_')));
  } finally { cleanup(id); }
});

test('describeTable returns columns', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE c(a TEXT, b INTEGER NOT NULL)');
    const cols = describeTable(id, 'c');
    assert.equal(cols.length, 2);
    assert.ok(cols.find((c) => c.name === 'b' && c.notNull));
  } finally { cleanup(id); }
});

test('workflow association filter', () => {
  const db = createDatabase({ name: 'wf_' + Date.now(), workflowIds: ['wf-A'] });
  try {
    assert.ok(listDatabases('wf-A').some((d) => d.id === db.id));
    assert.ok(!listDatabases('wf-B').some((d) => d.id === db.id));
    updateDatabase(db.id, { workflowIds: ['wf-B'] });
    assert.ok(listDatabases('wf-B').some((d) => d.id === db.id));
  } finally { cleanup(db.id); }
});

test('MAX_ROWS truncation', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE big(x)');
    exec(id, 'INSERT INTO big(x) WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 10001) SELECT x FROM cnt');
    const r = query(id, 'SELECT * FROM big');
    assert.equal(r.truncated, true);
    assert.equal(r.rows.length, 10000);
  } finally { cleanup(id); }
});
```

- [ ] **Step 3: 运行测试**
```bash
cd packages/server && node --test --import tsx test/sqlite-store.test.ts
```
Expected: 全部 PASS。

- [ ] **Step 4: 提交**
```bash
git add packages/server/src/storage/sqlite-store.ts packages/server/test/sqlite-store.test.ts
git commit -m "feat(server): 新增 sqlite-store（node:sqlite + JSON 元信息）"
```

---

## Task 4: REST 路由

**Files:**
- Create: `packages/server/src/routes/sqlite.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: 创建路由 `packages/server/src/routes/sqlite.ts`**

```ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import * as store from '../storage/sqlite-store.js';
import { validateIdentifier } from '../storage/sql-safety.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  workflowIds: z.array(z.string()).optional(),
});
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  workflowIds: z.array(z.string()).optional(),
});
const sqlSchema = z.object({
  sql: z.string().min(1),
  params: z.array(z.any()).or(z.record(z.any())).optional(),
});

// GET /api/sqlite/databases?workflowId=
router.get('/databases', (req: Request, res: Response) => {
  res.json(store.listDatabases(typeof req.query.workflowId === 'string' ? req.query.workflowId : undefined));
});

// POST /api/sqlite/databases
router.post('/databases', (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.createDatabase(parsed.data)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// PATCH /api/sqlite/databases/:id
router.patch('/databases/:id', (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const meta = store.updateDatabase(req.params.id, parsed.data);
  if (!meta) { res.status(404).json({ error: 'Database not found' }); return; }
  res.json(meta);
});

// DELETE /api/sqlite/databases/:id
router.delete('/databases/:id', (req: Request, res: Response) => {
  if (!store.deleteDatabase(req.params.id)) { res.status(404).json({ error: 'Database not found' }); return; }
  res.json({ ok: true });
});

// GET /api/sqlite/databases/:id/tables
router.get('/databases/:id/tables', (req: Request, res: Response) => {
  try { res.json(store.listTables(req.params.id)); }
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// GET /api/sqlite/databases/:id/tables/:table/columns
router.get('/databases/:id/tables/:table/columns', (req: Request, res: Response) => {
  try {
    validateIdentifier(req.params.table, 'table');
    res.json(store.describeTable(req.params.id, req.params.table));
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// POST /api/sqlite/databases/:id/query
router.post('/databases/:id/query', (req: Request, res: Response) => {
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.query(req.params.id, parsed.data.sql, parsed.data.params)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

// POST /api/sqlite/databases/:id/exec
router.post('/databases/:id/exec', (req: Request, res: Response) => {
  const parsed = sqlSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try { res.json(store.exec(req.params.id, parsed.data.sql, parsed.data.params)); }
  catch (e) { res.status(400).json({ error: (e as Error).message }); }
});

export default router;
```

- [ ] **Step 2: 注册路由（`packages/server/src/app.ts`）**

在路由 import 区（约 50 行 `miniAppRouter` 附近）加：
```ts
import sqliteRouter from './routes/sqlite.js';
```
在 `app.use(...)` 注册区（约 86 行后，与其他 `/api/...` 同级）加：
```ts
app.use('/api/sqlite', sqliteRouter);
```

- [ ] **Step 3: 类型检查**
```bash
cd packages/server && pnpm build
```
Expected: 编译成功。

- [ ] **Step 4: 提交**
```bash
git add packages/server/src/routes/sqlite.ts packages/server/src/app.ts
git commit -m "feat(server): 新增 /api/sqlite REST 路由"
```

---

## Task 5: SDK 适配器

**Files:**
- Create: `packages/sdk/src/modules/sqlite.ts`
- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/client.ts`（模块组装处）

- [ ] **Step 1: 创建 `packages/sdk/src/modules/sqlite.ts`**

```ts
import type { HttpClient } from '../client';
import type {
  SqliteDatabaseMeta, SqliteTableInfo, SqliteColumnInfo,
  SqliteQueryResult, SqliteExecResult,
} from '@agent-spaces/shared';

export function createSqliteApi(http: HttpClient) {
  return {
    listDatabases: (workflowId?: string): Promise<SqliteDatabaseMeta[]> =>
      http.get('/api/sqlite/databases', workflowId ? { workflowId } : undefined),

    createDatabase: (input: { name: string; description?: string; workflowIds?: string[] }): Promise<SqliteDatabaseMeta> =>
      http.post('/api/sqlite/databases', input),

    updateDatabase: (id: string, updates: Partial<Pick<SqliteDatabaseMeta, 'name' | 'description' | 'workflowIds'>>): Promise<SqliteDatabaseMeta> =>
      http.patch(`/api/sqlite/databases/${id}`, updates),

    deleteDatabase: (id: string): Promise<void> =>
      http.deleteOf<{ ok: boolean }>(`/api/sqlite/databases/${id}`).then(() => undefined),

    listTables: (id: string): Promise<SqliteTableInfo[]> =>
      http.get(`/api/sqlite/databases/${id}/tables`),

    describeTable: (id: string, table: string): Promise<SqliteColumnInfo[]> =>
      http.get(`/api/sqlite/databases/${id}/tables/${encodeURIComponent(table)}/columns`),

    query: (id: string, sql: string, params?: unknown[]): Promise<SqliteQueryResult> =>
      http.post(`/api/sqlite/databases/${id}/query`, { sql, params }),

    exec: (id: string, sql: string, params?: unknown[]): Promise<SqliteExecResult> =>
      http.post(`/api/sqlite/databases/${id}/exec`, { sql, params }),
  };
}
```

> **核对 HttpClient.get 第二参数**：若 `http.get` 不接受 query 对象，改用字符串拼接 `?workflowId=${encodeURIComponent(workflowId)}`。执行前先读 `packages/sdk/src/client.ts` 确认 `get` 签名。

- [ ] **Step 2: 导出（`packages/sdk/src/index.ts`）**

在模块导出区加：
```ts
export { createSqliteApi } from './modules/sqlite';
```

- [ ] **Step 3: 组装（`packages/sdk/src/client.ts`）**

import 区加：
```ts
import { createSqliteApi } from './modules/sqlite';
```
在 SDK 实例组装对象中（与 `kanban: createKanbanApi(http)` 同级）加：
```ts
sqlite: createSqliteApi(http),
```

- [ ] **Step 4: 构建验证**
```bash
cd packages/sdk && pnpm build
```
Expected: 编译成功。

- [ ] **Step 5: 提交**
```bash
git add packages/sdk/src/modules/sqlite.ts packages/sdk/src/index.ts packages/sdk/src/client.ts
git commit -m "feat(sdk): 新增 sqlite 模块适配器"
```

---

## Task 6: 五个节点定义

**Files:**
- Create: `packages/web/src/lib/workflow-nodes/definitions/sqlite.ts`
- Modify: `packages/web/src/lib/workflow-nodes/definitions/index.ts`
- Modify: `packages/web/src/lib/workflow-nodes/registry.ts`

- [ ] **Step 1: 创建 `packages/web/src/lib/workflow-nodes/definitions/sqlite.ts`**

```ts
import type { NodeTypeDefinition } from '@agent-spaces/shared';

const DB_PROP = {
  key: 'database',
  label: 'nodes.sqlite.props.database',
  type: 'sqlite' as const,
  required: true,
  tooltip: 'nodes.sqlite.props.database_tooltip',
};

export const sqliteNodes: NodeTypeDefinition[] = [
  {
    type: 'sqlite_query',
    label: 'nodes.sqlite_query.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_query.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'columns', label: 'nodes.sqlite.props.columns', type: 'select',
        dynamicOptions: { source: 'sqlite-columns', dependsOn: 'database', dependsOnTableKey: 'table', allOption: true, placeholder: 'nodes.sqlite.props.selectTableFirst' },
        default: '*',
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', tooltip: 'nodes.sqlite.props.where_tooltip' },
      { key: 'orderBy', label: 'nodes.sqlite.props.orderBy', type: 'text' },
      { key: 'limit', label: 'nodes.sqlite.props.limit', type: 'number', default: 1000 },
    ],
    outputs: [
      { key: 'rows', type: 'object[]' as any },
      { key: 'rowCount', type: 'number' },
    ],
  },
  {
    type: 'sqlite_insert',
    label: 'nodes.sqlite_insert.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_insert.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'fields', label: 'nodes.sqlite.props.fields', type: 'array', required: true,
        tooltip: 'nodes.sqlite.props.fields_tooltip',
        itemTemplate: { column: '', value: '' },
        fields: [
          { key: 'column', label: 'nodes.sqlite.props.column', type: 'select', required: true,
            dynamicOptions: { source: 'sqlite-columns', dependsOn: 'database', dependsOnTableKey: 'table', placeholder: 'nodes.sqlite.props.selectTableFirst' } as any },
          { key: 'value', label: 'nodes.sqlite.props.value', type: 'text' },
        ],
      },
    ],
    outputs: [
      { key: 'insertedId', type: 'number' },
      { key: 'changes', type: 'number' },
    ],
  },
  {
    type: 'sqlite_update',
    label: 'nodes.sqlite_update.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_update.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      {
        key: 'setFields', label: 'nodes.sqlite.props.setFields', type: 'array', required: true,
        itemTemplate: { column: '', value: '' },
        fields: [
          { key: 'column', label: 'nodes.sqlite.props.column', type: 'select', required: true,
            dynamicOptions: { source: 'sqlite-columns', dependsOn: 'database', dependsOnTableKey: 'table', placeholder: 'nodes.sqlite.props.selectTableFirst' } as any },
          { key: 'value', label: 'nodes.sqlite.props.value', type: 'text' },
        ],
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', tooltip: 'nodes.sqlite.props.where_tooltip' },
    ],
    outputs: [{ key: 'changes', type: 'number' }],
  },
  {
    type: 'sqlite_delete',
    label: 'nodes.sqlite_delete.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_delete.description',
    properties: [
      DB_PROP,
      {
        key: 'table', label: 'nodes.sqlite.props.table', type: 'select', required: true,
        dynamicOptions: { source: 'sqlite-tables', dependsOn: 'database', placeholder: 'nodes.sqlite.props.selectDbFirst' },
      },
      { key: 'where', label: 'nodes.sqlite.props.where', type: 'textarea', required: true, tooltip: 'nodes.sqlite.props.where_tooltip' },
    ],
    outputs: [{ key: 'changes', type: 'number' }],
  },
  {
    type: 'sqlite_raw',
    label: 'nodes.sqlite_raw.label',
    category: 'nodes.categories.sqlite',
    icon: 'Database',
    description: 'nodes.sqlite_raw.description',
    properties: [
      DB_PROP,
      { key: 'sql', label: 'nodes.sqlite.props.sql', type: 'textarea', required: true, tooltip: 'nodes.sqlite.props.sql_tooltip' },
      { key: 'mode', label: 'nodes.sqlite.props.mode', type: 'select', default: 'query',
        options: [
          { label: 'nodes.sqlite.props.modeQuery', value: 'query' },
          { label: 'nodes.sqlite.props.modeExec', value: 'exec' },
        ] },
    ],
    outputs: [
      { key: 'rows', type: 'object[]' as any },
      { key: 'execResult', type: 'object' },
    ],
  },
];
```

> **注意**：`OutputField.type` 若不支持 `'object[]'`（见 workflow.ts `OutputField` 定义），改用 `'any'`。执行前先 grep `interface OutputField` 确认支持类型，按实际调整。

- [ ] **Step 2: 聚合 `definitions/index.ts`**

追加一行：
```ts
export { sqliteNodes } from './sqlite';
```

- [ ] **Step 3: 聚合 `registry.ts`**

import 改为加入 `sqliteNodes`：
```ts
import { flowControlNodes, aiNodes, interactionNodes, displayNodes, utilsNodes, sqliteNodes } from './definitions';
```
`allNodeDefinitions` 数组中加入：
```ts
  ...sqliteNodes,
```

- [ ] **Step 4: 类型检查**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功（i18n key 缺失不影响编译）。

- [ ] **Step 5: 提交**
```bash
git add packages/web/src/lib/workflow-nodes/definitions/sqlite.ts packages/web/src/lib/workflow-nodes/definitions/index.ts packages/web/src/lib/workflow-nodes/registry.ts
git commit -m "feat(web): 注册 5 个 sqlite 工作流节点定义"
```

---

## Task 7: execution-manager 5 分支

**Files:**
- Modify: `packages/server/src/services/execution-manager.ts`

> 先读 `execution-manager.ts` 中 `buildOutputObject(resolvedData.inputFields)` 与 `resolvedData` 的结构，确认参数值获取方式。`resolvedData` 是节点 data 解析上游变量后的对象；`inputFields` 含上游绑定的变量值，按节点声明顺序。

- [ ] **Step 1: 在 execution-manager import 区加**

```ts
import * as sqliteStore from '../storage/sqlite-store.js';
import { validateIdentifier } from '../storage/sql-safety.js';
```

- [ ] **Step 2: 新增私有方法（在 executeNode 方法所在的 class 内，与 executeTableDisplay 同级）**

```ts
private getInputFieldValues(resolvedData: any): unknown[] {
  // inputFields 为节点声明的输入字段；其值在 resolvedData 解析阶段已绑定上游变量。
  // 取「值」数组（按声明顺序），用于绑定 SQL 的 ? 占位符。
  const fields = Array.isArray(resolvedData?.inputFields) ? resolvedData.inputFields : [];
  return fields.map((f: any) => f?.value ?? f?.defaultValue ?? null);
}

private resolveWhereParams(where: string): { clause: string | null; paramCount: number } {
  if (!where || !where.trim()) return { clause: null, paramCount: 0 };
  const paramCount = (where.match(/\?/g) || []).length;
  return { clause: where, paramCount };
}

private executeSqliteQuery(session: any, node: any, resolvedData: any) {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const colsRaw = resolvedData.columns === '*' || !resolvedData.columns ? '*' : String(resolvedData.columns);
  const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
  const order = resolvedData.orderBy ? ` ORDER BY ${resolvedData.orderBy}` : '';
  const limit = Number(resolvedData.limit) > 0 ? Number(resolvedData.limit) : 1000;
  let sql = `SELECT ${colsRaw} FROM "${table}"`;
  if (clause) sql += ` WHERE ${clause}`;
  sql += `${order} LIMIT ?`;
  const fieldValues = this.getInputFieldValues(resolvedData).slice(0, paramCount);
  const result = sqliteStore.query(dbId, sql, [...fieldValues, limit]);
  return { rows: result.rows, rowCount: result.rowCount };
}

private executeSqliteInsert(session: any, node: any, resolvedData: any) {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const fields = Array.isArray(resolvedData.fields) ? resolvedData.fields : [];
  const columns = fields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
  const placeholders = columns.map(() => '?').join(',');
  const sql = `INSERT INTO "${table}" (${columns.join(',')}) VALUES (${placeholders})`;
  const fieldValues = this.getInputFieldValues(resolvedData);
  // fields[].value 用文本值；若未通过 inputField，则回退到字段声明的 value
  const params = fields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
  const r = sqliteStore.exec(dbId, sql, params);
  return { insertedId: r.lastInsertRowid, changes: r.changes };
}

private executeSqliteUpdate(session: any, node: any, resolvedData: any) {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const setFields = Array.isArray(resolvedData.setFields) ? resolvedData.setFields : [];
  const columns = setFields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
  const setClause = columns.map((c) => `${c} = ?`).join(', ');
  const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
  let sql = `UPDATE "${table}" SET ${setClause}`;
  if (clause) sql += ` WHERE ${clause}`;
  const fieldValues = this.getInputFieldValues(resolvedData);
  const setParams = setFields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
  const whereParams = fieldValues.slice(setFields.length, setFields.length + paramCount);
  const r = sqliteStore.exec(dbId, sql, [...setParams, ...whereParams]);
  return { changes: r.changes };
}

private executeSqliteDelete(session: any, node: any, resolvedData: any) {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const { clause, paramCount } = this.resolveWhereParams(String(resolvedData.where || ''));
  let sql = `DELETE FROM "${table}"`;
  if (clause) sql += ` WHERE ${clause}`;
  const fieldValues = this.getInputFieldValues(resolvedData).slice(0, paramCount);
  const r = sqliteStore.exec(dbId, sql, fieldValues);
  return { changes: r.changes };
}

private executeSqliteRaw(session: any, node: any, resolvedData: any) {
  const dbId = String(resolvedData.database || '');
  const sql = String(resolvedData.sql || '');
  const mode = String(resolvedData.mode || 'query');
  const params = this.getInputFieldValues(resolvedData).slice(0, (sql.match(/\?/g) || []).length);
  if (mode === 'exec') {
    const r = sqliteStore.exec(dbId, sql, params);
    return { rows: [], execResult: r };
  }
  const r = sqliteStore.query(dbId, sql, params);
  return { rows: r.rows, rowCount: r.rowCount };
}
```

- [ ] **Step 3: 在 executeNode 的 switch 加 5 分支**

在 `case 'table_display':` 同级（约 615 行后）加：
```ts
      case 'sqlite_query':  return this.executeSqliteQuery(session, node, resolvedData);
      case 'sqlite_insert': return this.executeSqliteInsert(session, node, resolvedData);
      case 'sqlite_update': return this.executeSqliteUpdate(session, node, resolvedData);
      case 'sqlite_delete': return this.executeSqliteDelete(session, node, resolvedData);
      case 'sqlite_raw':    return this.executeSqliteRaw(session, node, resolvedData);
```

- [ ] **Step 4: 类型检查**
```bash
cd packages/server && pnpm build
```
Expected: 编译成功。

- [ ] **Step 5: 提交**
```bash
git add packages/server/src/services/execution-manager.ts
git commit -m "feat(server): execution-manager 增加 5 个 sqlite 节点执行分支"
```

---

## Task 8: sqlite 属性渲染（Picker + property case）

**Files:**
- Create: `packages/web/src/components/workflow/workflow-fields-sqlite.tsx`
- Modify: `packages/web/src/components/workflow/workflow-fields-property.tsx`

- [ ] **Step 1: 创建 `workflow-fields-sqlite.tsx`**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sdk } from '@/lib/sdk';
import { useTranslations } from 'next-intl';
import { SqliteDatabaseListDialog } from './sqlite-database-list-dialog';

export function SqliteDatabasePicker({ value, onChange }: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [dbName, setDbName] = useState('');

  useEffect(() => {
    let active = true;
    if (!value) { setDbName(''); return; }
    sdk.sqlite.listDatabases().then((list) => {
      if (!active) return;
      setDbName(list.find((d) => d.id === value)?.name ?? value);
    }).catch(() => { if (active) setDbName(value); });
    return () => { active = false; };
  }, [value]);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-7 flex-1 items-center rounded-md border bg-muted/40 px-2 text-xs">
        <Database className="mr-1.5 size-3.5 text-muted-foreground" />
        <span className="truncate">{dbName || t('sqlite.pickerEmpty')}</span>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        {t('sqlite.selectDatabase')}
      </Button>
      <SqliteDatabaseListDialog
        open={open}
        onOpenChange={setOpen}
        mode="pick"
        onPicked={(id) => { onChange(id); setOpen(false); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: property switch 加 case（`workflow-fields-property.tsx`）**

import 区加：
```ts
import { SqliteDatabasePicker } from './workflow-fields-sqlite';
```
在 `case 'agent':` 之后、`default:` 之前加：
```tsx
    case 'sqlite':
      return <SqliteDatabasePicker value={String(value ?? '')} onChange={(v) => onChange(v)} />;
```

- [ ] **Step 3: 构建验证（此时依赖 T11 的 dialog，可先占位跳过或与 T11 合并提交）**

> 此任务与 T11（list dialog）强耦合。若 T11 未完成，Picker 会引用不存在的组件——建议 T8 与 T11 在同一 subagent 会话内连续完成，或先实现 T11 再回填 T8 的 import。

- [ ] **Step 4: 提交（T8 + T11 一起）**
```bash
git add packages/web/src/components/workflow/workflow-fields-sqlite.tsx packages/web/src/components/workflow/workflow-fields-property.tsx
```
（T11 完成后统一提交，见 T11。）

---

## Task 9: properties-list 动态 options 接入

**Files:**
- Modify: `packages/web/src/components/workflow/workflow-properties-list.tsx`

> 先读该文件确认 `PropertyField` 调用方式（是否已传入整个 node data 或 onChange）。核心：让带 `dynamicOptions` 的 select 字段能读到兄弟字段值（databaseId/table）并异步加载 options。

- [ ] **Step 1: 新增动态 options hook（文件内或新建 `workflow-dynamic-options.ts`）**

```ts
import { useState, useEffect } from 'react';
import { sdk } from '@/lib/sdk';
import type { NodePropertyDynamicOptions } from '@agent-spaces/shared';

export function useDynamicOptions(
  prop: { dynamicOptions?: NodePropertyDynamicOptions },
  nodeData: Record<string, unknown>,
): { options: { label: string; value: string }[]; loading: boolean; placeholderKey?: string } {
  const cfg = prop.dynamicOptions;
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const dbId = cfg ? String(nodeData[cfg.dependsOn] ?? '') : '';
  const table = cfg?.dependsOnTableKey ? String(nodeData[cfg.dependsOnTableKey] ?? '') : '';

  useEffect(() => {
    if (!cfg) return;
    if (!dbId) { setOptions([]); return; }
    if (cfg.source === 'sqlite-columns' && !table) { setOptions([]); return; }
    setLoading(true);
    const p = cfg.source === 'sqlite-tables'
      ? sdk.sqlite.listTables(dbId).then((ts) => ts.map((t) => ({ label: `${t.name} (${t.rowCount})`, value: t.name })))
      : sdk.sqlite.describeTable(dbId, table).then((cs) => {
          const opts = cs.map((c) => ({ label: c.name, value: c.name }));
          return cfg.allOption ? [{ label: '*（全部）', value: '*' }, ...opts] : opts;
        });
    p.then(setOptions).catch(() => setOptions([])).finally(() => setLoading(false));
  }, [dbId, table, cfg?.source]);

  return { options, loading, placeholderKey: cfg?.placeholder };
}
```

- [ ] **Step 2: 在 properties-list 渲染时注入动态 options**

对带 `dynamicOptions` 的 select prop，渲染前用 `useDynamicOptions` 取 options，合并进 prop 后传给 `PropertyField`：
```tsx
// 伪结构：遍历 properties 时
const dyn = useDynamicOptions(prop, nodeData);
const mergedProp = prop.dynamicOptions ? { ...prop, options: dyn.options } : prop;
// <PropertyField prop={mergedProp} ... />
```
（按该文件实际遍历结构接入；若 PropertyField 不直接消费 options，则在 list 层直接渲染 Select。）

- [ ] **Step 3: database 变更时级联重置 table/columns**

在 node data 更新的 onChange 处理中：若改的是 `database` 字段，把同节点的 `table`、`columns` 重置为 `''`/`'*'`（避免脏依赖）。

- [ ] **Step 4: 构建验证**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功。

- [ ] **Step 5: 提交**
```bash
git add packages/web/src/components/workflow/workflow-properties-list.tsx packages/web/src/components/workflow/workflow-dynamic-options.ts
git commit -m "feat(web): property select 支持 sqlite 动态 options（表/列）"
```

---

## Task 10: 通用 ResultTable

**Files:**
- Create: `packages/web/src/components/table/result-table.tsx`

> 复用 sortable-table 同源的 `DataGrid/DataGridTable/DataGridPagination/ScrollArea`。列从 `SqliteQueryResult.columns` 动态生成。

- [ ] **Step 1: 创建 `result-table.tsx`**

```tsx
'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { getCoreRowModel, getSortedRowModel, getPaginationRowModel, useReactTable, type SortingState, type PaginationState } from '@tanstack/react-table';
import { DataGrid, DataGridContainer } from '@/components/reui/data-grid/data-grid';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle } from 'lucide-react';
import type { SqliteQueryResult } from '@agent-spaces/shared';
import { useTranslations } from 'next-intl';

export interface ResultTableProps {
  result: SqliteQueryResult | null;
  isLoading?: boolean;
  error?: string | null;
}

function renderCell(v: unknown): React.ReactNode {
  if (v == null) return <span className="text-muted-foreground/50">NULL</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ResultTable({ result, isLoading = false, error = null }: ResultTableProps) {
  const t = useTranslations();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);

  const rows = result?.rows ?? [];
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    const cols = result?.columns ?? (rows[0] ? Object.keys(rows[0]) : []);
    return cols.map((key) => ({
      accessorKey: key,
      id: key,
      header: key,
      cell: ({ row }) => renderCell(row.original[key]),
      enableSorting: true,
    }));
  }, [result?.columns, rows[0]]);

  useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [result]);

  const table = useReactTable({
    columns, data: rows, state: { pagination, sorting },
    onPaginationChange: setPagination, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount: Math.ceil(rows.length / pagination.pageSize),
  });

  if (isLoading) {
    return <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>;
  }
  if (error) {
    return <div className="flex items-center gap-2 p-4 text-sm text-destructive"><AlertCircle className="size-4" />{error}</div>;
  }
  if (!result || rows.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{t('sqlite.emptyResult')}</div>;
  }

  return (
    <DataGrid table={table} recordCount={rows.length} tableLayout={{ dense: true }}>
      <div className="w-full space-y-2.5">
        {result.truncated && (
          <div className="rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
            {t('sqlite.truncated', { n: 10000 })}
          </div>
        )}
        <DataGridContainer>
          <ScrollArea>
            <DataGridTable />
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  );
}
```

- [ ] **Step 2: 构建验证**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功。

- [ ] **Step 3: 提交**
```bash
git add packages/web/src/components/table/result-table.tsx
git commit -m "feat(web): 新增通用 ResultTable 组件"
```

---

## Task 11: 数据库列表对话框

**Files:**
- Create: `packages/web/src/components/workflow/sqlite-database-list-dialog.tsx`

> 模式参考 `workflow-list-dialog.tsx`、`workflow-info-dialog.tsx`。用 shadcn `Dialog`、`Button`、`Input`、`Select`、`Badge`。`sdk.sqlite` 做 CRUD。

- [ ] **Step 1: 创建对话框**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Eye, Plus, FolderDatabase } from 'lucide-react';
import type { SqliteDatabaseMeta } from '@agent-spaces/shared';
import { SqliteDataBrowserDialog } from './sqlite-data-browser-dialog';

type Filter = 'current' | 'all' | 'unlinked';

export interface SqliteDatabaseListDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode?: 'pick' | 'manage';
  workflowId?: string;          // 当前工作流，用于「当前工作流」过滤默认值
  onPicked?: (id: string) => void;
}

export function SqliteDatabaseListDialog({ open, onOpenChange, mode = 'pick', workflowId, onPicked }: SqliteDatabaseListDialogProps) {
  const t = useTranslations();
  const [list, setList] = useState<SqliteDatabaseMeta[]>([]);
  const [filter, setFilter] = useState<Filter>('current');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<SqliteDatabaseMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [browseId, setBrowseId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setList(await sdk.sqlite.listDatabases()); } catch { setList([]); }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const filtered = list.filter((d) => {
    if (filter === 'current' && (!workflowId || !d.workflowIds.includes(workflowId))) return false;
    if (filter === 'unlinked' && d.workflowIds.length > 0) return false;
    if (keyword && !d.name.toLowerCase().includes(keyword.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm(t('sqlite.confirmDelete'))) return;
    await sdk.sqlite.deleteDatabase(id);
    reload();
  };

  return (
    <>
      <Dialog open={open && !browseId} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FolderDatabase className="size-4" />{t('sqlite.title')}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="current" className="text-xs">{t('sqlite.filterCurrent')}</SelectItem>
                <SelectItem value="all" className="text-xs">{t('sqlite.filterAll')}</SelectItem>
                <SelectItem value="unlinked" className="text-xs">{t('sqlite.filterUnlinked')}</SelectItem>
              </SelectContent>
            </Select>
            <Input className="h-8 flex-1 text-xs" placeholder={t('sqlite.searchPlaceholder')} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCreating(true)}><Plus className="mr-1 size-3.5" />{t('sqlite.create')}</Button>
          </div>
          <div className="max-h-[50vh] space-y-1 overflow-auto">
            {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{t('sqlite.empty')}</div>}
            {filtered.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{d.description || t('sqlite.noDescription')}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.workflowIds.slice(0, 3).map((w) => <Badge key={w} variant="secondary" className="text-[10px]">{w.slice(0, 8)}</Badge>)}
                    {d.workflowIds.length > 3 && <span className="text-[10px] text-muted-foreground">+{d.workflowIds.length - 3}</span>}
                  </div>
                </div>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.browse')} onClick={() => setBrowseId(d.id)}><Eye className="size-3.5" /></Button>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.edit')} onClick={() => setEditing(d)}><Pencil className="size-3.5" /></Button>
                <Button size="icon-sm" variant="ghost" title={t('sqlite.delete')} onClick={() => handleDelete(d.id)}><Trash2 className="size-3.5 text-destructive" /></Button>
                {mode === 'pick' && (
                  <Button size="sm" className="h-7 text-xs" onClick={() => onPicked?.(d.id)}>{t('sqlite.pick')}</Button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {(editing || creating) && (
        <SqliteDatabaseEditDialog
          meta={editing}
          open={!!editing || creating}
          workflowId={workflowId}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={reload}
        />
      )}

      {browseId && (
        <SqliteDataBrowserDialog databaseId={browseId} onClose={() => setBrowseId(null)} />
      )}
    </>
  );
}

// 编辑/新建子对话框
function SqliteDatabaseEditDialog({ meta, open, workflowId, onClose, onSaved }: {
  meta: SqliteDatabaseMeta | null;
  open: boolean;
  workflowId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(meta?.name ?? '');
  const [description, setDescription] = useState(meta?.description ?? '');
  const [workflowIdsText, setWorkflowIdsText] = useState((meta?.workflowIds ?? (workflowId ? [workflowId] : [])).join(', '));

  useEffect(() => {
    setName(meta?.name ?? '');
    setDescription(meta?.description ?? '');
    setWorkflowIdsText((meta?.workflowIds ?? (workflowId ? [workflowId] : [])).join(', '));
  }, [meta, workflowId, open]);

  const save = async () => {
    const workflowIds = workflowIdsText.split(',').map((s) => s.trim()).filter(Boolean);
    if (meta) await sdk.sqlite.updateDatabase(meta.id, { name, description, workflowIds });
    else await sdk.sqlite.createDatabase({ name, description, workflowIds });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{meta ? t('sqlite.edit') : t('sqlite.create')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.name')}</label>
            <Input className="h-8 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.description')}</label>
            <Textarea className="text-xs" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('sqlite.workflowIds')}</label>
            <Input className="h-8 text-xs" value={workflowIdsText} onChange={(e) => setWorkflowIdsText(e.target.value)} placeholder="wf-id1, wf-id2" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{t('sqlite.cancel')}</Button>
            <Button size="sm" onClick={save} disabled={!name.trim()}>{t('sqlite.save')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 与 T8 一起构建验证**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功（依赖 T12 的 SqliteDataBrowserDialog，三者连续实现）。

- [ ] **Step 3: 提交（T8 + T11 + T12 统一提交）**
见 T12。

---

## Task 12: 数据浏览卡

**Files:**
- Create: `packages/web/src/components/workflow/sqlite-data-browser-dialog.tsx`

- [ ] **Step 1: 创建浏览卡**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { sdk } from '@/lib/sdk';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ResultTable } from '@/components/table/result-table';
import type { SqliteTableInfo, SqliteQueryResult, SqliteExecResult } from '@agent-spaces/shared';

export function SqliteDataBrowserDialog({ databaseId, onClose }: {
  databaseId: string;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [tables, setTables] = useState<SqliteTableInfo[]>([]);
  const [activeTable, setActiveTable] = useState<string | null>(null);
  const [result, setResult] = useState<SqliteQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sql, setSql] = useState('');
  const [sqlOpen, setSqlOpen] = useState(false);
  const [execResult, setExecResult] = useState<SqliteExecResult | null>(null);

  const loadTables = useCallback(async () => {
    try { setTables(await sdk.sqlite.listTables(databaseId)); } catch { setTables([]); }
  }, [databaseId]);

  useEffect(() => { loadTables(); }, [loadTables]);

  const browseTable = async (name: string) => {
    setActiveTable(name);
    setLoading(true); setError(null); setExecResult(null);
    try { setResult(await sdk.sqlite.query(databaseId, `SELECT * FROM "${name}" LIMIT ?`, [100])); }
    catch (e) { setError((e as Error).message); setResult(null); }
    finally { setLoading(false); }
  };

  const runSql = async () => {
    setLoading(true); setError(null); setExecResult(null);
    try {
      const mode = /^\s*(select|with|pragma|explain)\b/i.test(sql) ? 'query' : 'exec';
      if (mode === 'query') setResult(await sdk.sqlite.query(databaseId, sql));
      else { const r = await sdk.sqlite.exec(databaseId, sql); setExecResult(r); setResult(null); await loadTables(); }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-5xl">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Table2 className="size-4" />{t('sqlite.browserTitle')}</DialogTitle></DialogHeader>
        <div className="flex min-h-0 gap-3" style={{ height: '70vh' }}>
          <ScrollArea className="w-48 shrink-0 rounded-md border">
            <div className="p-1">
              {tables.map((tb) => (
                <button key={tb.name}
                  onClick={() => browseTable(tb.name)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${activeTable === tb.name ? 'bg-accent font-medium' : ''}`}>
                  <span className="truncate">{tb.name}</span>
                    <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">{tb.rowCount}</span>
                </button>
              ))}
              {tables.length === 0 && <div className="p-3 text-xs text-muted-foreground">{t('sqlite.noTables')}</div>}
            </div>
          </ScrollArea>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2">
              <button className="flex items-center gap-1 text-xs text-muted-foreground" onClick={() => setSqlOpen((v) => !v)}>
                {sqlOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{t('sqlite.runSql')}
              </button>
              {sqlOpen && (
                <div className="mt-1 space-y-1">
                  <Textarea className="font-mono text-xs" rows={3} value={sql} onChange={(e) => setSql(e.target.value)} placeholder={t('sqlite.sqlPlaceholder')} />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={runSql} disabled={!sql.trim()}><Play className="mr-1 size-3" />{t('sqlite.run')}</Button>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <ResultTable result={result} isLoading={loading} error={error} />
              {execResult && (
                <div className="p-2 text-xs text-muted-foreground">{t('sqlite.execSummary', { changes: execResult.changes, id: execResult.lastInsertRowid ?? '-' })}</div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: 构建验证**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功。

- [ ] **Step 3: 提交（T8 + T11 + T12）**
```bash
git add packages/web/src/components/workflow/workflow-fields-sqlite.tsx packages/web/src/components/workflow/workflow-fields-property.tsx packages/web/src/components/workflow/sqlite-database-list-dialog.tsx packages/web/src/components/workflow/sqlite-data-browser-dialog.tsx
git commit -m "feat(web): sqlite 属性 picker + 数据库列表对话框 + 数据浏览卡"
```

---

## Task 13: i18n

**Files:**
- Create: `packages/web/src/locales/zh/sqlite.json`, `packages/web/src/locales/en/sqlite.json`
- Modify: `packages/web/src/locales/zh/nodes.json`, `packages/web/src/locales/en/nodes.json`

- [ ] **Step 1: 创建 `zh/sqlite.json`**

```json
{
  "title": "SQL 数据库",
  "pickerEmpty": "未选择数据库",
  "selectDatabase": "选择数据库",
  "create": "新建",
  "edit": "编辑",
  "delete": "删除",
  "browse": "浏览数据",
  "pick": "选择",
  "name": "名称",
  "description": "描述",
  "noDescription": "无描述",
  "workflowIds": "关联工作流（逗号分隔）",
  "filterCurrent": "当前工作流",
  "filterAll": "全部",
  "filterUnlinked": "未关联",
  "searchPlaceholder": "搜索数据库名称…",
  "empty": "暂无数据库，点击「新建」创建",
  "confirmDelete": "删除将同时移除该数据库文件，确定继续？",
  "save": "保存",
  "cancel": "取消",
  "browserTitle": "数据浏览",
  "noTables": "暂无表，可在右侧执行 SQL 建表",
  "runSql": "执行 SQL",
  "run": "运行",
  "sqlPlaceholder": "SELECT * FROM users  或  CREATE TABLE ...",
  "emptyResult": "无数据",
  "truncated": "结果已截断至 {n} 行",
  "execSummary": "影响 {changes} 行，最后插入 ID：{id}"
}
```

- [ ] **Step 2: 创建 `en/sqlite.json`**

```json
{
  "title": "SQL Databases",
  "pickerEmpty": "No database selected",
  "selectDatabase": "Select database",
  "create": "New",
  "edit": "Edit",
  "delete": "Delete",
  "browse": "Browse data",
  "pick": "Select",
  "name": "Name",
  "description": "Description",
  "noDescription": "No description",
  "workflowIds": "Linked workflows (comma-separated)",
  "filterCurrent": "Current workflow",
  "filterAll": "All",
  "filterUnlinked": "Unlinked",
  "searchPlaceholder": "Search databases…",
  "empty": "No databases yet. Click \"New\" to create one.",
  "confirmDelete": "Deleting will also remove the database file. Continue?",
  "save": "Save",
  "cancel": "Cancel",
  "browserTitle": "Data Browser",
  "noTables": "No tables yet. Run SQL on the right to create one.",
  "runSql": "Run SQL",
  "run": "Run",
  "sqlPlaceholder": "SELECT * FROM users  or  CREATE TABLE ...",
  "emptyResult": "No rows",
  "truncated": "Result truncated to {n} rows",
  "execSummary": "{changes} row(s) affected, last insert id: {id}"
}
```

- [ ] **Step 3: 在 `nodes.json`（zh/en）补 key**

在 zh `nodes.json` 的 `categories` 下加 `"sqlite": "数据库"`；并新增 `sqlite` 节点组（节点的 label/description/props）。参考已有节点（如 `table_display`）结构，加入：

zh 片段：
```json
{
  "categories": { "sqlite": "数据库" },
  "sqlite": {
    "props": {
      "database": "数据库",
      "database_tooltip": "选择本工作空间下的一个 SQL 数据库",
      "table": "表",
      "columns": "列",
      "selectDbFirst": "请先选择数据库",
      "selectTableFirst": "请先选择表",
      "where": "条件 (WHERE)",
      "where_tooltip": "SQL 片段，值用 ? 占位，从输入字段绑定。如：age > ?",
      "orderBy": "排序 (ORDER BY)",
      "limit": "行数上限",
      "fields": "字段",
      "fields_tooltip": "每行一个列与值，值用 ? 占位",
      "setFields": "设置字段",
      "column": "列",
      "value": "值",
      "sql": "SQL",
      "sql_tooltip": "原生 SQL，? 占位符从输入字段绑定",
      "mode": "模式",
      "modeQuery": "查询(返回行)",
      "modeExec": "执行(写入/DDL)"
    }
  },
  "sqlite_query": { "label": "查询数据", "description": "从选定的表查询数据，返回行数组。" },
  "sqlite_insert": { "label": "新增数据", "description": "向表中插入一行或多行。" },
  "sqlite_update": { "label": "更新数据", "description": "按条件更新表中的数据。" },
  "sqlite_delete": { "label": "删除数据", "description": "按条件删除表中的数据。" },
  "sqlite_raw": { "label": "SQL 自定义", "description": "执行任意原生 SQL，? 参数从输入字段绑定。" }
}
```

en 片段（对应英文）：
```json
{
  "categories": { "sqlite": "Database" },
  "sqlite": {
    "props": {
      "database": "Database",
      "database_tooltip": "Pick a SQL database in this workspace",
      "table": "Table",
      "columns": "Columns",
      "selectDbFirst": "Select a database first",
      "selectTableFirst": "Select a table first",
      "where": "WHERE",
      "where_tooltip": "SQL fragment; use ? for values bound from input fields. e.g. age > ?",
      "orderBy": "ORDER BY",
      "limit": "Row limit",
      "fields": "Fields",
      "fields_tooltip": "One row per column/value; values use ? placeholder",
      "setFields": "Set fields",
      "column": "Column",
      "value": "Value",
      "sql": "SQL",
      "sql_tooltip": "Raw SQL; ? placeholders bind from input fields",
      "mode": "Mode",
      "modeQuery": "Query (returns rows)",
      "modeExec": "Exec (write/DDL)"
    }
  },
  "sqlite_query": { "label": "Query Data", "description": "Query rows from a selected table." },
  "sqlite_insert": { "label": "Insert Data", "description": "Insert rows into a table." },
  "sqlite_update": { "label": "Update Data", "description": "Update rows in a table by condition." },
  "sqlite_delete": { "label": "Delete Data", "description": "Delete rows from a table by condition." },
  "sqlite_raw": { "label": "Custom SQL", "description": "Run arbitrary SQL; ? params bind from input fields." }
}
```

> 合并到现有 nodes.json 时保留其原有内容，仅追加 `categories.sqlite` 与上述 key。

- [ ] **Step 4: 注册 sqlite 命名空间**

确认 next-intl 的命名空间注册方式（通常在 `src/i18n/` 配置或 `request.ts` 自动加载 `locales/{lang}/*.json`）。若需显式列出命名空间，加入 `sqlite`。

- [ ] **Step 5: 构建验证**
```bash
cd packages/web && pnpm build
```
Expected: 编译成功，无 i18n key 缺失警告。

- [ ] **Step 6: 提交**
```bash
git add packages/web/src/locales/zh/sqlite.json packages/web/src/locales/en/sqlite.json packages/web/src/locales/zh/nodes.json packages/web/src/locales/en/nodes.json
git commit -m "feat(web): 新增 sqlite i18n 命名空间与节点文案"
```

---

## Task 14: 集成验证

**Files:** 无（仅验证）

- [ ] **Step 1: 全量构建（按依赖顺序）**
```bash
cd packages/shared && pnpm build && cd ../sdk && pnpm build && cd ../server && pnpm build && cd ../web && pnpm build
```
Expected: 四个包全部编译成功，无类型错误。

- [ ] **Step 2: 后端测试全跑**
```bash
cd packages/server && node --test --import tsx test/sql-safety.test.ts test/sqlite-store.test.ts test/mini-app-db.test.ts
```
Expected: 全部 PASS（含 mini-app-db 不回归）。

- [ ] **Step 3: Lint**
```bash
pnpm lint
```
Expected: 无新增 lint 错误。

- [ ] **Step 4: 手动验证（参照 spec §11）**

启动 `pnpm dev`，在工作流编辑器：
1. 新建数据库 `db1`（关联当前工作流）→ 列表默认可见。
2. 浏览卡执行 `CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)` → 表列表出现 users。
3. 插入数据 → 选表浏览可见、分页正常。
4. `sqlite_insert` 节点配置（表动态下拉显示 users，列动态下拉显示 id/name）→ 执行 → 浏览卡确认写入。
5. `sqlite_query` 节点输出 rows；`sqlite_update`/`sqlite_delete` 输出 changes。
6. `sqlite_raw` 执行查询与 exec。
7. 注入测试：raw 执行 `ATTACH...` 被拒；专用节点 table 无法填非法字符（前端 select 约束 + 后端白名单）。
8. 删除数据库 → 文件消失、列表不再显示。

- [ ] **Step 5: 收尾提交（如有验证修复）**
```bash
git add -A && git commit -m "fix: 集成验证修复" || echo "no changes"
```

---

## Self-Review 记录

- **Spec 覆盖**：§2 决策→T2/T3/T6；§3 数据模型→T1；§4 后端→T2/T3/T4/T5；§5 节点→T6；§6 执行→T7（前端调试无需改动，已确认）；§7 前端→T8/T9/T10/T11/T12；§8 i18n→T13；§9 测试→T2/T3；§11 验证→T14。全覆盖。
- **driver 修正**：spec 未指定 driver，本计划明确用 `node:sqlite`（与 database-store/kanban-store 一致），`sql-safety` 纯函数仍被 better-sqlite3 的 mini-app-db 复用。
- **已知校验点（执行时确认）**：(1) `OutputField.type` 是否支持 `'object[]'`（T6）；(2) `http.get` 是否接受 query 对象（T5）；(3) `StatementSync.columns()` 是否可用，否则退化取首行 keys（T3）；(4) next-intl 命名空间注册方式（T13）。
