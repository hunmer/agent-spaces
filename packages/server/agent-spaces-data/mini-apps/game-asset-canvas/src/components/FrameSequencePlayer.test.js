import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const playerSource = fs.readFileSync(new URL('./FrameSequencePlayer.jsx', import.meta.url), 'utf8');
const dialogSource = fs.readFileSync(new URL('./VideoEditorDialog.jsx', import.meta.url), 'utf8');
const vendorLoaderSource = fs.readFileSync(new URL('../utils/image-ops/cdn.js', import.meta.url), 'utf8');

test('video editor renders the frame player directly without an iframe', () => {
  assert.match(dialogSource, /import FrameSequencePlayer from '.\/FrameSequencePlayer'/);
  assert.match(dialogSource, /<FrameSequencePlayer/);
  assert.doesNotMatch(dialogSource, /<iframe\b/i);
  assert.doesNotMatch(playerSource, /<iframe\b/i);
});

test('frame player uses the miniapp vendor and releases its renderer', () => {
  assert.match(playerSource, /getFastImageSequence\(\)/);
  assert.match(playerSource, /instance\?\.destruct\?\.\(\)/);
  assert.match(vendorLoaderSource, /fast-image-sequence\/fast-image-sequence\.js/);
  assert.match(vendorLoaderSource, /AS\.srcFileUrl\(VENDOR_BASE \+ fileName\)/);
});
