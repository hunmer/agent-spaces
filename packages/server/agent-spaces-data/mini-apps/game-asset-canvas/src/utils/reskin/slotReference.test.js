import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHorizontalPartLayout,
  collectSlotReferenceParts,
  fitInside,
  padPartLayoutToAspect,
  resolveSlotTargetRegionNames,
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

test('slot target regions follow attachment timelines and all-scope covers every attachment', () => {
  const spineJson = {
    slots: [{ name: 'face', attachment: 'idle' }],
    skins: { default: { face: {
      idle: { path: 'face-idle' },
      run: { path: 'face-run' },
      blink: { path: 'face-blink' },
    } } },
    animations: {
      idle: {},
      walk: { slots: { face: { attachment: [{ time: 0, name: 'run' }, { time: 0.2, name: 'blink' }] } } },
    },
  };
  const regions = ['face-idle', 'face-run', 'face-blink'].map((name) => ({ name }));
  assert.deepEqual(
    resolveSlotTargetRegionNames(spineJson, regions, 'face', 'walk', 'animation'),
    ['face-idle', 'face-run', 'face-blink'],
  );
  assert.deepEqual(
    resolveSlotTargetRegionNames(spineJson, regions, 'face', 'idle', 'animation'),
    ['face-idle'],
  );
  assert.deepEqual(
    resolveSlotTargetRegionNames(spineJson, regions, 'face', 'walk', 'all'),
    ['face-idle', 'face-run', 'face-blink'],
  );
  assert.deepEqual(
    resolveSlotTargetRegionNames({ ...spineJson, animations: undefined }, regions, 'face', 'walk', 'animation'),
    ['face-idle', 'face-run', 'face-blink'],
  );
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
    { id: 'all', slot: 'face', regionName: 'face-idle', scope: 'all' },
    { id: 'walk', slot: 'face', regionName: 'face-walk', scope: 'animation', animation: 'walk' },
    { id: 'idle', slot: 'face', regionName: 'face-idle', scope: 'animation', animation: 'idle' },
    { id: 'preview', slot: 'face', regionName: 'face-preview', scope: 'preview', animation: 'walk' },
  ];
  assert.deepEqual(selectApplicablePartResults(results, 'walk').map((item) => item.id), ['preview']);
  assert.deepEqual(selectApplicablePartResults(results, 'idle').map((item) => item.id), ['idle']);
  assert.deepEqual(selectApplicablePartResults(results, 'jump').map((item) => item.id), ['all']);
});
