import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./GroupAssetLibraryDialog.jsx', import.meta.url), 'utf8');

test('group asset dialog defaults to all selected and submits only selected assets', () => {
  assert.match(source, /setSelected\(new Set\(assets\.map\(\(_, index\) => index\)\)\)/);
  assert.match(source, /assets\.filter\(\(_, index\) => selected\.has\(index\)\)/);
  assert.match(source, /onSubmit\?\.\(categoryName, selectedAssets\)/);
});

test('group asset dialog uses a bounded responsive grid', () => {
  assert.match(source, /maxHeight: '80vh'/);
  assert.match(source, /repeat\(auto-fill, minmax\(96px, 1fr\)\)/);
  assert.match(source, /className="grid min-w-0 gap-2 p-2"/);
});
