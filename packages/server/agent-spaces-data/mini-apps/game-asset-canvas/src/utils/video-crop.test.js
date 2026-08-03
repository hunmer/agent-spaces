import assert from 'node:assert/strict';
import test from 'node:test';
import { cropPointFromClient, cropRegionFromPoints, normalizeCropRegion } from './video-crop.js';

test('cropPointFromClient maps display coordinates to normalized video coordinates', () => {
  assert.deepEqual(cropPointFromClient(150, 100, { left: 50, top: 50, width: 200, height: 100 }), {
    x: 0.5,
    y: 0.5,
  });
});

test('cropRegionFromPoints supports dragging in either direction', () => {
  assert.deepEqual(cropRegionFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }), {
    x: 0.2,
    y: 0.1,
    width: 0.6,
    height: 0.6,
  });
});

test('normalizeCropRegion clamps a persisted region to the video bounds', () => {
  assert.deepEqual(normalizeCropRegion({ x: -1, y: 0.8, width: 2, height: 1 }), {
    x: 0,
    y: 0.8,
    width: 1,
    height: 0.2,
  });
  assert.equal(cropRegionFromPoints({ x: 0.2, y: 0.2 }, { x: 0.205, y: 0.8 }), null);
});
