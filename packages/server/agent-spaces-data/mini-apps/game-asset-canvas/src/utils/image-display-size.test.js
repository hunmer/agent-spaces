import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getImageDisplayNodeSize,
  normalizeImageRotation,
} from './image-display-size.js';

test('getImageDisplayNodeSize preserves a landscape image ratio', () => {
  assert.deepEqual(getImageDisplayNodeSize(1600, 900, 0), { w: 344, h: 204 });
});

test('getImageDisplayNodeSize swaps the display ratio after a quarter turn', () => {
  assert.deepEqual(getImageDisplayNodeSize(1600, 900, 90), { w: 204, h: 344 });
});

test('normalizeImageRotation cycles rotation into 0..270 degrees', () => {
  assert.equal(normalizeImageRotation(450), 90);
  assert.equal(normalizeImageRotation(-90), 270);
});

test('getImageDisplayNodeSize falls back for invalid image dimensions', () => {
  assert.deepEqual(getImageDisplayNodeSize(0, 0), { w: 260, h: 240 });
});
