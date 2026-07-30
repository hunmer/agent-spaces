import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { BoneGizmoLayer } from '../core/BoneGizmoLayer.js';

const source = fs.readFileSync(new URL('../core/BoneGizmoLayer.js', import.meta.url), 'utf8');

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

test('bone dragging only starts after it is enabled', () => {
  let starts = 0;
  const gizmo = {
    dragEnabled: false,
    dragging: false,
    dragMode: null,
    dragBone: null,
    skeleton: {},
    onTransformStart: () => { starts += 1; },
  };
  const bone = { name: 'root' };

  assert.equal(BoneGizmoLayer.prototype._startDrag.call(gizmo, bone, 'move'), false);
  assert.equal(gizmo.dragging, false);

  gizmo.dragEnabled = true;
  assert.equal(BoneGizmoLayer.prototype._startDrag.call(gizmo, bone, 'move'), true);
  assert.equal(gizmo.dragging, true);
  assert.equal(gizmo.dragMode, 'move');
  assert.equal(gizmo.dragBone, bone);
  assert.equal(starts, 1);
});

test('disabling bone dragging ends an active transform', () => {
  let ends = 0;
  const gizmo = {
    dragEnabled: true,
    dragging: true,
    dragMode: 'move',
    dragBone: {},
    onTransformEnd: () => { ends += 1; },
    _endDrag: BoneGizmoLayer.prototype._endDrag,
  };

  BoneGizmoLayer.prototype.setDragEnabled.call(gizmo, false);

  assert.equal(gizmo.dragEnabled, false);
  assert.equal(gizmo.dragging, false);
  assert.equal(gizmo.dragMode, null);
  assert.equal(gizmo.dragBone, null);
  assert.equal(ends, 1);
});

test('right drag writes the degree angle returned by CoordinateUtils', () => {
  assert.match(source, /this\.dragBone\.rotation = ang;/);
  assert.doesNotMatch(source, /this\.dragBone\.rotation = ang \* \(Math\.PI \/ 180\)/);
});
