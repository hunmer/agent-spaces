// mapWithConcurrency / clampConcurrency 单测：保序、限流峰值、失败不阻塞、边界回退。
import assert from 'node:assert/strict';
import test from 'node:test';

import { mapWithConcurrency, clampConcurrency } from './concurrency.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('mapWithConcurrency keeps results in input order', async () => {
  const out = await mapWithConcurrency([30, 10, 20], 3, (v) => delay(v).then(() => v * 2));
  assert.deepEqual(out, [
    { status: 'fulfilled', value: 60 },
    { status: 'fulfilled', value: 20 },
    { status: 'fulfilled', value: 40 },
  ]);
});

test('mapWithConcurrency caps in-flight peak at limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  const out = await mapWithConcurrency(items, 3, async (v) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await delay(10);
    inFlight -= 1;
    return v;
  });
  assert.equal(peak, 3);
  assert.equal(out.filter((r) => r.status === 'fulfilled').length, 10);
});

test('mapWithConcurrency isolates per-item failures (allSettled shape)', async () => {
  const out = await mapWithConcurrency(['ok', 'bad', 'ok2'], 2, async (v) => {
    await delay(5);
    if (v === 'bad') throw new Error('boom');
    return v;
  });
  assert.equal(out[0].status, 'fulfilled');
  assert.equal(out[1].status, 'rejected');
  assert.equal(out[1].reason.message, 'boom');
  assert.equal(out[2].value, 'ok2');
});

test('mapWithConcurrency handles empty input and limit larger than items', async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, (v) => v), []);
  const out = await mapWithConcurrency([1, 2], 99, (v) => v);
  assert.equal(out.length, 2);
});

test('mapWithConcurrency falls back to unlimited when limit invalid', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 6 }, (_, i) => i);
  await mapWithConcurrency(items, 0, async (v) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await delay(5);
    inFlight -= 1;
    return v;
  });
  assert.equal(peak, items.length, 'limit<=0 应退化为不限并发（等价 allSettled）');
});

test('clampConcurrency clamps to range with fallback', () => {
  assert.equal(clampConcurrency(undefined, 4), 4);
  assert.equal(clampConcurrency('', 2), 2);
  assert.equal(clampConcurrency('3', 4), 3);
  assert.equal(clampConcurrency(99, 4, 1, 8), 8);
  assert.equal(clampConcurrency(0, 4, 1, 8), 1);
  assert.equal(clampConcurrency(2.9, 4), 2);
});
