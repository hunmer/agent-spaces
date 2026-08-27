import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const resultSource = fs.readFileSync(new URL('./ImageResult.jsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('./NodeShell.jsx', import.meta.url), 'utf8');

test('grouped output renders collapsible sections and label badges', () => {
  assert.match(resultSource, /groupOutputAssetItems\(list\)/);
  assert.match(resultSource, /aria-expanded=\{expanded\}/);
  assert.match(resultSource, /<OutputLabelBadge label=\{item\.label\}/);
  assert.match(resultSource, /right: 4px;/);
});

test('output preview receives resource metadata', () => {
  assert.match(shellSource, /resources=\{data\?\.output\?\.resources \|\| \[\]\} preview/);
});

test('reordering preserves URL and resource arrays separately', () => {
  assert.match(resultSource, /onReorderImages\(next\.map\(\(item\) => item\.url\), next\.map\(\(item\) => item\.resource\)\)/);
  assert.match(resultSource, /src: item\.url/);
});

test('gallery uses the same current output list as thumbnails', () => {
  assert.match(resultSource, /const galleryItems = list\.map/);
  assert.doesNotMatch(resultSource, /galleryOffset \+ index/);
});
