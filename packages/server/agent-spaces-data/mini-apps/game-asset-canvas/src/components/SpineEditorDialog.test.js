import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./SpineEditorDialog.jsx', import.meta.url), 'utf8');

test('viewer initialization depends on the asset URL signature, not the assets object identity', () => {
  assert.match(source, /getSpineAssetsSignature/);
  assert.match(source, /\[open, assetsSignature, canvasElement, loadAssets, touchRevision\]/);
  assert.doesNotMatch(source, /\[open, assets, canvasElement, loadAssets, touchRevision\]/);
});
