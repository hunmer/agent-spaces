import type { HttpClient } from '../client';
import type {
  SqliteDatabaseMeta,
  SqliteTableInfo,
  SqliteColumnInfo,
  SqliteQueryResult,
  SqliteExecResult,
} from '@agent-spaces/shared';

export function createSqliteApi(http: HttpClient) {
  return {
    listDatabases: (workflowId?: string): Promise<SqliteDatabaseMeta[]> =>
      // HttpClient.get 不接受 query 对象（第二参数为 RequestOptions），故手工拼接 URL
      http.get(
        workflowId
          ? `/api/sqlite/databases?workflowId=${encodeURIComponent(workflowId)}`
          : '/api/sqlite/databases',
      ),

    createDatabase: (
      input: { name: string; description?: string; workflowIds?: string[] },
    ): Promise<SqliteDatabaseMeta> => http.post('/api/sqlite/databases', input),

    updateDatabase: (
      id: string,
      updates: Partial<Pick<SqliteDatabaseMeta, 'name' | 'description' | 'workflowIds'>>,
    ): Promise<SqliteDatabaseMeta> =>
      http.patch(`/api/sqlite/databases/${id}`, updates),

    deleteDatabase: (id: string): Promise<void> =>
      http.deleteOf<{ ok: boolean }>(`/api/sqlite/databases/${id}`).then(() => undefined),

    listTables: (id: string): Promise<SqliteTableInfo[]> =>
      http.get(`/api/sqlite/databases/${id}/tables`),

    describeTable: (id: string, table: string): Promise<SqliteColumnInfo[]> =>
      http.get(
        `/api/sqlite/databases/${id}/tables/${encodeURIComponent(table)}/columns`,
      ),

    query: (id: string, sql: string, params?: unknown[]): Promise<SqliteQueryResult> =>
      http.post(`/api/sqlite/databases/${id}/query`, { sql, params }),

    exec: (id: string, sql: string, params?: unknown[]): Promise<SqliteExecResult> =>
      http.post(`/api/sqlite/databases/${id}/exec`, { sql, params }),
  };
}
