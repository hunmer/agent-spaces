import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMaskAlpha, drawRegionPart } from './maskRepaint.js';

test('applyMaskAlpha keeps source RGB and applies grayscale mask to alpha', () => {
  const source = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);
  const mask = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
  assert.deepEqual(
    [...applyMaskAlpha(source, mask)],
    [10, 20, 30, 255, 40, 50, 60, 0],
  );
});

test('drawRegionPart clears and draws an unrotated atlas region', () => {
  const calls = [];
  const ctx = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
  };
  const image = {};
  drawRegionPart(ctx, image, { x: 2, y: 3, w: 4, h: 5, rotate: 0 });
  assert.deepEqual(calls, [
    ['clearRect', 2, 3, 4, 5],
    ['drawImage', image, 2, 3, 4, 5],
  ]);
});

test('drawRegionPart rotates a 90 degree atlas region using preview coordinates', () => {
  const calls = [];
  const ctx = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    save: () => calls.push(['save']),
    translate: (...args) => calls.push(['translate', ...args]),
    rotate: (...args) => calls.push(['rotate', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    restore: () => calls.push(['restore']),
  };
  const image = {};
  drawRegionPart(ctx, image, { x: 2, y: 3, w: 4, h: 5, rotate: 90 });
  assert.deepEqual(calls, [
    ['clearRect', 2, 3, 4, 5],
    ['save'],
    ['translate', 6, 3],
    ['rotate', Math.PI / 2],
    ['drawImage', image, 0, 0, 5, 4],
    ['restore'],
  ]);
});
