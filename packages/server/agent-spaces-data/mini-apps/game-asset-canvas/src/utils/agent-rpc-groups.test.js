import test from 'node:test';
import assert from 'node:assert/strict';
import { addNodeIdsToGroup, removeNodeIdFromGroups } from './agent-rpc-groups.js';
import { autoLayoutSubset } from './layout.js';

test('addNodeIdsToGroup accumulates members across concurrent request snapshots', () => {
  const first = addNodeIdsToGroup([], 'expressions', ['a']);
  const second = addNodeIdsToGroup(first, 'expressions', ['b', 'a']);
  assert.deepEqual(second[0].childNodeIds, ['a', 'b']);
});

test('removeNodeIdFromGroups removes deleted nodes from every group', () => {
  const groups = [
    { id: 'g1', childNodeIds: ['a', 'b'] },
    { id: 'g2', childNodeIds: ['a'] },
  ];
  assert.deepEqual(
    removeNodeIdFromGroups(groups, 'a').map((group) => group.childNodeIds),
    [['b'], []],
  );
});

test('eight incrementally grouped nodes receive eight unique grid positions', () => {
  let groups = [];
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    id: `node-${index}`,
    position: { x: 120, y: 120 },
    width: 280,
    height: 220,
  }));
  for (const node of nodes) groups = addNodeIdsToGroup(groups, 'expressions', [node.id]);

  const arranged = autoLayoutSubset(nodes, [], {
    nodeIds: groups[0].childNodeIds,
    grid: { rows: 4, columns: 2, horizontalGap: 300, verticalGap: 300 },
  });
  const uniquePositions = new Set(arranged.map((node) => `${node.position.x},${node.position.y}`));

  assert.equal(groups[0].childNodeIds.length, 8);
  assert.equal(uniquePositions.size, 8);
});
