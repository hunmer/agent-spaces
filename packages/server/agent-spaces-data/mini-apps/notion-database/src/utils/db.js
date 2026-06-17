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

// ===== 节点 CRUD（前端执行，写后由调用方 invokeService('node_changed') 广播）=====
export async function listNodes() {
  return getDb().all('SELECT * FROM nodes ORDER BY updatedAt DESC');
}
export async function getNode(id) {
  return getDb().get('SELECT * FROM nodes WHERE id = ?', [id]);
}
export async function createNode({ id, parentId = null, type = 'document', title = '' }) {
  const ts = nowTs();
  await getDb().run(
    'INSERT INTO nodes(id, title, icon, cover, content, parentId, type, createdAt, updatedAt, isTrash) VALUES(?,?,?,?,?,?,?,?,?,0)',
    [id, title, '', '', '', parentId, type, ts, ts],
  );
  return getNode(id);
}
export async function updateNode(id, patch) {
  const cur = await getNode(id);
  if (!cur) return null;
  if (patch.content !== undefined && patch.content !== cur.content) {
    await getDb().run(
      'INSERT INTO node_versions(id, nodeId, title, oldContent, newContent, createdAt) VALUES(?,?,?,?,?,?)',
      [genId('v'), id, cur.title, cur.content, patch.content, nowTs()],
    );
  }
  const next = { ...cur, ...patch, updatedAt: nowTs() };
  await getDb().run(
    'UPDATE nodes SET title=?, icon=?, cover=?, content=?, parentId=?, type=?, updatedAt=? WHERE id=?',
    [next.title, next.icon, next.cover, next.content, next.parentId, next.type, next.updatedAt, id],
  );
  return next;
}
export async function renameNode(id, title) {
  await getDb().run('UPDATE nodes SET title=?, updatedAt=? WHERE id=?', [title, nowTs(), id]);
  return getNode(id);
}
export async function updateIcon(id, icon) {
  await getDb().run('UPDATE nodes SET icon=?, updatedAt=? WHERE id=?', [icon, nowTs(), id]);
  return getNode(id);
}
export async function updateCover(id, cover) {
  await getDb().run('UPDATE nodes SET cover=?, updatedAt=? WHERE id=?', [cover, nowTs(), id]);
  return getNode(id);
}
export async function moveNode(id, parentId) {
  await getDb().run('UPDATE nodes SET parentId=?, updatedAt=? WHERE id=?', [parentId, nowTs(), id]);
  return getNode(id);
}
export async function trashNode(id) {
  await getDb().run('UPDATE nodes SET isTrash=1, trashedAt=?, updatedAt=? WHERE id=?', [nowTs(), nowTs(), id]);
  return getNode(id);
}
export async function restoreNode(id) {
  await getDb().run('UPDATE nodes SET isTrash=0, trashedAt=NULL, updatedAt=? WHERE id=?', [nowTs(), id]);
  return getNode(id);
}
export async function deleteNode(id) {
  await getDb().run('DELETE FROM node_versions WHERE nodeId=?', [id]);
  await getDb().run('DELETE FROM nodes WHERE id=?', [id]);
}
export async function listVersions(nodeId) {
  return getDb().all('SELECT * FROM node_versions WHERE nodeId=? ORDER BY createdAt DESC', [nodeId]);
}
