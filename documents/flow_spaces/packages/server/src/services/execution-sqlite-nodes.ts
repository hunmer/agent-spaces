import * as sqliteStore from '../storage/sqlite-store.js';
import { validateIdentifier } from '../storage/sql-safety.js';
import { getInputFieldValues, resolveWhereParams } from './execution-node-helpers.js';

export function executeSqliteQuery(
  resolvedData: Record<string, any>,
): { rows: unknown[]; rowCount: number } {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const colsRaw = resolvedData.columns === '*' || !resolvedData.columns ? '*' : String(resolvedData.columns);
  const { clause, paramCount } = resolveWhereParams(String(resolvedData.where || ''));
  const order = resolvedData.orderBy ? ` ORDER BY ${resolvedData.orderBy}` : '';
  const limit = Number(resolvedData.limit) > 0 ? Number(resolvedData.limit) : 1000;
  let sql = `SELECT ${colsRaw} FROM "${table}"`;
  if (clause) sql += ` WHERE ${clause}`;
  sql += `${order} LIMIT ?`;
  const fieldValues = getInputFieldValues(resolvedData).slice(0, paramCount);
  const result = sqliteStore.query(dbId, sql, [...fieldValues, limit]);
  return { rows: result.rows, rowCount: result.rowCount };
}

export function executeSqliteInsert(
  resolvedData: Record<string, any>,
): { insertedId: number | null; changes: number } {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const fields = Array.isArray(resolvedData.fields) ? resolvedData.fields : [];
  const columns = fields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
  const placeholders = columns.map(() => '?').join(',');
  const sql = `INSERT INTO "${table}" (${columns.join(',')}) VALUES (${placeholders})`;
  const fieldValues = getInputFieldValues(resolvedData);
  const params = fields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
  const r = sqliteStore.exec(dbId, sql, params);
  return { insertedId: r.lastInsertRowid, changes: r.changes };
}

export function executeSqliteUpdate(
  resolvedData: Record<string, any>,
): { changes: number } {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const setFields = Array.isArray(resolvedData.setFields) ? resolvedData.setFields : [];
  const columns = setFields.map((f: any) => { validateIdentifier(String(f.column), 'column'); return String(f.column); });
  const setClause = columns.map((c) => `${c} = ?`).join(', ');
  const { clause, paramCount } = resolveWhereParams(String(resolvedData.where || ''));
  let sql = `UPDATE "${table}" SET ${setClause}`;
  if (clause) sql += ` WHERE ${clause}`;
  const fieldValues = getInputFieldValues(resolvedData);
  const setParams = setFields.map((f: any, i: number) => fieldValues[i] ?? f.value ?? null);
  const whereParams = fieldValues.slice(setFields.length, setFields.length + paramCount);
  const r = sqliteStore.exec(dbId, sql, [...setParams, ...whereParams]);
  return { changes: r.changes };
}

export function executeSqliteDelete(
  resolvedData: Record<string, any>,
): { changes: number } {
  const dbId = String(resolvedData.database || '');
  const table = String(resolvedData.table || '');
  validateIdentifier(table, 'table');
  const { clause, paramCount } = resolveWhereParams(String(resolvedData.where || ''));
  let sql = `DELETE FROM "${table}"`;
  if (clause) sql += ` WHERE ${clause}`;
  const fieldValues = getInputFieldValues(resolvedData).slice(0, paramCount);
  const r = sqliteStore.exec(dbId, sql, fieldValues);
  return { changes: r.changes };
}

export function executeSqliteRaw(
  resolvedData: Record<string, any>,
): { rows: unknown[]; rowCount?: number; execResult?: { changes: number; lastInsertRowid: number | null } } {
  const dbId = String(resolvedData.database || '');
  const sql = String(resolvedData.sql || '');
  const mode = String(resolvedData.mode || 'query');
  const params = getInputFieldValues(resolvedData).slice(0, (sql.match(/\?/g) || []).length);
  if (mode === 'exec') {
    const r = sqliteStore.exec(dbId, sql, params);
    return { rows: [], execResult: r };
  }
  const r = sqliteStore.query(dbId, sql, params);
  return { rows: r.rows, rowCount: r.rowCount };
}
