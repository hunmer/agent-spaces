import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHorizontalPartLayout,
  collectSlotReferenceParts,
  fitInside,
  padPartLayoutToAspect,
  scalePartLayout,
  selectApplicablePartResults,
} from './slotReference.js';

test('collectSlotReferenceParts uses setup attachments and atlas regions', () => {
  const parts = collectSlotReferenceParts({
    slots: [{ name: 'head', attachment: 'head-idle' }, { name: 'body' }],
    skins: { default: {
      head: { other: { path: 'other' }, 'head-idle': { path: 'head-region' } },
      body: { body: { name: 'body-region' } },
    } },
  }, [
    { name: 'head-region', w: 40, h: 30, origW: 44, origH: 32 },
    { name: 'body-region', w: 60, h: 80 },
  ]);
  assert.deepEqual(parts.map(({ id, regionName, width, height }) => ({ id, regionName, width, height })), [
    { id: 'head', regionName: 'head-region', width: 44, height: 32 },
    { id: 'body', regionName: 'body-region', width: 60, height: 80 },
  ]);
});

test('cutout output is contained without stretching', () => {
  assert.deepEqual(fitInside(100, 50, 40, 40), { x: 0, y: 10, width: 40, height: 20 });
  assert.deepEqual(fitInside(50, 100, 40, 40), { x: 10, y: 0, width: 20, height: 40 });
});

test('reference layout is transparently padded to the workflow aspect', () => {
  const layout = buildHorizontalPartLayout([{ id: 'wide', width: 200, height: 50 }]);
  const padded = padPartLayoutToAspect(layout, 16 / 9);
  assert.equal(padded.width, 200);
  assert.equal(padded.height, 113);
  assert.equal(padded.items[0].x, 0);
  assert.equal(padded.items[0].y, 31.5);
});

test('horizontal layout preserves sizes and scales split coordinates to workflow output', () => {
  const layout = buildHorizontalPartLayout([
    { id: 'head', width: 40, height: 30 },
    { id: 'body', width: 60, height: 80 },
  ]);
  assert.deepEqual({ width: layout.width, height: layout.height }, { width: 100, height: 80 });
  assert.deepEqual(layout.items.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })), [
    { id: 'head', x: 0, y: 0, width: 40, height: 30 },
    { id: 'body', x: 40, y: 0, width: 60, height: 80 },
  ]);
  assert.deepEqual(
    scalePartLayout(layout, 200, 160).map(({ sourceX, sourceY, sourceWidth, sourceHeight }) => (
      { sourceX, sourceY, sourceWidth, sourceHeight }
    )),
    [
      { sourceX: 0, sourceY: 0, sourceWidth: 80, sourceHeight: 60 },
      { sourceX: 80, sourceY: 0, sourceWidth: 120, sourceHeight: 160 },
    ],
  );
});

test('split coordinates preserve each part aspect ratio when workflow output aspect differs', () => {
  const layout = buildHorizontalPartLayout([
    { id: 'head', width: 40, height: 30 },
    { id: 'body', width: 60, height: 80 },
  ]);
  const [head, body] = scalePartLayout(layout, 200, 120);
  assert.equal(head.sourceWidth / head.sourceHeight, head.width / head.height);
  assert.equal(body.sourceWidth / body.sourceHeight, body.width / body.height);
});

test('current animation replacement overrides all-animation and preview overrides both', () => {
  const results = [
    { id: 'all', regionName: 'head', scope: 'all' },
    { id: 'walk', regionName: 'head', scope: 'animation', animation: 'walk' },
    { id: 'idle', regionName: 'head', scope: 'animation', animation: 'idle' },
    { id: 'preview', regionName: 'head', scope: 'preview', animation: 'walk' },
  ];
  assert.equal(selectApplicablePartResults(results, 'walk')[0].id, 'preview');
  assert.equal(selectApplicablePartResults(results, 'idle')[0].id, 'idle');
  assert.equal(selectApplicablePartResults(results, 'jump')[0].id, 'all');
});
