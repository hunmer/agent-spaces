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
  openDb(meta.id);
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
  // StatementSync.columns() available on Node 22.5+. Verified working in this env
  // (returns column list even for empty result sets, which is the preferred behavior).
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
