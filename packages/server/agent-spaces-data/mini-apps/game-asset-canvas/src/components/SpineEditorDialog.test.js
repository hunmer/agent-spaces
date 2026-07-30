import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./SpineEditorDialog.jsx', import.meta.url), 'utf8');

test('viewer initialization depends on the asset URL signature, not the assets object identity', () => {
  assert.match(source, /getSpineAssetsSignature/);
  assert.match(source, /\[open, assetsSignature, canvasElement, loadAssets, touchRevision\]/);
  assert.doesNotMatch(source, /\[open, assets, canvasElement, loadAssets, touchRevision\]/);
});

test('right sidebar exposes embedded reskin logs and binary mask repaint', () => {
  assert.match(source, /<TabsTrigger value="logs"/);
  assert.match(source, /<ReskinLogsPanel/);
  assert.match(source, /mode="binary-mask"/);
  assert.match(source, /repaintRegionMask/);
  assert.match(source, /callbacksRef\.current\.onReskinComplete/);
});
