import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pluginRoot = fileURLToPath(new URL('../../templates/plugins/sam/', import.meta.url));
const createActions = require(`${pluginRoot}/actions.js`) as (t: (key: string, fallback: string) => string) => Array<{
  name: string;
  run: (ctx: unknown, args: unknown) => Promise<unknown>;
}>;
const shared = require(`${pluginRoot}/shared.js`) as {
  segmentWithBoxes: (input: {
    baseUrl: string;
    timeout: number;
    imageBuffer: Buffer;
    boxes: unknown[];
  }) => Promise<unknown>;
};

test('SAM action sends all boxes in one request and saves every returned mask', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const saved: Buffer[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({
      masks: [
        { slot_id: 'head', score: 0.98, mask_b64: Buffer.from('mask-head').toString('base64') },
        { slot_id: 'body', score: 0.91, mask_b64: Buffer.from('mask-body').toString('base64') },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const action = createActions((_key, fallback) => fallback)
      .find((item) => item.name === 'sam_segment_with_boxes');
    assert.ok(action);
    const result = await action.run({
      logger: { info: () => {} },
      api: {
        savePublicFile(buffer: Buffer) {
          saved.push(buffer);
          return { httpPath: `/masks/${saved.length}.png` };
        },
      },
    }, {
      image: `data:image/png;base64,${Buffer.from('source-image').toString('base64')}`,
      boxes: [
        { slot_id: 'head', x_min: 1, y_min: 2, x_max: 11, y_max: 12 },
        { slot_id: 'body', x_min: 20, y_min: 30, x_max: 80, y_max: 100 },
      ],
      baseUrl: 'http://127.0.0.1:30231/',
      timeout: 1000,
    }) as {
      success: boolean;
      data: { total: number; masks: Array<{ slotId: string; score: number; maskUrl: string }> };
    };

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://127.0.0.1:30231/segment_with_boxes');
    assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
      image_base64: Buffer.from('source-image').toString('base64'),
      boxes: [
        { slot_id: 'head', x_min: 1, y_min: 2, x_max: 11, y_max: 12 },
        { slot_id: 'body', x_min: 20, y_min: 30, x_max: 80, y_max: 100 },
      ],
    });
    assert.equal(saved.length, 2);
    assert.equal(result.success, true);
    assert.equal(result.data.total, 2);
    assert.deepEqual(result.data.masks, [
      { slotId: 'head', score: 0.98, maskUrl: '/masks/1.png' },
      { slotId: 'body', score: 0.91, maskUrl: '/masks/2.png' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SAM HTTP errors preserve the service error detail', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'checkpoint missing' }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  );
  try {
    await assert.rejects(
      shared.segmentWithBoxes({
        baseUrl: 'http://127.0.0.1:30231',
        timeout: 1000,
        imageBuffer: Buffer.from('image'),
        boxes: [{ slot_id: 'head', x_min: 0, y_min: 0, x_max: 10, y_max: 10 }],
      }),
      /SAM HTTP 500: checkpoint missing/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
