import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutputObject } from '../src/services/execution-node-helpers.js';

test('buildOutputObject preserves object value when children are not declared', () => {
  assert.deepEqual(buildOutputObject([
    {
      key: 'out2',
      type: 'object',
      value: { key21: 'hi' },
      children: [],
    },
  ]), {
    out2: { key21: 'hi' },
  });
});

test('buildOutputObject builds declared object children when present', () => {
  assert.deepEqual(buildOutputObject([
    {
      key: 'out2',
      type: 'object',
      value: { ignored: true },
      children: [{ key: 'key21', type: 'string', value: 'hi' }],
    },
  ]), {
    out2: { key21: 'hi' },
  });
});
