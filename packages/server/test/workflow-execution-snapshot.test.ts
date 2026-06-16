import test from 'node:test';
import assert from 'node:assert/strict';
import { __normalizeExecutionSnapshotNodesForTest } from '../src/services/execution-manager.js';

test('execution snapshot nodes expose inputFields and outputs at node top-level', () => {
  const [node] = __normalizeExecutionSnapshotNodesForTest([
    {
      id: 'node_1',
      type: 'asr_file_recognition',
      label: '录音文件转写',
      position: { x: 1800, y: 90 },
      data: {
        apiKey: '{{ __config__["workflow.aliyun-ai"]["apiKey"]}}',
        outputs: [{ key: 'success', type: 'boolean' }],
        inputFields: [],
        fileUrls: '{{ __data__["source"].fileUrls }}',
      },
    },
  ]);

  assert.deepEqual(node.inputFields, []);
  assert.deepEqual(node.outputs, [{ key: 'success', type: 'boolean' }]);
  assert.equal('inputFields' in node.data, false);
  assert.equal('outputs' in node.data, false);
  assert.equal(node.data.fileUrls, '{{ __data__["source"].fileUrls }}');
});
