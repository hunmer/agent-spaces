import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDbName, checkSql, bindArgs, validateIdentifier } from '../src/storage/sql-safety.js';

test('validateDbName accepts legal names', () => {
  assert.doesNotThrow(() => validateDbName('logs'));
  assert.doesNotThrow(() => validateDbName('main_db-1'));
});

test('validateDbName rejects illegal names', () => {
  assert.throws(() => validateDbName(''), /Invalid db name/);
  assert.throws(() => validateDbName('a/b'), /Invalid db name/);
  assert.throws(() => validateDbName('a b'), /Invalid db name/);
});

test('checkSql blocks ATTACH/DETACH but allows normal SQL', () => {
  assert.throws(() => checkSql('ATTACH DATABASE "x" AS x'), /not allowed/i);
  assert.throws(() => checkSql('detach x'), /not allowed/i);
  assert.doesNotThrow(() => checkSql('SELECT * FROM t WHERE x = 1'));
});

test('bindArgs handles array/object/undefined', () => {
  assert.deepEqual(bindArgs([1, 2]), [1, 2]);
  assert.deepEqual(bindArgs(undefined), []);
  assert.deepEqual(bindArgs({ a: 1 }), [{ a: 1 }]);
});

test('validateIdentifier rejects injection', () => {
  assert.doesNotThrow(() => validateIdentifier('users', 'table'));
  assert.throws(() => validateIdentifier('t; DROP TABLE', 'table'), /Invalid table name/);
  assert.throws(() => validateIdentifier('col" OR 1=1', 'column'), /Invalid column name/);
});
