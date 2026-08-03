import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dialogSource = fs.readFileSync(new URL('../components/VideoEditorDialog.jsx', import.meta.url), 'utf8');
const pluginSource = fs.readFileSync(new URL('../../../../plugins/ffmpeg/frames.js', import.meta.url), 'utf8');

test('video editor requests source-resolution extraction and passes an enabled crop region', () => {
  assert.doesNotMatch(dialogSource, /maxWidth: params\.maxWidth/);
  assert.match(dialogSource, /cropRegion: params\.cropEnabled \? normalizeCropRegion\(params\.cropRegion\) : undefined/);
  assert.match(dialogSource, /<VideoCropOverlay/);
});

test('ffmpeg frame extraction uses lossless PNG output in every mode', () => {
  const extractionSource = pluginSource.slice(
    pluginSource.indexOf("name: 'ffmpeg_extract_frames'"),
    pluginSource.indexOf("name: 'ffmpeg_custom'"),
  );
  assert.match(extractionSource, /frame-%04d\.png/);
  assert.match(extractionSource, /frame-0001\.png/);
  assert.match(extractionSource, /\/\^frame\.\*\\\.png\$\/i/);
  assert.doesNotMatch(extractionSource, /\.jpe?g/);
  assert.doesNotMatch(extractionSource, /'-q:v'/);
});

test('ffmpeg composes normalized crop with all sampling filters', () => {
  assert.match(pluginSource, /normalizeCropRegion\(args\.cropRegion\)/);
  assert.match(pluginSource, /crop=trunc\(iw\*\$\{cropRegion\.width\}\):trunc\(ih\*\$\{cropRegion\.height\}\)/);
  assert.match(pluginSource, /filterArgs\(`select=not/);
  assert.match(pluginSource, /filterArgs\(`fps=/);
});
