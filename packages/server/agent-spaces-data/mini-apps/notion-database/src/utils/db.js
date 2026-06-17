// SQLite 句柄与 schema 初始化（参考 copywriting/src/utils/db.js）。
// 落盘：项目 data/db/notion-database.sqlite（后端 better-sqlite3 管理）。
const DB_NAME = 'notion-database';

export function getDb() {
  return window.AgentSpaces.db(DB_NAME);
}

export async function initSchema() {
  const db = getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id         TEXT PRIMARY KEY,
      title      TEXT DEFAULT '',
      icon       TEXT DEFAULT '',
      cover      TEXT DEFAULT '',
      content    TEXT DEFAULT '',
      parentId   TEXT,
      type       TEXT DEFAULT 'document',
      createdAt  INTEGER,
      updatedAt  INTEGER,
      isTrash    INTEGER DEFAULT 0,
      trashedAt  INTEGER,
      kbFileId   TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parentId);
    CREATE INDEX IF NOT EXISTS idx_nodes_trash  ON nodes(isTrash);
    CREATE TABLE IF NOT EXISTS node_versions (
      id         TEXT PRIMARY KEY,
      nodeId     TEXT,
      title      TEXT,
      oldContent TEXT,
      newContent TEXT,
      createdAt  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_versions_node ON node_versions(nodeId);
  `);
  // 兼容旧库：kbFileId 列若不存在则补
  await db.run('ALTER TABLE nodes ADD COLUMN kbFileId TEXT DEFAULT ""').catch(() => {});
}

export function nowTs() {
  return Date.now();
}

export function genId(prefix = 'n') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
