import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { attachmentWorldVertices, BoneGizmoLayer, pointInPolygon } from '../core/BoneGizmoLayer.js';

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

test('pointer capture keeps trackpad dragging active outside the gizmo hit area', () => {
  let captured = null;
  const target = { setPointerCapture: (id) => { captured = id; } };
  const gizmo = { pointerCaptureTarget: null, pointerCaptureId: null };

  BoneGizmoLayer.prototype._capturePointer.call(gizmo, {
    nativeEvent: { target, pointerId: 7 },
  });

  assert.equal(captured, 7);
  assert.equal(gizmo.pointerCaptureTarget, target);
  assert.equal(gizmo.pointerCaptureId, 7);
});

test('selected bone handle is enlarged', () => {
  assert.match(source, /isSel \? 10 : 4/);
});

test('attachment hit testing selects the topmost slot bone', () => {
  const backBone = { data: { name: 'back' } };
  const frontBone = { data: { name: 'front' } };
  const region = (bone, left) => ({
    bone,
    attachment: {
      region: {},
      computeWorldVertices(_bone, output) {
        output.set([left, 0, left + 20, 0, left + 20, 20, left, 20]);
      },
    },
  });
  const gizmo = {
    spine: {
      toLocal: (point) => point,
      skeleton: { drawOrder: [region(backBone, 0), region(frontBone, 5)] },
    },
  };

  assert.equal(BoneGizmoLayer.prototype.hitTestAttachments.call(gizmo, 10, 10), frontBone);
  assert.equal(BoneGizmoLayer.prototype.hitTestAttachments.call(gizmo, 30, 30), null);
});

test('mesh attachment vertices and polygon helper support body hit geometry', () => {
  const slot = {
    bone: {},
    attachment: {
      triangles: [0, 1, 2],
      worldVerticesLength: 6,
      computeWorldVertices(_slot, _start, _count, output) { output.set([0, 0, 20, 0, 10, 20]); },
    },
  };
  assert.deepEqual([...attachmentWorldVertices(slot)], [0, 0, 20, 0, 10, 20]);
  assert.equal(pointInPolygon(5, 5, new Float32Array([0, 0, 10, 0, 10, 10, 0, 10])), true);
});

test('bone group highlight includes descendants', () => {
  const child = { children: [] };
  const root = { children: [child] };
  const gizmo = { highlightedBones: new Set(), highlightTimer: null, redraw() {} };
  BoneGizmoLayer.prototype.flashBoneGroup.call(gizmo, root, 1000);
  clearTimeout(gizmo.highlightTimer);
  assert.deepEqual([...gizmo.highlightedBones], [root, child]);
});
