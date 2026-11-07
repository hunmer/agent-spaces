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
  description: string;
  indexed: boolean;
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
