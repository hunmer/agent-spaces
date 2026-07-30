import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveReskinComparison } from './reskinHistoryData.js';

test('resolveReskinComparison uses explicit material and assembled Spine images', () => {
  assert.deepEqual(resolveReskinComparison({
    compare: {
      materialBefore: 'before-atlas.png',
      materialAfter: 'after-atlas.png',
      spineBefore: 'before-spine.png',
      spineAfter: 'after-spine.png',
    },
  }), {
    material: { before: 'before-atlas.png', after: 'after-atlas.png' },
    spine: { before: 'before-spine.png', after: 'after-spine.png' },
  });
});

test('resolveReskinComparison keeps material comparison available for old records', () => {
  assert.deepEqual(resolveReskinComparison({
    stages: [
      { label: '原 Atlas', src: 'old.png' },
      { label: '最终 Atlas', src: 'packed.png' },
    ],
    assets: { previewPngUrl: 'preview.png' },
  }), {
    material: { before: 'old.png', after: 'preview.png' },
    spine: { before: '', after: '' },
  });
});
