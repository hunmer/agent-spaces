import { useCallback, useEffect, useState } from 'react';
import { getDb, initSchema } from '../utils/db';

// 封装 snippets 表的 CRUD + 过滤。所有操作走 window.AgentSpaces.db('snippets')。
export function useSnippetsDb() {
  const [snippets, setSnippets] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (filter = {}) => {
    const db = getDb();
    const where = [];
    const params = [];
    if (filter.language && filter.language !== 'all') {
      where.push('language = ?');
      params.push(filter.language);
    }
    if (filter.tag) {
      where.push('tags LIKE ?');
      params.push(`%${filter.tag}%`);
    }
    if (filter.q) {
      where.push('(title LIKE ? OR code LIKE ?)');
      params.push(`%${filter.q}%`, `%${filter.q}%`);
    }
    let sql = 'SELECT * FROM snippets';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY updated_at DESC';
    const rows = await db.all(sql, params);
    setSnippets(rows);
    return rows;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initSchema();
        await refresh({});
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [refresh]);

  const addSnippet = useCallback(async (data) => {
    const db = getDb();
    const now = Date.now();
    const r = await db.run(
      'INSERT INTO snippets(title, code, language, tags, created_at, updated_at) VALUES(?,?,?,?,?,?)',
      [data.title.trim(), data.code || '', data.language || 'text', data.tags || '', now, now],
    );
    return r.lastInsertRowid;
  }, []);

  const updateSnippet = useCallback(async (id, data) => {
    const db = getDb();
    await db.run(
      'UPDATE snippets SET title=?, code=?, language=?, tags=?, updated_at=? WHERE id=?',
      [data.title.trim(), data.code || '', data.language || 'text', data.tags || '', Date.now(), id],
    );
  }, []);

  const deleteSnippet = useCallback(async (id) => {
    const db = getDb();
    await db.run('DELETE FROM snippets WHERE id=?', [id]);
  }, []);

  // 批量导入：演示 db.transaction 原子提交。
  const importBatch = useCallback(async (items) => {
    const db = getDb();
    const now = Date.now();
    await db.transaction(
      items.map((it) => ({
        sql: 'INSERT INTO snippets(title, code, language, tags, created_at, updated_at) VALUES(?,?,?,?,?,?)',
        params: [it.title.trim(), it.code || '', it.language || 'text', it.tags || '', now, now],
      })),
    );
  }, []);

  const count = useCallback(async () => {
    const row = await getDb().get('SELECT COUNT(*) AS n FROM snippets');
    return row ? row.n : 0;
  }, []);

  return { snippets, ready, error, refresh, addSnippet, updateSnippet, deleteSnippet, importBatch, count };
}
