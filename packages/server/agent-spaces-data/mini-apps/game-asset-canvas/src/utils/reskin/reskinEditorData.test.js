import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpineAssetsSignature,
  normalizeReskinEditorData,
} from './reskinEditorData.js';

const assets = {
  skel: 'https://example.com/hero.json',
  atlas: 'https://example.com/hero.atlas',
  png: 'https://example.com/hero.png',
};

const fallbacks = {
  size: '2k',
  processingModel: 'gpt-image-1',
  erosion: { enabled: true, pxSmall: 1 },
};

test('asset signature stays stable when node persistence clones the assets object', () => {
  assert.equal(
    getSpineAssetsSignature(assets),
    getSpineAssetsSignature(structuredClone(assets)),
  );
  assert.notEqual(
    getSpineAssetsSignature(assets),
    getSpineAssetsSignature({ ...assets, png: 'https://example.com/changed.png' }),
  );
});

test('restores generated image and reskin form fields for the same Spine assets', () => {
  const assetSignature = getSpineAssetsSignature(assets);
  const restored = normalizeReskinEditorData({
    assetSignature,
    prompt: 'gold armor',
    skinName: 'gold',
    method: 'exploded',
    segMethod: 'bg_components',
    size: '4k',
    erosion: { enabled: false, pxSmall: 3 },
    processingModel: 'custom-model',
    slotMode: true,
    selectedSlot: 'helmet',
    generatedImageUrl: 'https://example.com/generated.png',
  }, assets, fallbacks);

  assert.deepEqual(restored, {
    assetSignature,
    assets: { ...assets, name: '' },
    prompt: 'gold armor',
    skinName: 'gold',
    method: 'exploded',
    segMethod: 'bg_components',
    size: '4k',
    erosion: { enabled: false, pxSmall: 3 },
    processingModel: 'custom-model',
    slotMode: true,
    selectedSlot: 'helmet',
    generatedImageUrl: 'https://example.com/generated.png',
  });
});

test('drops a generated image when the Spine assets change', () => {
  const restored = normalizeReskinEditorData({
    assetSignature: getSpineAssetsSignature(assets),
    prompt: 'gold armor',
    generatedImageUrl: 'https://example.com/generated.png',
  }, { ...assets, png: 'https://example.com/other.png' }, fallbacks);

  assert.equal(restored.prompt, 'gold armor');
  assert.equal(restored.generatedImageUrl, '');
});

test('restores library-selected Spine assets from the node snapshot', () => {
  const restored = normalizeReskinEditorData({
    assets,
    assetSignature: getSpineAssetsSignature(assets),
    generatedImageUrl: 'https://example.com/generated.png',
  }, null, fallbacks);

  assert.deepEqual(restored.assets, { ...assets, name: '' });
  assert.equal(restored.generatedImageUrl, 'https://example.com/generated.png');
});
