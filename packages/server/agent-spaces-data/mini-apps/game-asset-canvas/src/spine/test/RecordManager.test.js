import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCaptureRect } from '../core/RecordManager.js';

test('capture rect is rounded and clamped to the source canvas', () => {
  assert.deepEqual(
    normalizeCaptureRect({ x: -10.4, y: 20.2, width: 120.8, height: 90.1 }, 200, 100),
    { x: 0, y: 20, width: 111, height: 80 },
  );
});

test('invalid capture rect falls back to the full source canvas', () => {
  assert.deepEqual(normalizeCaptureRect(null, 640, 480), { x: 0, y: 0, width: 640, height: 480 });
  assert.deepEqual(
    normalizeCaptureRect({ x: 700, y: 10, width: 20, height: 20 }, 640, 480),
    { x: 0, y: 0, width: 640, height: 480 },
  );
});
