// SQLite 数据库句柄与 schema 初始化。
//
// db 文件落盘于 项目 data/db/snippets.sqlite（由后端 better-sqlite3 管理）。
// 每次调用 window.AgentSpaces.db('snippets') 返回一个轻量句柄对象，
// 其 all/get/run/exec/transaction 各发起一次 REST 请求。

const DB_NAME = 'snippets';

export function getDb() {
  return window.AgentSpaces.db(DB_NAME);
}

// 幂等建表 + 索引。首次运行时调用。
export async function initSchema() {
  await getDb().exec(`
    CREATE TABLE IF NOT EXISTS snippets(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      code TEXT DEFAULT '',
      language TEXT DEFAULT 'text',
      tags TEXT DEFAULT '',
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_snippets_language ON snippets(language);
  `);
}
