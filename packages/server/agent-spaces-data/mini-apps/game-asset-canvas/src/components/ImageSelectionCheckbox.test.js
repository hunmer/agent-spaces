import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sources = [
  fs.readFileSync(new URL('./nodes/ImageResult.jsx', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('./nodes/UpstreamImageList.jsx', import.meta.url), 'utf8'),
  fs.readFileSync(new URL('./FileUpload.jsx', import.meta.url), 'utf8'),
];

test('image checkboxes forward Command/Ctrl for additive cross-node selection', () => {
  for (const source of sources) {
    assert.match(source, /toggle\(nodeId, (?:url|item\.src), (?:e|ev)\.metaKey \|\| (?:e|ev)\.ctrlKey\)/);
  }
});
