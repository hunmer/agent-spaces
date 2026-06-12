// SQLite 连接与执行层（better-sqlite3）。
// 本文件分两阶段落地：Task 2 只含纯函数校验；Task 3 追加连接管理与执行。
import Database from 'better-sqlite3';
import { join, resolve, sep, dirname } from 'node:path';
import { ensureDir, getDataDir } from './json-store.js';

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

// 数组 → 按位置展开；对象 → 包成单参（better-sqlite3 命名占位符 :name/@name/$name）；undefined → 空参数
export function bindArgs(params: SqlParams | undefined): unknown[] {
  if (params == null) return [];
  return Array.isArray(params) ? params : [params];
}

type DbConnection = InstanceType<typeof Database>;
type ExecMode = 'all' | 'get' | 'run' | 'exec';

// 连接池：按 `projectId/dbName` 复用，避免每次请求重开文件。
const POOL = new Map<string, DbConnection>();

// 解析 db 文件绝对路径，越界保护（不依赖 store，避免循环依赖；与 store.baseDir 同源）。
function dbFilePath(projectId: string, dbName: string): string {
  const root = resolve(join(getDataDir(), 'mini-apps', projectId, 'data', 'db'));
  const target = resolve(root, `${dbName}.sqlite`);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Path escapes project db directory: ${dbName}`);
  }
  return target;
}

export function openDb(projectId: string, dbName: string): DbConnection {
  validateDbName(dbName);
  const key = `${projectId}/${dbName}`;
  const cached = POOL.get(key);
  if (cached) return cached;
  const fullPath = dbFilePath(projectId, dbName);
  ensureDir(dirname(fullPath));
  const db = new Database(fullPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  POOL.set(key, db);
  return db;
}

export function executeDb(
  projectId: string,
  dbName: string,
  mode: ExecMode,
  sql: string,
  params?: SqlParams,
): unknown {
  checkSql(sql);
  const db = openDb(projectId, dbName);
  if (mode === 'exec') {
    db.exec(sql);
    return undefined;
  }
  const stmt = db.prepare(sql);
  const args = bindArgs(params);
  if (mode === 'all') {
    const rows = stmt.all(...args);
    if (rows.length > MAX_ROWS) throw new Error(`Result exceeds ${MAX_ROWS} rows`);
    return rows;
  }
  if (mode === 'get') {
    return stmt.get(...args) ?? null;
  }
  const r = stmt.run(...args);
  return { changes: r.changes, lastInsertRowid: r.lastInsertRowid as number | bigint };
}

export function executeDbTransaction(
  projectId: string,
  dbName: string,
  statements: { sql: string; params?: SqlParams }[],
): void {
  for (const s of statements) checkSql(s.sql);
  const db = openDb(projectId, dbName);
  const runTx = db.transaction(() => {
    for (const { sql, params } of statements) {
      db.prepare(sql).run(...bindArgs(params));
    }
  });
  runTx(); // 抛错则 better-sqlite3 自动回滚整个事务
}

export function closeProjectDbs(projectId: string): void {
  const prefix = `${projectId}/`;
  for (const [key, db] of POOL) {
    if (key.startsWith(prefix)) {
      try { db.close(); } catch { /* noop */ }
      POOL.delete(key);
    }
  }
}
