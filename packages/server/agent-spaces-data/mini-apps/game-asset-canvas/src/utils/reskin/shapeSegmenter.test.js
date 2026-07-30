import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOriginalSilhouettes,
  segmentByConnectedComponents,
  segmentByShapeIntersection,
} from './shapeSegmenter.js';

class TestImage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
}

class TestImageBitmap {}

function installCanvasEnvironment(alphaValues) {
  const previousDocument = globalThis.document;
  const previousHtmlImage = globalThis.HTMLImageElement;
  const previousImageBitmap = globalThis.ImageBitmap;
  const drawCalls = [];
  globalThis.HTMLImageElement = TestImage;
  globalThis.ImageBitmap = TestImageBitmap;
  globalThis.document = {
    createElement: (tag) => {
      assert.equal(tag, 'canvas');
      const context = {
        drawImage: (...args) => drawCalls.push(args),
        getImageData: () => {
          const data = new Uint8ClampedArray(alphaValues.length * 4);
          alphaValues.forEach((alpha, index) => { data[index * 4 + 3] = alpha; });
          return { data };
        },
      };
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  return {
    drawCalls,
    restore: () => {
      globalThis.document = previousDocument;
      globalThis.HTMLImageElement = previousHtmlImage;
      globalThis.ImageBitmap = previousImageBitmap;
    },
  };
}

test('buildOriginalSilhouettes accepts an image source', () => {
  const env = installCanvasEnvironment([255, 0, 255, 255]);
  try {
    const result = buildOriginalSilhouettes(
      new TestImage(2, 2),
      [{ name: 'body', x: 0, y: 0, w: 2, h: 2 }],
    );
    assert.deepEqual([...result.body], [1, 0, 1, 1]);
    assert.equal(env.drawCalls.length, 1);
  } finally {
    env.restore();
  }
});

test('segmentByShapeIntersection accepts an image source', () => {
  const env = installCanvasEnvironment([255, 255, 0, 255]);
  try {
    const result = segmentByShapeIntersection(
      new TestImage(2, 2),
      [{ name: 'body', x: 0, y: 0, w: 2, h: 2 }],
      { body: new Uint8Array([1, 0, 1, 1]) },
    );
    assert.deepEqual([...result.body], [255, 0, 0, 255]);
    assert.equal(env.drawCalls.length, 1);
  } finally {
    env.restore();
  }
});

test('segmentByConnectedComponents matches the coloured foreground instead of opaque white background', () => {
  const alpha = [0, 255, 0, 0, 255, 0];
  const masks = segmentByConnectedComponents(
    alpha,
    3,
    2,
    { body: new Uint8Array([0, 1, 0, 0, 1, 0]) },
    { minPixels: 1, minIou: 0.05 },
  );
  assert.deepEqual([...masks.body], [0, 255, 0, 0, 255, 0]);
});
