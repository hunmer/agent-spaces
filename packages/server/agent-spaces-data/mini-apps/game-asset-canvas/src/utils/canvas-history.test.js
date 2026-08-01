import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasStateSyncSignature } from './canvas-history.js';

test('canvas save echo ignores persisted metadata but detects canvas changes', () => {
  const local = {
    nodes: [{ id: 'node-1', type: 'note', data: { text: 'before' } }],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  assert.equal(canvasStateSyncSignature(local), canvasStateSyncSignature({ ...local, savedAt: 123 }));
  assert.notEqual(
    canvasStateSyncSignature(local),
    canvasStateSyncSignature({ ...local, nodes: [{ ...local.nodes[0], data: { text: 'after' } }] }),
  );
});
