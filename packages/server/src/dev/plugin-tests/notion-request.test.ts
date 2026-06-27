// 测试 notion 插件的请求构造（mock fetch，不发真实请求）
// 验证：方法、URL、headers（含 move-page 自动提升 Notion-Version）
import assert from 'node:assert/strict';

// 记录每次请求
const calls = [];

// mock fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({
    url: String(url),
    method: init?.method || 'GET',
    headers: init?.headers || {},
    body: init?.body ? JSON.parse(init.body) : undefined,
  });
  // 返回一个最小合法响应
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: 'mock-id', url: 'https://notion.so/mock', archived: false, parent: { type: 'workspace' } }),
  };
};

export default async function run(plugin) {
  const token = 'ntn_test_token';
  const cfg = { token, notionVersion: '2022-06-28', timeout: 5000 };

  // 1. search
  calls.length = 0;
  await plugin.runAction('notion_search', { ...cfg, query: 'hello', filterType: 'page' });
  const s = calls[0];
  assert.equal(s.method, 'POST', 'search should POST');
  assert.match(s.url, /\/v1\/search$/, 'search url');
  assert.equal(s.headers['Authorization'], `Bearer ${token}`);
  assert.equal(s.headers['Notion-Version'], '2022-06-28');
  assert.deepEqual(s.body.filter, { property: 'object', value: 'page' });

  // 2. page_create (database parent, title -> Name)
  calls.length = 0;
  await plugin.runAction('notion_page_create', { ...cfg, parentType: 'database_id', parentId: 'db-1', title: 'My Row' });
  const c = calls[0];
  assert.equal(c.method, 'POST', 'create should POST');
  assert.match(c.url, /\/v1\/pages$/);
  assert.deepEqual(c.body.parent, { database_id: 'db-1' });
  assert.ok(c.body.properties.Name, 'title should map to Name for DB parent');

  // 3. page_update -> PATCH
  calls.length = 0;
  await plugin.runAction('notion_page_update', { ...cfg, pageId: 'p-1', title: 'New Title' });
  const u = calls[0];
  assert.equal(u.method, 'PATCH', 'update should PATCH');
  assert.match(u.url, /\/v1\/pages\/p-1$/);

  // 4. page_move -> PATCH + auto version bump
  calls.length = 0;
  await plugin.runAction('notion_page_move', { ...cfg, pageId: 'p-1', parentType: 'page_id', parentId: 'p-2' });
  const m = calls[0];
  assert.equal(m.method, 'PATCH', 'move should PATCH');
  assert.equal(m.headers['Notion-Version'], '2026-03-11', 'move should bump Notion-Version');
  assert.deepEqual(m.body.parent, { page_id: 'p-2' });

  // 5. page_archive -> PATCH archived
  calls.length = 0;
  await plugin.runAction('notion_page_archive', { ...cfg, pageId: 'p-1', archive: 'true' });
  const a = calls[0];
  assert.equal(a.method, 'PATCH');
  assert.equal(a.body.archived, true);

  // 6. database_create -> POST
  calls.length = 0;
  await plugin.runAction('notion_database_create', {
    ...cfg, parentId: 'p-1', title: 'Tasks', properties: '{"Done":{"checkbox":{}}}',
  });
  const dc = calls[0];
  assert.equal(dc.method, 'POST');
  assert.match(dc.url, /\/v1\/databases$/);
  assert.deepEqual(dc.body.properties, { Done: { checkbox: {} } });

  // 7. database_query -> POST /databases/{id}/query
  calls.length = 0;
  await plugin.runAction('notion_database_query', {
    ...cfg, databaseId: 'db-1', filter: '{"property":"Done","checkbox":{"equals":true}}',
  });
  const dq = calls[0];
  assert.equal(dq.method, 'POST');
  assert.match(dq.url, /\/v1\/databases\/db-1\/query$/);
  assert.deepEqual(dq.body.filter, { property: 'Done', checkbox: { equals: true } });

  // 8. block_delete -> DELETE
  calls.length = 0;
  await plugin.runAction('notion_block_delete', { ...cfg, blockId: 'b-1' });
  const bd = calls[0];
  assert.equal(bd.method, 'DELETE', 'delete should DELETE');
  assert.match(bd.url, /\/v1\/blocks\/b-1$/);

  globalThis.fetch = originalFetch;
  return { success: true, tests: 8, message: 'all notion request assertions passed' };
}
