import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./MaskPaintDialog.jsx', import.meta.url), 'utf8');

test('binary mask mode preserves the input mask and locks painting to white', () => {
  assert.match(source, /mode === 'binary-mask'/);
  assert.match(source, /includeSource: binaryMaskModeRef\.current/);
  assert.match(source, /if \(includeSource && st\.img\) mctx\.drawImage/);
  assert.match(source, /setColor\('#ffffff'\)/);
  assert.match(source, /await onSaveRef\.current\?\.\(out\)/);
});
