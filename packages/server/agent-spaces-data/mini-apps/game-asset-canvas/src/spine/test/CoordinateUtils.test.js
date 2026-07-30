import assert from 'node:assert/strict';
import test from 'node:test';

import { CoordinateUtils } from '../core/CoordinateUtils.js';

test('child bone drag converts through Spine parent bone matrix fields', () => {
  const bone = {
    parent: {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      worldX: 10,
      worldY: 20,
    },
  };

  const local = CoordinateUtils.containerToBoneLocal(bone, 15, 27);

  assert.deepEqual(local, { x: 5, y: 7 });
});

test('child bone drag inverts a rotated Spine parent matrix', () => {
  const bone = {
    parent: {
      a: 0,
      b: -1,
      c: 1,
      d: 0,
      worldX: 10,
      worldY: 20,
    },
  };

  const local = CoordinateUtils.containerToBoneLocal(bone, 7, 22);

  assert.deepEqual(local, { x: 2, y: 3 });
});
