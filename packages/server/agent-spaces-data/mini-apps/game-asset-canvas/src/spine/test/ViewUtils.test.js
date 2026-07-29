import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateFitTransform } from '../core/ViewUtils.js';

test('fit transform centers bounds and preserves padding', () => {
  const result = calculateFitTransform(
    { x: -100, y: -200, width: 200, height: 400 },
    { width: 800, height: 600 },
    { padding: 50, maxScale: 2 },
  );

  assert.deepEqual(result, { scale: 1.25, x: 400, y: 300 });
});

test('fit transform caps enlargement at the editor zoom limit', () => {
  const result = calculateFitTransform(
    { x: 10, y: 20, width: 20, height: 20 },
    { width: 800, height: 600 },
    { padding: 60, maxScale: 5 },
  );

  assert.deepEqual(result, { scale: 5, x: 300, y: 150 });
});

test('fit transform remains positive when viewport is smaller than padding', () => {
  const result = calculateFitTransform(
    { x: 0, y: 0, width: 100, height: 100 },
    { width: 80, height: 80 },
    { padding: 60, minScale: 0.1 },
  );

  assert.equal(result.scale, 0.1);
  assert.deepEqual({ x: result.x, y: result.y }, { x: 35, y: 35 });
});
