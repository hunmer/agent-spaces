import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAtlasComposite, cropAtlasHalf } from './compositeBuilder.js';

test('buildAtlasComposite returns the canvas it creates', () => {
  const drawCalls = [];
  const context = {
    fillRect: (...args) => drawCalls.push(['fillRect', ...args]),
    drawImage: (...args) => drawCalls.push(['drawImage', ...args]),
  };
  const createdCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
  };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => createdCanvas };

  try {
    const snapshot = { width: 100, height: 80 };
    const atlasSheet = { width: 60, height: 120 };
    const result = buildAtlasComposite(snapshot, atlasSheet);

    assert.equal(result.canvas, createdCanvas);
    assert.deepEqual(result.layout, {
      version: 2,
      mode: 'atlas',
      compositeW: 160,
      compositeH: 120,
      snapshotRect: { x: 0, y: 20, w: 100, h: 80 },
      atlasRect: { x: 100, y: 0, w: 60, h: 120 },
    });
    assert.deepEqual(drawCalls, [
      ['fillRect', 0, 0, 160, 120],
      ['drawImage', snapshot, 0, 20],
      ['drawImage', atlasSheet, 100, 0],
    ]);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('cropAtlasHalf maps the logical atlas rect to the workflow output and preserves 4K size', () => {
  const drawCalls = [];
  const context = { drawImage: (...args) => drawCalls.push(args) };
  const croppedCanvas = { width: 0, height: 0, getContext: () => context };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => croppedCanvas };

  try {
    const workflowOutput = { width: 800, height: 600 };
    const layout = {
      compositeW: 400,
      compositeH: 200,
      atlasRect: { x: 200, y: 0, w: 200, h: 200 },
    };
    const result = cropAtlasHalf(workflowOutput, layout);

    assert.equal(result, croppedCanvas);
    assert.equal(result.width, 400);
    assert.equal(result.height, 600);
    assert.deepEqual(drawCalls, [[
      workflowOutput,
      400, 0, 400, 600,
      0, 0, 400, 600,
    ]]);
  } finally {
    globalThis.document = previousDocument;
  }
});
