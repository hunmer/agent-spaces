import { useCallback, useEffect, useState } from 'react';
import { getDb, initSchema } from '../utils/db';

// copywriting 表 CRUD + 过滤。所有操作走 window.AgentSpaces.db('copywriting')。
export function useCopywritingDb() {
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (filter = {}) => {
    const db = getDb();
    const where = [];
    const params = [];
    if (filter.type) { where.push('type = ?'); params.push(filter.type); }
    if (filter.tag) { where.push('tags LIKE ?'); params.push(`%${filter.tag}%`); }
    if (filter.keyword) {
      where.push('(title LIKE ? OR content LIKE ? OR transcription LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw);
    }
    let sql = 'SELECT * FROM copywriting';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    // 时长排序优先；否则按更新时间倒序
    if (filter.durationSort === 'asc' || filter.durationSort === 'desc') {
      sql += ` ORDER BY duration ${filter.durationSort.toUpperCase()}`;
    } else {
      sql += ' ORDER BY updated_at DESC';
    }
    const rows = await db.all(sql, params);
    setItems(rows);
    return rows;
  }, []);

  const refreshTags = useCallback(async () => {
    const rows = await getDb().all("SELECT DISTINCT tags FROM copywriting WHERE tags != ''");
    const set = new Set();
    for (const r of rows) {
      String(r.tags).split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => set.add(t));
    }
    setTags(Array.from(set));
  }, []);

  const count = useCallback(async () => {
    const row = await getDb().get('SELECT COUNT(*) AS n FROM copywriting');
    const n = row ? row.n : 0;
    setTotal(n);
    return n;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initSchema();
        await refresh({});
        await refreshTags();
        await count();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [refresh, refreshTags, count]);

  const add = useCallback(async (data) => {
    const db = getDb();
    const now = Date.now();
    const r = await db.run(
      `INSERT INTO copywriting(title,type,content,transcription,tags,media_url,oss_url,duration,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.title.trim(),
        data.type || 'text',
        data.content || '',
        data.transcription || '',
        data.tags || '',
        data.media_url || '',
        data.oss_url || '',
        data.duration || 0,
        data.status || 'done',
        now, now,
      ],
    );
    return r.lastInsertRowid;
  }, []);

  const update = useCallback(async (id, data) => {
    const db = getDb();
    const fields = [];
    const params = [];
    for (const k of ['title', 'content', 'transcription', 'tags', 'media_url', 'oss_url', 'duration', 'status']) {
      if (data[k] !== undefined) { fields.push(`${k} = ?`); params.push(data[k]); }
    }
    if (!fields.length) return;
    fields.push('updated_at = ?'); params.push(Date.now());
    params.push(id);
    await db.run(`UPDATE copywriting SET ${fields.join(', ')} WHERE id = ?`, params);
  }, []);

  const remove = useCallback(async (id) => {
    await getDb().run('DELETE FROM copywriting WHERE id = ?', [id]);
  }, []);

  return { items, tags, total, ready, error, refresh, refreshTags, count, add, update, remove };
}
