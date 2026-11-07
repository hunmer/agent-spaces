import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import type { DatabaseMeta, DatabaseNodeVersion, DatabaseVectorSearchResult, DatabaseVectorStats, DocNode } from '@agent-spaces/shared';
import { getDataDir, ensureDir } from './json-store.js';

let db: DatabaseSync | null = null;

function openDb(): DatabaseSync {
  if (db) return db;
  const dir = join(getDataDir(), 'database');
  ensureDir(dir);
  db = new DatabaseSync(join(dir, 'database.sqlite'));
  const hasDocNodes = Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'doc_nodes'").get());
  const hasDatabaseId = hasDocNodes
    && (db.prepare('PRAGMA table_info(doc_nodes)').all() as Record<string, unknown>[])
      .some((column) => column.name === 'database_id');
  if (hasDocNodes && !hasDatabaseId) {
    db.exec('DROP TABLE IF EXISTS doc_nodes; DROP TABLE IF EXISTS databases;');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      embedding_model_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS doc_nodes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      database_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      parent_id TEXT,
      is_trash INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS database_embeddings (
      workspace_id TEXT NOT NULL,
      database_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model_id TEXT NOT NULL DEFAULT '',
      agent_id TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, database_id, node_id)
    );

    CREATE TABLE IF NOT EXISTS doc_node_versions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      database_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      patch_json TEXT NOT NULL,
      old_hash TEXT NOT NULL,
      new_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_databases_workspace ON databases(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_doc_nodes_workspace ON doc_nodes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_doc_nodes_database ON doc_nodes(workspace_id, database_id);
    CREATE INDEX IF NOT EXISTS idx_doc_nodes_parent ON doc_nodes(workspace_id, database_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_database_embeddings_database ON database_embeddings(workspace_id, database_id);
    CREATE INDEX IF NOT EXISTS idx_doc_node_versions_node ON doc_node_versions(workspace_id, database_id, node_id, created_at DESC);
  `);
  ensureColumn('databases', 'embedding_model_id', 'TEXT');
  migrateEmbeddingModelColumn();
  return db;
}

function ensureColumn(table: string, column: string, type: string): void {
  const database = db!;
  const exists = (database.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[])
    .some((item) => item.name === column);
  if (!exists) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function migrateEmbeddingModelColumn(): void {
  const database = db!;
  const columns = database.prepare('PRAGMA table_info(databases)').all() as Record<string, unknown>[];
  const hasLegacyAgentColumn = columns.some((item) => item.name === 'embedding_agent_id');
  if (!hasLegacyAgentColumn) return;
  database.exec(`
    UPDATE databases
    SET embedding_model_id = COALESCE(embedding_model_id, embedding_agent_id)
    WHERE embedding_agent_id IS NOT NULL AND embedding_agent_id != ''
  `);
}

function rowToDatabase(row: Record<string, unknown>): DatabaseMeta {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    description: row.description as string,
    embeddingModelId: (row.embedding_model_id as string | null) || undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToNode(row: Record<string, unknown>): DocNode {
  return {
    id: row.id as string,
    databaseId: row.database_id as string,
    title: row.title as string,
    icon: row.icon as string,
    cover: row.cover as string,
    content: row.content as string,
    parentId: (row.parent_id as string) || null,
    isTrash: !!row.is_trash,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  };
}

function rowToVersionRow(row: Record<string, unknown>): StoredNodeVersion {
  return {
    id: row.id as string,
    nodeId: row.node_id as string,
    databaseId: row.database_id as string,
    title: row.title as string,
    patch: JSON.parse(row.patch_json as string) as ContentPatch,
    oldHash: row.old_hash as string,
    newHash: row.new_hash as string,
    createdAt: row.created_at as number,
  };
}

export function listDatabases(workspaceId: string): DatabaseMeta[] {
  const database = openDb();
  const rows = database.prepare(
    'SELECT * FROM databases WHERE workspace_id = ? ORDER BY created_at ASC'
  ).all(workspaceId);
  return (rows as Record<string, unknown>[]).map(rowToDatabase);
}

export function getDatabase(workspaceId: string, databaseId: string): DatabaseMeta | null {
  const database = openDb();
  const row = database.prepare(
    'SELECT * FROM databases WHERE workspace_id = ? AND id = ?'
  ).get(workspaceId, databaseId) as Record<string, unknown> | undefined;
  return row ? rowToDatabase(row) : null;
}

export function getDefaultDatabase(workspaceId: string): DatabaseMeta {
  const existing = listDatabases(workspaceId)[0];
  if (existing) return existing;
  return createDatabase(workspaceId, { name: 'Default Database' });
}

export function createDatabase(
  workspaceId: string,
  input: Partial<Pick<DatabaseMeta, 'id' | 'name' | 'description'>>,
): DatabaseMeta {
  const database = openDb();
  const id = input.id || uuid();
  const now = Date.now();
  database.prepare(
    `INSERT INTO databases (id, workspace_id, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, input.name?.trim() || 'Untitled Database', input.description || '', now, now);
  return getDatabase(workspaceId, id)!;
}

export function updateDatabase(
  workspaceId: string,
  databaseId: string,
  updates: Partial<Pick<DatabaseMeta, 'name' | 'description' | 'embeddingModelId'>>,
): DatabaseMeta | null {
  const existing = getDatabase(workspaceId, databaseId);
  if (!existing) return null;
  const database = openDb();
  const merged = { ...existing, ...updates, updatedAt: Date.now() };
  database.prepare(
    'UPDATE databases SET name = ?, description = ?, embedding_model_id = ?, updated_at = ? WHERE workspace_id = ? AND id = ?'
  ).run(merged.name.trim() || 'Untitled Database', merged.description, merged.embeddingModelId ?? null, merged.updatedAt, workspaceId, databaseId);
  return getDatabase(workspaceId, databaseId);
}

export function deleteDatabase(workspaceId: string, databaseId: string): boolean {
  const database = openDb();
  database.prepare('DELETE FROM doc_nodes WHERE workspace_id = ? AND database_id = ?').run(workspaceId, databaseId);
  database.prepare('DELETE FROM database_embeddings WHERE workspace_id = ? AND database_id = ?').run(workspaceId, databaseId);
  const result = database.prepare('DELETE FROM databases WHERE workspace_id = ? AND id = ?').run(workspaceId, databaseId) as { changes: number };
  if (result.changes > 0 && listDatabases(workspaceId).length === 0) getDefaultDatabase(workspaceId);
  return result.changes > 0;
}

export function listNodes(workspaceId: string, databaseId?: string): DocNode[] {
  const database = openDb();
  const activeDatabaseId = databaseId ?? getDefaultDatabase(workspaceId).id;
  const rows = database.prepare(
    'SELECT * FROM doc_nodes WHERE workspace_id = ? AND database_id = ? ORDER BY created_at ASC'
  ).all(workspaceId, activeDatabaseId);
  return (rows as Record<string, unknown>[]).map(rowToNode);
}

export function getNode(workspaceId: string, nodeId: string, databaseId?: string): DocNode | null {
  const database = openDb();
  const row = databaseId
    ? database.prepare('SELECT * FROM doc_nodes WHERE workspace_id = ? AND database_id = ? AND id = ?').get(workspaceId, databaseId, nodeId)
    : database.prepare('SELECT * FROM doc_nodes WHERE workspace_id = ? AND id = ?').get(workspaceId, nodeId);
  return row ? rowToNode(row as Record<string, unknown>) : null;
}

export function createNode(workspaceId: string, node: Partial<DocNode>): DocNode {
  const database = openDb();
  const databaseId = node.databaseId || getDefaultDatabase(workspaceId).id;
  if (!getDatabase(workspaceId, databaseId)) throw new Error(`Database not found: ${databaseId}`);
  const id = node.id || uuid();
  const now = Date.now();
  database.prepare(
    `INSERT INTO doc_nodes (id, workspace_id, database_id, title, icon, cover, content, parent_id, is_trash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    workspaceId,
    databaseId,
    node.title || 'Untitled Document',
    node.icon || '\u{1F4DD}',
    node.cover || '',
    node.content || '',
    node.parentId ?? null,
    node.isTrash ? 1 : 0,
    node.createdAt || now,
    node.updatedAt || now,
  );
  return getNode(workspaceId, id, databaseId)!;
}

export function updateNode(workspaceId: string, nodeId: string, updates: Partial<DocNode>, databaseId?: string): DocNode | null {
  const existing = getNode(workspaceId, nodeId, databaseId);
  if (!existing) return null;
  const database = openDb();
  const merged = { ...existing, ...updates, updatedAt: Date.now() };
  if (Object.hasOwn(updates, 'content') && merged.content !== existing.content) {
    insertNodeVersion(database, workspaceId, existing, merged.content);
  }
  database.prepare(
    `UPDATE doc_nodes SET title = ?, icon = ?, cover = ?, content = ?, parent_id = ?, is_trash = ?, updated_at = ?
     WHERE workspace_id = ? AND database_id = ? AND id = ?`
  ).run(
    merged.title,
    merged.icon,
    merged.cover,
    merged.content,
    merged.parentId,
    merged.isTrash ? 1 : 0,
    merged.updatedAt,
    workspaceId,
    existing.databaseId,
    nodeId,
  );
  return getNode(workspaceId, nodeId, existing.databaseId);
}

export function listNodeVersions(workspaceId: string, nodeId: string, databaseId?: string, limit = 50): DatabaseNodeVersion[] {
  const node = getNode(workspaceId, nodeId, databaseId);
  if (!node) return [];
  const database = openDb();
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;
  const rows = database.prepare(
    `SELECT * FROM doc_node_versions
     WHERE workspace_id = ? AND database_id = ? AND node_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(workspaceId, node.databaseId, nodeId, normalizedLimit) as Record<string, unknown>[];
  const stored = rows.map(rowToVersionRow);
  let after = node.content;

  return stored.map((item) => {
    const before = applyReversePatch(after, item.patch);
    const version: DatabaseNodeVersion = {
      id: item.id,
      nodeId: item.nodeId,
      databaseId: item.databaseId,
      title: item.title,
      patch: item.patch,
      oldContent: before,
      newContent: after,
      createdAt: item.createdAt,
    };
    after = before;
    return version;
  });
}

export function deleteNode(workspaceId: string, nodeId: string, databaseId?: string): boolean {
  const database = openDb();
  const existing = getNode(workspaceId, nodeId, databaseId);
  if (!existing) return false;
  database.prepare('DELETE FROM database_embeddings WHERE workspace_id = ? AND database_id = ? AND node_id = ?')
    .run(workspaceId, existing.databaseId, nodeId);
  database.prepare('DELETE FROM doc_node_versions WHERE workspace_id = ? AND database_id = ? AND node_id = ?')
    .run(workspaceId, existing.databaseId, nodeId);
  const result = database.prepare(
    'DELETE FROM doc_nodes WHERE workspace_id = ? AND database_id = ? AND id = ?'
  ).run(workspaceId, existing.databaseId, nodeId) as { changes: number };
  return result.changes > 0;
}

interface ContentPatch {
  start: number;
  deleteText: string;
  insertText: string;
}

interface StoredNodeVersion {
  id: string;
  nodeId: string;
  databaseId: string;
  title: string;
  patch: ContentPatch;
  oldHash: string;
  newHash: string;
  createdAt: number;
}

function insertNodeVersion(database: DatabaseSync, workspaceId: string, existing: DocNode, nextContent: string): void {
  const patch = createContentPatch(existing.content, nextContent);
  database.prepare(
    `INSERT INTO doc_node_versions
      (id, workspace_id, database_id, node_id, title, patch_json, old_hash, new_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    workspaceId,
    existing.databaseId,
    existing.id,
    existing.title,
    JSON.stringify(patch),
    hashContent(existing.content),
    hashContent(nextContent),
    Date.now(),
  );
}

function createContentPatch(oldContent: string, newContent: string): ContentPatch {
  let start = 0;
  while (
    start < oldContent.length
    && start < newContent.length
    && oldContent[start] === newContent[start]
  ) {
    start++;
  }

  let oldEnd = oldContent.length;
  let newEnd = newContent.length;
  while (
    oldEnd > start
    && newEnd > start
    && oldContent[oldEnd - 1] === newContent[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }

  return {
    start,
    deleteText: oldContent.slice(start, oldEnd),
    insertText: newContent.slice(start, newEnd),
  };
}

function applyReversePatch(content: string, patch: ContentPatch): string {
  const insertEnd = patch.start + patch.insertText.length;
  return `${content.slice(0, patch.start)}${patch.deleteText}${content.slice(insertEnd)}`;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function moveNode(workspaceId: string, nodeId: string, newParentId: string | null, databaseId?: string): DocNode | null {
  return updateNode(workspaceId, nodeId, { parentId: newParentId }, databaseId);
}

export function trashNode(workspaceId: string, nodeId: string, databaseId?: string): DocNode | null {
  return updateNode(workspaceId, nodeId, { isTrash: true }, databaseId);
}

export function restoreNode(workspaceId: string, nodeId: string, databaseId?: string): DocNode | null {
  const node = getNode(workspaceId, nodeId, databaseId);
  if (!node) return null;
  if (node.parentId) {
    const parent = getNode(workspaceId, node.parentId, node.databaseId);
    if (parent && parent.isTrash) {
      return updateNode(workspaceId, nodeId, { isTrash: false, parentId: null }, node.databaseId);
    }
  }
  return updateNode(workspaceId, nodeId, { isTrash: false }, node.databaseId);
}

export function getVectorStats(workspaceId: string, databaseId: string): DatabaseVectorStats {
  const database = openDb();
  const meta = getDatabase(workspaceId, databaseId);
  const indexed = database.prepare(
    'SELECT COUNT(*) AS count, MAX(updated_at) AS last_indexed_at FROM database_embeddings WHERE workspace_id = ? AND database_id = ?'
  ).get(workspaceId, databaseId) as { count: number; last_indexed_at: number | null };
  const nodes = database.prepare(
    'SELECT COUNT(*) AS count FROM doc_nodes WHERE workspace_id = ? AND database_id = ? AND is_trash = 0'
  ).get(workspaceId, databaseId) as { count: number };
  return {
    databaseId,
    embeddingModelId: meta?.embeddingModelId ?? null,
    indexedCount: indexed.count,
    nodeCount: nodes.count,
    lastIndexedAt: indexed.last_indexed_at,
  };
}

export function setDatabaseEmbeddingModel(workspaceId: string, databaseId: string, embeddingModelId: string | null): DatabaseMeta | null {
  return updateDatabase(workspaceId, databaseId, { embeddingModelId: embeddingModelId ?? undefined });
}

export interface DatabaseEmbeddingRecord {
  nodeId: string;
  title: string;
  path: string;
  content: string;
  contentHash: string;
  embedding: number[];
  modelId: string;
  agentId: string;
}

export function upsertDatabaseEmbedding(workspaceId: string, databaseId: string, record: DatabaseEmbeddingRecord): void {
  const database = openDb();
  database.prepare(
    `INSERT INTO database_embeddings
      (workspace_id, database_id, node_id, title, path, content, content_hash, embedding, model_id, agent_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, database_id, node_id) DO UPDATE SET
      title = excluded.title,
      path = excluded.path,
      content = excluded.content,
      content_hash = excluded.content_hash,
      embedding = excluded.embedding,
      model_id = excluded.model_id,
      agent_id = excluded.agent_id,
      updated_at = excluded.updated_at`
  ).run(
    workspaceId,
    databaseId,
    record.nodeId,
    record.title,
    record.path,
    record.content,
    record.contentHash,
    JSON.stringify(record.embedding),
    record.modelId,
    record.agentId,
    Date.now(),
  );
}

export function deleteStaleDatabaseEmbeddings(workspaceId: string, databaseId: string, activeNodeIds: string[]): number {
  const database = openDb();
  if (activeNodeIds.length === 0) {
    const result = database.prepare('DELETE FROM database_embeddings WHERE workspace_id = ? AND database_id = ?')
      .run(workspaceId, databaseId) as { changes: number };
    return result.changes;
  }
  const placeholders = activeNodeIds.map(() => '?').join(',');
  const result = database.prepare(
    `DELETE FROM database_embeddings WHERE workspace_id = ? AND database_id = ? AND node_id NOT IN (${placeholders})`
  ).run(workspaceId, databaseId, ...activeNodeIds) as { changes: number };
  return result.changes;
}

export function listDatabaseEmbeddings(workspaceId: string, databaseId: string): Array<DatabaseVectorSearchResult & { embedding: number[] }> {
  const database = openDb();
  const rows = database.prepare(
    'SELECT node_id, title, path, content, embedding, updated_at FROM database_embeddings WHERE workspace_id = ? AND database_id = ?'
  ).all(workspaceId, databaseId) as Record<string, unknown>[];
  return rows.map((row) => ({
    nodeId: row.node_id as string,
    title: row.title as string,
    path: row.path as string,
    content: row.content as string,
    score: 0,
    updatedAt: row.updated_at as number,
    embedding: JSON.parse(row.embedding as string) as number[],
  }));
}

export function closeDb(): void {
  if (db) { db.close(); db = null; }
}
