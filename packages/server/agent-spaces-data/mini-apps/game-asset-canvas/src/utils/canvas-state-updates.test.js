import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCanvasCollectionUpdate } from './canvas-state-updates.js';

test('targeted node update removes one image while preserving other groups and nodes', () => {
  const nodes = [
    {
      id: 'node-group-1',
      data: {
        output: { images: ['one-a', 'one-b'], resources: [{ id: 'a' }, { id: 'b' }] },
      },
    },
    {
      id: 'node-group-2',
      data: {
        output: { images: ['two-a', 'two-b'], resources: [{ id: 'c' }, { id: 'd' }] },
      },
    },
  ];
  const next = applyCanvasCollectionUpdate(nodes, {
    source: 'node-output-delete',
    targetType: 'node',
    targetId: 'node-group-1',
    key: 'data',
    method: 'update',
    value: (data) => ({
      ...data,
      output: {
        ...data.output,
        images: data.output.images.slice(1),
        resources: data.output.resources.slice(1),
      },
    }),
  });

  assert.deepEqual(next[0].data.output.images, ['one-b']);
  assert.deepEqual(next[1], nodes[1]);
});

test('targeted group execution update cannot replace another group', () => {
  const groups = [
    { id: 'group-1', batchExecution: { assets: { runs: [{ id: 'run-1' }] } } },
    { id: 'group-2', batchExecution: { assets: { runs: [{ id: 'run-2' }] } } },
  ];
  const replacement = { assets: { runs: [{ id: 'run-1', nodeStates: {} }] } };
  const next = applyCanvasCollectionUpdate(groups, {
    source: 'group-execution',
    targetType: 'group',
    targetId: 'group-1',
    key: 'batchExecution',
    value: replacement,
    method: 'replace',
  });

  assert.deepEqual(next[0].batchExecution, replacement);
  assert.deepEqual(next[1], groups[1]);
});

test('root group metadata updates stay targeted to the requested group', () => {
  const groups = [
    { id: 'group-1', name: '旧名称', childNodeIds: ['a'] },
    { id: 'group-2', name: '保持不变', childNodeIds: ['b'] },
  ];
  const next = applyCanvasCollectionUpdate(groups, {
    source: 'group-properties',
    targetType: 'group',
    targetId: 'group-1',
    key: '$',
    value: { name: '新名称' },
    method: 'merge',
  });

  assert.equal(next[0].name, '新名称');
  assert.deepEqual(next[0].childNodeIds, ['a']);
  assert.deepEqual(next[1], groups[1]);
});

test('missing source, key, target or method is rejected without changing state', () => {
  const nodes = [{ id: 'node-1', data: { output: { images: ['a'] } } }];
  const invalidRequests = [
    { targetType: 'node', targetId: 'node-1', key: 'data', value: {}, method: 'replace' },
    { source: 'test', targetType: 'node', targetId: 'node-1', value: {}, method: 'replace' },
    { source: 'test', targetType: 'node', key: 'data', value: {}, method: 'replace' },
    { source: 'test', targetType: 'node', targetId: 'node-1', key: 'data', value: {}, method: 'unknown' },
  ];
  invalidRequests.forEach((request) => assert.deepEqual(
    applyCanvasCollectionUpdate(nodes, request),
    nodes,
  ));
});
