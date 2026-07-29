import assert from 'node:assert/strict';
import test from 'node:test';

import { BoneGizmoLayer } from '../src/core/BoneGizmoLayer.js';

test('bone coordinates stay local to the shared spine container', () => {
  const bone = { worldX: 10, worldY: 20 };
  const spine = {
    transform: {
      localTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    },
    worldTransform: { a: 2, b: 0, c: 0, d: 2, tx: 100, ty: 50 },
  };

  const point = BoneGizmoLayer.prototype._boneToContainer.call({ spine }, bone);

  assert.deepEqual(point, { x: 10, y: 20 });
});

test('bone coordinates include only the spine local transform', () => {
  const bone = { worldX: 10, worldY: 20 };
  const spine = {
    transform: {
      localTransform: { a: 0.5, b: 0, c: 0, d: 0.5, tx: 3, ty: 4 },
    },
    worldTransform: { a: 1.5, b: 0, c: 0, d: 1.5, tx: 209, ty: 112 },
  };

  const point = BoneGizmoLayer.prototype._boneToContainer.call({ spine }, bone);

  assert.deepEqual(point, { x: 8, y: 14 });
});
