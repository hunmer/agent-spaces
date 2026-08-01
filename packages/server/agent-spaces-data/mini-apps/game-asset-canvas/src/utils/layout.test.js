import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayoutSubset } from './layout.js';

const nodes = [
  { id: 'a', position: { x: 100, y: 200 }, width: 100, height: 50 },
  { id: 'b', position: { x: 130, y: 220 }, width: 100, height: 50 },
  { id: 'outside', position: { x: 900, y: 900 }, width: 100, height: 50 },
];
const edges = [{ id: 'a-b', source: 'a', target: 'b' }];

test('autoLayoutSubset lays out only requested nodes and preserves their anchor', () => {
  const result = autoLayoutSubset(nodes, edges, { direction: 'LR', nodeIds: ['a', 'b'] });

  assert.deepEqual(result.find((node) => node.id === 'outside'), nodes[2]);
  assert.equal(Math.min(...result.slice(0, 2).map((node) => node.position.x)), 100);
  assert.equal(Math.min(...result.slice(0, 2).map((node) => node.position.y)), 200);
  assert.ok(result[1].position.x > result[0].position.x);
});

test('autoLayoutSubset accepts the workflow group grid options', () => {
  const result = autoLayoutSubset(nodes, edges, {
    nodeIds: ['a', 'b'],
    grid: { rows: 2, columns: 1, horizontalGap: 60, verticalGap: 40 },
  });

  assert.deepEqual(result[0].position, { x: 100, y: 200 });
  assert.deepEqual(result[1].position, { x: 100, y: 290 });
});
