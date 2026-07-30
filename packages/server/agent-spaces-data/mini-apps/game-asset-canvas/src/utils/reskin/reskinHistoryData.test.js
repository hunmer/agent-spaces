import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveReskinComparison } from './reskinHistoryData.js';

test('resolveReskinComparison uses explicit material and assembled Spine images', () => {
  assert.deepEqual(resolveReskinComparison({
    compare: {
      materialBefore: 'before-atlas.png',
      materialAfter: 'after-atlas.png',
      spineBeforeAssets: { skel: 'before.json', atlas: 'before.atlas', png: 'before.png' },
      spineAfterAssets: { skel: 'after.json', atlas: 'after.atlas', png: 'after.png', skinName: 'gold' },
    },
  }), {
    material: { before: 'before-atlas.png', after: 'after-atlas.png' },
    spine: {
      beforeAssets: { skel: 'before.json', atlas: 'before.atlas', png: 'before.png', skinName: '' },
      afterAssets: { skel: 'after.json', atlas: 'after.atlas', png: 'after.png', skinName: 'gold' },
    },
  });
});

test('resolveReskinComparison keeps material comparison available for old records', () => {
  assert.deepEqual(resolveReskinComparison({
    stages: [
      { label: '原 Atlas', src: 'old.png' },
      { label: '最终 Atlas', src: 'packed.png' },
    ],
    assets: {
      previewPngUrl: 'preview.png',
      spineJsonUrl: 'after.json', atlasUrl: 'after.atlas', pngUrl: 'after.png',
    },
    name: 'gold',
  }, { skel: 'before.json', atlas: 'before.atlas', png: 'before.png' }), {
    material: { before: 'old.png', after: 'preview.png' },
    spine: {
      beforeAssets: { skel: 'before.json', atlas: 'before.atlas', png: 'before.png', skinName: 'default' },
      afterAssets: { skel: 'after.json', atlas: 'after.atlas', png: 'after.png', skinName: 'gold' },
    },
  });
});
