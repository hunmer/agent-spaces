import assert from 'node:assert/strict';
import test from 'node:test';
import { getOutputFieldSchemas } from './workflow-properties-utils';

test('getOutputFieldSchemas removes values from nested output fields', () => {
  assert.deepEqual(getOutputFieldSchemas([
    { key: 'result', type: 'object', value: '{{node.result}}', children: [
      { key: 'name', type: 'string', value: '{{node.result.name}}' },
    ] },
  ]), [
    { key: 'result', type: 'object', children: [
      { key: 'name', type: 'string' },
    ] },
  ]);
});
