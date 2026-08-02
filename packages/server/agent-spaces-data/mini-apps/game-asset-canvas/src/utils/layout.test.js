import test from 'node:test';
import assert from 'node:assert/strict';
import { autoLayoutSubset, autoLayoutTopLevel, findFreePositions } from './layout.js';

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

test('autoLayoutTopLevel moves a group as one entity and preserves its internal layout', () => {
  const groupedNodes = [
    { id: 'a', position: { x: 100, y: 100 }, width: 100, height: 50 },
    { id: 'b', position: { x: 240, y: 180 }, width: 100, height: 50 },
    { id: 'outside', position: { x: 600, y: 120 }, width: 100, height: 50 },
  ];
  const groups = [{ id: 'g1', childNodeIds: ['a', 'b'], childGroupIds: [] }];
  const result = autoLayoutTopLevel(
    groupedNodes,
    [{ id: 'b-outside', source: 'b', target: 'outside' }],
    groups,
    { direction: 'TB' },
  );
  const a = result.nodes.find((node) => node.id === 'a');
  const b = result.nodes.find((node) => node.id === 'b');
  const outside = result.nodes.find((node) => node.id === 'outside');

  assert.deepEqual(
    { x: b.position.x - a.position.x, y: b.position.y - a.position.y },
    { x: 140, y: 80 },
  );
  assert.ok(outside.position.y > Math.max(a.position.y + 50, b.position.y + 50));
});

test('autoLayoutTopLevel supports horizontal group layout', () => {
  const groupedNodes = [
    { id: 'inside', position: { x: 100, y: 100 }, width: 100, height: 50 },
    { id: 'outside', position: { x: 100, y: 500 }, width: 100, height: 50 },
  ];
  const result = autoLayoutTopLevel(
    groupedNodes,
    [{ id: 'cross', source: 'inside', target: 'outside' }],
    [{ id: 'g1', childNodeIds: ['inside'], childGroupIds: [] }],
    { direction: 'LR' },
  );

  assert.ok(
    result.nodes.find((node) => node.id === 'outside').position.x
      > result.nodes.find((node) => node.id === 'inside').position.x + 100,
  );
});

test('findFreePositions skips occupied cells and reserves positions from the same batch', () => {
  const obstacles = [
    { position: { x: 120, y: 120 }, width: 280, height: 220 },
    { position: { x: 440, y: 120 }, width: 280, height: 220 },
  ];

  const positions = findFreePositions(
    { x: 120, y: 120 },
    280,
    220,
    2,
    obstacles,
    { gap: 40, direction: 'right', cols: 3 },
  );

  assert.deepEqual(positions, [
    { x: 760, y: 120 },
    { x: 120, y: 380 },
  ]);
});
