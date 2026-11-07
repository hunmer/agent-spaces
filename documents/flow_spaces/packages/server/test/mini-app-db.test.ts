import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDbName, checkSql, bindArgs } from '../src/storage/mini-app-db.js';

test('validateDbName accepts legal names', () => {
  assert.doesNotThrow(() => validateDbName('logs'));
  assert.doesNotThrow(() => validateDbName('main_db-1'));
  assert.doesNotThrow(() => validateDbName('A'));
});

test('validateDbName rejects illegal names', () => {
  assert.throws(() => validateDbName(''), /Invalid db name/);
  assert.throws(() => validateDbName('a/b'), /Invalid db name/);
  assert.throws(() => validateDbName('..'), /Invalid db name/);
  assert.throws(() => validateDbName('a b'), /Invalid db name/);
  assert.throws(() => validateDbName('a.b'), /Invalid db name/);
  assert.throws(() => validateDbName('a'.repeat(65)), /Invalid db name/);
});

test('checkSql blocks ATTACH/DETACH (case-insensitive) but allows normal SQL', () => {
  assert.throws(() => checkSql('ATTACH DATABASE "x" AS x'), /not allowed/i);
  assert.throws(() => checkSql('attach database x as x'), /not allowed/i);
  assert.throws(() => checkSql('DETACH x'), /not allowed/i);
  assert.doesNotThrow(() => checkSql('SELECT * FROM t WHERE x = 1'));
  assert.doesNotThrow(() => checkSql('INSERT INTO logs(msg) VALUES(?)'));
});

test('bindArgs normalizes params (array positional / object named / undefined empty)', () => {
  assert.deepEqual(bindArgs(undefined), []);
  assert.deepEqual(bindArgs([1, 2]), [1, 2]);
  const obj = { a: 1 };
  assert.deepEqual(bindArgs(obj), [obj]);
});
