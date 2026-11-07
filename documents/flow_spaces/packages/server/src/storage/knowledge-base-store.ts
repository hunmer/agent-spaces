import { join } from 'node:path';
import { existsSync, rmSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuid } from 'uuid';
import { getDataDir, ensureDir } from './json-store.js';
import type {
  KnowledgeBase, KbFile, KnowledgeBaseStats,
  KbFileIndexStatus, KbFileSourceType,
} from '@agent-spaces/shared';

let DB: DatabaseSync | null = null;

function dbFile(): string {
  const dir = join(getDataDir(), 'knowledge-bases');
  ensureDir(dir);
  return join(dir, 'knowledge-bases.sqlite');
}

function openDb(): DatabaseSync {
  if (DB) return DB;
  const db = new DatabaseSync(dbFile());
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS kbs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      embedding_model_id TEXT,
      chunk_size INTEGER NOT NULL DEFAULT 1000,
      chunk_overlap INTEGER NOT NULL DEFAULT 200,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_files (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      size INTEGER NOT NULL DEFAULT 0,
      source_type TEXT NOT NULL DEFAULT 'upload',
      source_ref TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      extracted_text TEXT NOT NULL DEFAULT '',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      index_status TEXT NOT NULL DEFAULT 'pending',
      index_error TEXT,
      indexed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_files_kb ON kb_files(kb_id);
    CREATE TABLE IF NOT EXISTS kb_chunks (
      chunk_id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      model_id TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_id);
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON kb_chunks(kb_id);
  `);
  DB = db;
  return db;
}

function kbDir(kbId: string): string {
  return join(getDataDir(), 'knowledge-bases', kbId);
}
export function ensureKbDir(kbId: string): string {
  const dir = join(kbDir(kbId), 'files');
  ensureDir(dir);
  return dir;
}
export function removeKbDir(kbId: string): void {
  const dir = kbDir(kbId);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

const now = () => Date.now();

function mapKb(r: Record<string, unknown>): KnowledgeBase {
  return {
    id: r.id as string, workspaceId: r.workspace_id as string,
    name: r.name as string, description: r.description as string,
    embeddingModelId: (r.embedding_model_id as string) ?? null,
    chunkSize: r.chunk_size as number, chunkOverlap: r.chunk_overlap as number,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}
function mapFile(r: Record<string, unknown>): KbFile {
  return {
    id: r.id as string, kbId: r.kb_id as string,
    fileName: r.file_name as string, mimeType: r.mime_type as string,
    size: r.size as number, sourceType: r.source_type as KbFileSourceType,
    sourceRef: r.source_ref as string, storagePath: r.storage_path as string,
    extractedText: r.extracted_text as string, chunkCount: r.chunk_count as number,
    indexStatus: r.index_status as KbFileIndexStatus, indexError: (r.index_error as string) ?? null,
    indexedAt: (r.indexed_at as number) ?? null,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

// ---- KB CRUD ----
export function createKb(workspaceId: string, data: { id?: string; name: string; description?: string; chunkSize?: number; chunkOverlap?: number }): KnowledgeBase {
  const db = openDb();
  const ts = now();
  const kb: KnowledgeBase = {
    id: data.id || uuid(), workspaceId, name: data.name, description: data.description ?? '',
    embeddingModelId: null, chunkSize: data.chunkSize ?? 1000, chunkOverlap: data.chunkOverlap ?? 200,
    createdAt: ts, updatedAt: ts,
  };
  db.prepare(`INSERT INTO kbs (id, workspace_id, name, description, embedding_model_id, chunk_size, chunk_overlap, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`).run(kb.id, kb.workspaceId, kb.name, kb.description, kb.chunkSize, kb.chunkOverlap, ts, ts);
  ensureKbDir(kb.id);
  return kb;
}

export function getKb(workspaceId: string, kbId: string): KnowledgeBase | null {
  const r = openDb().prepare('SELECT * FROM kbs WHERE id = ? AND workspace_id = ?').get(kbId, workspaceId);
  return r ? mapKb(r as Record<string, unknown>) : null;
}

export function listKbs(workspaceId: string): KnowledgeBase[] {
  const rows = openDb().prepare('SELECT * FROM kbs WHERE workspace_id = ? ORDER BY created_at DESC').all(workspaceId) as Record<string, unknown>[];
  return rows.map(mapKb);
}

export function updateKb(workspaceId: string, kbId: string, patch: Partial<Pick<KnowledgeBase, 'name' | 'description' | 'embeddingModelId' | 'chunkSize' | 'chunkOverlap'>>): void {
  const cur = getKb(workspaceId, kbId);
  if (!cur) throw new Error(`Knowledge base not found: ${kbId}`);
  const next = { ...cur, ...patch, updatedAt: now() };
  openDb().prepare(`UPDATE kbs SET name=?, description=?, embedding_model_id=?, chunk_size=?, chunk_overlap=?, updated_at=? WHERE id=? AND workspace_id=?`)
    .run(next.name, next.description, next.embeddingModelId, next.chunkSize, next.chunkOverlap, next.updatedAt, kbId, workspaceId);
}

export function deleteKb(workspaceId: string, kbId: string): void {
  const db = openDb();
  db.prepare('DELETE FROM kb_chunks WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM kb_files WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM kbs WHERE id = ? AND workspace_id = ?').run(kbId, workspaceId);
  removeKbDir(kbId);
}

// ---- KbFile CRUD ----
export function addFile(file: Omit<KbFile, 'createdAt' | 'updatedAt'>): KbFile {
  const ts = now();
  const rec: KbFile = { ...file, createdAt: ts, updatedAt: ts };
  openDb().prepare(`INSERT INTO kb_files (id, kb_id, file_name, mime_type, size, source_type, source_ref, storage_path, extracted_text, chunk_count, index_status, index_error, indexed_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    rec.id, rec.kbId, rec.fileName, rec.mimeType, rec.size, rec.sourceType, rec.sourceRef,
    rec.storagePath, rec.extractedText, rec.chunkCount, rec.indexStatus, rec.indexError, rec.indexedAt, ts, ts,
  );
  return rec;
}

export function getFile(workspaceId: string, kbId: string, fileId: string): KbFile | null {
  const r = openDb().prepare('SELECT * FROM kb_files WHERE id = ? AND kb_id = ?').get(fileId, kbId) as Record<string, unknown> | undefined;
  if (r && !getKb(workspaceId, kbId)) return null;
  return r ? mapFile(r) : null;
}

export function listFiles(workspaceId: string, kbId: string): KbFile[] {
  if (!getKb(workspaceId, kbId)) return [];
  const rows = openDb().prepare('SELECT * FROM kb_files WHERE kb_id = ? ORDER BY created_at DESC').all(kbId) as Record<string, unknown>[];
  return rows.map(mapFile);
}

export function updateFileStatus(kbId: string, fileId: string, patch: Partial<Pick<KbFile, 'indexStatus' | 'indexError' | 'indexedAt' | 'chunkCount' | 'extractedText'>>): void {
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now()];
  if (patch.indexStatus !== undefined) { sets.push('index_status = ?'); params.push(patch.indexStatus); }
  if (patch.indexError !== undefined) { sets.push('index_error = ?'); params.push(patch.indexError); }
  if (patch.indexedAt !== undefined) { sets.push('indexed_at = ?'); params.push(patch.indexedAt); }
  if (patch.chunkCount !== undefined) { sets.push('chunk_count = ?'); params.push(patch.chunkCount); }
  if (patch.extractedText !== undefined) { sets.push('extracted_text = ?'); params.push(patch.extractedText); }
  openDb().prepare(`UPDATE kb_files SET ${sets.join(', ')} WHERE id = ? AND kb_id = ?`).run(...params, fileId, kbId);
}

export function deleteFile(kbId: string, fileId: string): void {
  const db = openDb();
  const row = db.prepare('SELECT storage_path FROM kb_files WHERE id = ? AND kb_id = ?').get(fileId, kbId) as { storage_path: string } | undefined;
  db.prepare('DELETE FROM kb_chunks WHERE file_id = ?').run(fileId);
  db.prepare('DELETE FROM kb_files WHERE id = ? AND kb_id = ?').run(fileId, kbId);
  if (row?.storage_path) {
    try { unlinkSync(row.storage_path); } catch { /* best-effort: 文件可能已不存在 */ }
  }
}

// ---- KbChunk + Embedding ----
export function deleteFileChunks(kbId: string, fileId: string): void {
  openDb().prepare('DELETE FROM kb_chunks WHERE kb_id = ? AND file_id = ?').run(kbId, fileId);
}

export function upsertChunk(chunk: { chunkId: string; kbId: string; fileId: string; chunkIndex: number; text: string; contentHash: string; embedding: number[]; modelId: string }): void {
  const db = openDb();
  db.prepare(`INSERT INTO kb_chunks (chunk_id, kb_id, file_id, chunk_index, text, content_hash, embedding, model_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chunk_id) DO UPDATE SET text=excluded.text, content_hash=excluded.content_hash, embedding=excluded.embedding, model_id=excluded.model_id`)
    .run(chunk.chunkId, chunk.kbId, chunk.fileId, chunk.chunkIndex, chunk.text, chunk.contentHash, JSON.stringify(chunk.embedding), chunk.modelId, now());
}

export function listChunkVectors(kbId: string, fileId?: string): Array<{ chunk: { chunkId: string; kbId: string; fileId: string; chunkIndex: number; text: string; contentHash: string; modelId: string; createdAt: number }; embedding: number[]; fileName: string }> {
  const db = openDb();
  const rows = fileId
    ? db.prepare('SELECT c.*, f.file_name FROM kb_chunks c JOIN kb_files f ON f.id = c.file_id WHERE c.kb_id = ? AND c.file_id = ?').all(kbId, fileId)
    : db.prepare('SELECT c.*, f.file_name FROM kb_chunks c JOIN kb_files f ON f.id = c.file_id WHERE c.kb_id = ?').all(kbId);
  return (rows as Record<string, unknown>[]).map((r) => ({
    chunk: {
      chunkId: r.chunk_id as string, kbId: r.kb_id as string, fileId: r.file_id as string,
      chunkIndex: r.chunk_index as number, text: r.text as string, contentHash: r.content_hash as string,
      modelId: r.model_id as string, createdAt: r.created_at as number,
    },
    embedding: JSON.parse(r.embedding as string) as number[],
    fileName: r.file_name as string,
  }));
}

export function getKbStats(workspaceId: string, kbId: string): KnowledgeBaseStats {
  if (!getKb(workspaceId, kbId)) throw new Error(`Knowledge base not found: ${kbId}`);
  const db = openDb();
  const files = db.prepare('SELECT index_status, COUNT(*) AS n FROM kb_files WHERE kb_id = ? GROUP BY index_status').all(kbId) as Array<{ index_status: string; n: number }>;
  const chunkCount = (db.prepare('SELECT COUNT(*) AS n FROM kb_chunks WHERE kb_id = ?').get(kbId) as { n: number }).n;
  let indexedCount = 0, pendingCount = 0, failedCount = 0, fileCount = 0;
  for (const r of files) {
    fileCount += r.n;
    if (r.index_status === 'indexed') indexedCount += r.n;
    else if (r.index_status === 'pending' || r.index_status === 'indexing') pendingCount += r.n;
    else if (r.index_status === 'failed') failedCount += r.n;
  }
  return { kbId, fileCount, indexedCount, pendingCount, failedCount, chunkCount };
}
