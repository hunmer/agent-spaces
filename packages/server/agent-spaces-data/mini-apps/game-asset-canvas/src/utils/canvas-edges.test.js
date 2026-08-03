import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureEdgeIds } from './canvas-edges.js';

test('adds eight unique IDs to batch edges', () => {
  const edges = Array.from({ length: 8 }, (_, index) => ({
    source: `source-${index + 1}`,
    target: `target-${index + 1}`,
    data: { inputTarget: 'images' },
  }));

  const normalized = ensureEdgeIds(edges);

  assert.equal(normalized.length, 8);
  assert.equal(new Set(normalized.map((edge) => edge.id)).size, 8);
  assert.ok(normalized.every((edge) => typeof edge.id === 'string' && edge.id));
});

test('keeps the first duplicate ID and repairs later duplicates', () => {
  const edges = [
    { id: 'existing-edge', source: 'source-1', target: 'target-1' },
    { id: 'existing-edge', source: 'source-2', target: 'target-2' },
  ];

  const normalized = ensureEdgeIds(edges);

  assert.equal(normalized[0], edges[0]);
  assert.equal(normalized[0].id, 'existing-edge');
  assert.notEqual(normalized[1].id, 'existing-edge');
});

test('returns the original array when all edge IDs are already unique', () => {
  const edges = [
    { id: 'edge-1', source: 'source-1', target: 'target-1' },
    { id: 'edge-2', source: 'source-2', target: 'target-2' },
  ];

  assert.equal(ensureEdgeIds(edges), edges);
});

test('does not generate an ID already reserved by another edge', () => {
  const edges = [
    { id: 'edge-source-1--target-1--images', source: 'other-source', target: 'other-target' },
    { source: 'source-1', target: 'target-1', data: { inputTarget: 'images' } },
  ];

  const normalized = ensureEdgeIds(edges);

  assert.equal(normalized[0].id, edges[0].id);
  assert.equal(normalized[1].id, 'edge-source-1--target-1--images-2');
});
