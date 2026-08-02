import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findSmallestContainingRectId, findSmallestGroupContainingNodeIds,
} from './group-helpers.js';

test('findSmallestContainingRectId returns the smallest containing group', () => {
  const targets = [
    { id: 'outer', rect: { left: 0, top: 0, right: 200, bottom: 200 } },
    { id: 'inner', rect: { left: 40, top: 40, right: 120, bottom: 120 } },
  ];

  assert.equal(findSmallestContainingRectId({ x: 80, y: 80 }, targets), 'inner');
  assert.equal(findSmallestContainingRectId({ x: 180, y: 180 }, targets), 'outer');
  assert.equal(findSmallestContainingRectId({ x: 240, y: 240 }, targets), null);
});

test('findSmallestGroupContainingNodeIds prefers the innermost matching group', () => {
  const groups = [
    { id: 'outer', childNodeIds: ['outer-node'], childGroupIds: ['inner'] },
    { id: 'inner', childNodeIds: ['inner-a', 'inner-b'], childGroupIds: [] },
    { id: 'other', childNodeIds: ['other-node'], childGroupIds: [] },
  ];

  assert.equal(findSmallestGroupContainingNodeIds(groups, ['inner-a']), 'inner');
  assert.equal(findSmallestGroupContainingNodeIds(groups, ['inner-a', 'inner-b']), 'inner');
  assert.equal(findSmallestGroupContainingNodeIds(groups, ['outer-node', 'inner-a']), 'outer');
  assert.equal(findSmallestGroupContainingNodeIds(groups, ['inner-a', 'other-node']), null);
  assert.equal(findSmallestGroupContainingNodeIds(groups, []), null);
});
