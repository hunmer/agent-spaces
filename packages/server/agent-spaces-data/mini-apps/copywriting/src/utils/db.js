// SQLite 句柄与 schema 初始化。
//
// 数据落盘：项目 data/db/copywriting.sqlite（后端 better-sqlite3 管理）。
// window.AgentSpaces.db('copywriting') 返回轻量句柄，
// 每次方法调用各发起一次 REST 请求。

const DB_NAME = 'copywriting';

export function getDb() {
  return window.AgentSpaces.db(DB_NAME);
}

// 幂等建表 + 索引，首次运行时调用。
export async function initSchema() {
  await getDb().exec(`
    CREATE TABLE IF NOT EXISTS copywriting (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'text',
      content       TEXT DEFAULT '',
      transcription TEXT DEFAULT '',
      tags          TEXT DEFAULT '',
      media_url     TEXT DEFAULT '',
      oss_url       TEXT DEFAULT '',
      duration      INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'done',
      created_at    INTEGER,
      updated_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cw_type   ON copywriting(type);
    CREATE INDEX IF NOT EXISTS idx_cw_status ON copywriting(status);
  `);
}

export const TYPE_TEXT = 'text';
export const TYPE_AUDIO = 'audio';
export const TYPE_VIDEO = 'video';
