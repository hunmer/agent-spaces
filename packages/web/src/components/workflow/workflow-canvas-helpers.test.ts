import assert from 'node:assert/strict';
import test from 'node:test';
import { findSmallestContainingRectId, resolveGroupBoundsNode } from './workflow-canvas-helpers';

test('findSmallestContainingRectId picks the innermost matching group', () => {
  const targets = [
    { id: 'outer', rect: { left: 0, top: 0, right: 200, bottom: 200 } },
    { id: 'inner', rect: { left: 50, top: 50, right: 100, bottom: 100 } },
  ];

  assert.equal(findSmallestContainingRectId({ x: 75, y: 75 }, targets), 'inner');
  assert.equal(findSmallestContainingRectId({ x: 250, y: 250 }, targets), null);
});

test('resolveGroupBoundsNode freezes a detaching node at its drag-start position', () => {
  const live = { id: 'node', position: { x: 300, y: 200 } };
  const initial = { id: 'node', position: { x: 10, y: 20 } };

  assert.equal(resolveGroupBoundsNode(live, initial, true), initial);
  assert.equal(resolveGroupBoundsNode(live, initial, false), live);
});
