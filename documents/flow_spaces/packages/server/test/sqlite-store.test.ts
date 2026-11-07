import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatabase, listDatabases, getDatabase, updateDatabase, deleteDatabase,
  listTables, describeTable, query, exec,
} from '../src/storage/sqlite-store.js';

function setup() {
  const db = createDatabase({ name: 'test_' + Math.random().toString(36).slice(2, 8), description: 't' });
  return db.id;
}
function cleanup(id: string) { try { deleteDatabase(id); } catch { /* noop */ } }

test('createDatabase + listDatabases + getDatabase', () => {
  const db = createDatabase({ name: 'lst_' + Date.now() });
  assert.ok(getDatabase(db.id));
  assert.ok(listDatabases().some((d) => d.id === db.id));
  cleanup(db.id);
});

test('createDatabase rejects invalid name', () => {
  assert.throws(() => createDatabase({ name: 'a/b' }));
});

test('CRUD via query/exec', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
    exec(id, 'INSERT INTO users(name) VALUES(?)', ['alice']);
    exec(id, 'INSERT INTO users(name) VALUES(?)', ['bob']);
    const r = query(id, 'SELECT * FROM users ORDER BY id');
    assert.equal(r.rowCount, 2);
    assert.deepEqual(r.columns, ['id', 'name']);
    exec(id, 'UPDATE users SET name = ? WHERE id = ?', ['ALICE', 1]);
    assert.equal((query(id, 'SELECT name FROM users WHERE id = 1').rows[0] as any).name, 'ALICE');
    exec(id, 'DELETE FROM users WHERE id = ?', [2]);
    assert.equal(query(id, 'SELECT * FROM users').rowCount, 1);
  } finally { cleanup(id); }
});

test('checkSql blocks ATTACH in store layer', () => {
  const id = setup();
  try { assert.throws(() => query(id, 'ATTACH DATABASE "x" AS x')); }
  finally { cleanup(id); }
});

test('listTables excludes sqlite_% system tables', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE t1(x)');
    const tables = listTables(id);
    assert.ok(tables.some((t) => t.name === 't1'));
    assert.ok(!tables.some((t) => t.name.startsWith('sqlite_')));
  } finally { cleanup(id); }
});

test('describeTable returns columns', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE c(a TEXT, b INTEGER NOT NULL)');
    const cols = describeTable(id, 'c');
    assert.equal(cols.length, 2);
    assert.ok(cols.find((c) => c.name === 'b' && c.notNull));
  } finally { cleanup(id); }
});

test('describeTable returns indexed columns', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE c(a TEXT, b INTEGER NOT NULL)');
    exec(id, 'CREATE INDEX IF NOT EXISTS "idx_c_b" ON "c"("b")');
    const cols = describeTable(id, 'c');
    assert.equal(cols.find((c) => c.name === 'a')?.indexed, false);
    assert.equal(cols.find((c) => c.name === 'b')?.indexed, true);
  } finally { cleanup(id); }
});

test('describeTable returns column descriptions from sqlite field metadata', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE c(a TEXT, b INTEGER NOT NULL)');
    exec(
      id,
      'CREATE TABLE IF NOT EXISTS "__sqlite_field_meta__" ("table" TEXT NOT NULL, "column" TEXT NOT NULL, "description" TEXT, PRIMARY KEY ("table","column"))',
    );
    exec(
      id,
      'INSERT OR REPLACE INTO "__sqlite_field_meta__" ("table","column","description") VALUES (?,?,?)',
      ['c', 'b', 'required name'],
    );
    const cols = describeTable(id, 'c');
    assert.equal(cols.find((c) => c.name === 'a')?.description, '');
    assert.equal(cols.find((c) => c.name === 'b')?.description, 'required name');
  } finally { cleanup(id); }
});

test('workflow association filter', () => {
  const db = createDatabase({ name: 'wf_' + Date.now(), workflowIds: ['wf-A'] });
  try {
    assert.ok(listDatabases('wf-A').some((d) => d.id === db.id));
    assert.ok(!listDatabases('wf-B').some((d) => d.id === db.id));
    updateDatabase(db.id, { workflowIds: ['wf-B'] });
    assert.ok(listDatabases('wf-B').some((d) => d.id === db.id));
  } finally { cleanup(db.id); }
});

test('MAX_ROWS truncation', () => {
  const id = setup();
  try {
    exec(id, 'CREATE TABLE big(x)');
    exec(id, 'INSERT INTO big(x) WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 10001) SELECT x FROM cnt');
    const r = query(id, 'SELECT * FROM big');
    assert.equal(r.truncated, true);
    assert.equal(r.rows.length, 10000);
  } finally { cleanup(id); }
});
