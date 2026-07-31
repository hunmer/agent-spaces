import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrenceKeys } from './list-keys.js';

test('occurrenceKeys gives duplicate media URLs distinct React keys', () => {
  const keys = occurrenceKeys(['same.png', 'same.png']);

  assert.equal(new Set(keys).size, 2);
});
