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
