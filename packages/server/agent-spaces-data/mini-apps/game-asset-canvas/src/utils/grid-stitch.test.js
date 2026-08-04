import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  mapObjectContainPoint, moveGridStitchItem, normalizeGridStitchData, orderGridStitchInputs,
} from './grid-stitch.js';

class TestImageData {
  constructor(dataOrWidth, widthOrHeight, maybeHeight) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight;
    }
  }
}

globalThis.ImageData = globalThis.ImageData || TestImageData;

const { applySpriteSheetCutout, composeSpriteSheet } = await import('./image-ops/spriteSheet.js');

test('grid stitch order keeps saved items, drops removed inputs, and appends new inputs', () => {
  assert.deepEqual(
    orderGridStitchInputs(['a', 'c', 'd'], ['c', 'b', 'a']),
    ['c', 'a', 'd'],
  );
  assert.deepEqual(
    normalizeGridStitchData({ order: ['b', 'a'], columns: 99 }, ['a', 'b', 'c']).order,
    ['b', 'a', 'c'],
  );
});

test('grid stitch drag reorder moves exactly one item', () => {
  assert.deepEqual(moveGridStitchItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveGridStitchItem(['a', 'b'], -1, 1), ['a', 'b']);
});

test('object-contain pointer mapping samples the original image without stretching', () => {
  assert.deepEqual(mapObjectContainPoint({ x: 75, y: 25 }, { width: 200, height: 100 }, { width: 100, height: 100 }), {
    x: 25,
    y: 25,
  });
  assert.equal(mapObjectContainPoint({ x: 10, y: 25 }, { width: 200, height: 100 }, { width: 100, height: 100 }), null);
});

test('sprite cutout becomes transparent before a unified canvas background is applied', () => {
  const magenta = new ImageData(new Uint8ClampedArray([255, 0, 255, 255]), 1, 1);
  const red = new ImageData(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
  const options = {
    columns: 2,
    spacing: 1,
    cutoutMethod: 'picked',
    cutoutColor: '#ff00ff',
    tolerance: 0,
    backgroundColor: '#112233',
  };
  assert.equal(applySpriteSheetCutout(magenta, options).data[3], 0);
  const sheet = composeSpriteSheet([magenta, red], options);
  assert.equal(sheet.width, 3);
  assert.equal(sheet.height, 1);
  assert.deepEqual([...sheet.data.slice(0, 4)], [17, 34, 51, 255]);
  assert.deepEqual([...sheet.data.slice(8, 12)], [255, 0, 0, 255]);
});

test('grid stitch editor keeps the forced dialog size and node-side edit entry', () => {
  const dialog = fs.readFileSync(new URL('../components/GridStitchDialog.jsx', import.meta.url), 'utf8');
  const node = fs.readFileSync(new URL('../components/nodes/ImageProcessNode.jsx', import.meta.url), 'utf8');
  assert.match(dialog, /width:\s*80vw !important/);
  assert.match(dialog, /height:\s*80vh !important/);
  assert.match(dialog, /输出到节点/);
  assert.match(dialog, /onPickColor=\{handleTogglePicking\}/);
  assert.match(dialog, /gridTemplateRows/);
  assert.match(dialog, /overflow-hidden rounded-md border/);
  assert.match(node, /<Pencil/);
  assert.match(node, /isGridStitch/);
});
