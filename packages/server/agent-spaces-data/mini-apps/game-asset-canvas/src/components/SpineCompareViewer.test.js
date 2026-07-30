import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./SpineCompareViewer.jsx', import.meta.url), 'utf8');

test('Spine compare viewer creates a read-only editor and destroys it on cleanup', () => {
  assert.match(source, /new SpineEditorApp\(host\)/);
  assert.match(source, /editor\.setViewInteractionEnabled\(false\)/);
  assert.match(source, /editor\.gizmo\?\.setVisible\(false\)/);
  assert.match(source, /editor\?\.destroy\(\)/);
});

test('Spine compare viewer selects the requested generated skin when available', () => {
  assert.match(source, /skins\.includes\(assets\.skinName\)/);
  assert.match(source, /editor\.setSkin\(skinName\)/);
});
