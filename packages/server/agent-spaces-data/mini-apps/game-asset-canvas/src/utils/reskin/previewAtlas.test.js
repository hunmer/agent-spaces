import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPreviewAtlas } from './previewAtlas.js';

test('buildPreviewAtlas keeps regions at their original atlas coordinates', () => {
  const calls = [];
  const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args) }) };
  const part = { width: 4, height: 6 };
  const result = buildPreviewAtlas(
    [{ name: 'body', x: 12, y: 8, w: 4, h: 6, rotate: 0 }],
    { body: { img: part } },
    64,
    32,
    () => canvas,
  );

  assert.equal(result, canvas);
  assert.deepEqual(calls, [[part, 12, 8, 4, 6]]);
});
