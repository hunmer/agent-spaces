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

test('preview tabs keep both players mounted and only switch visibility', () => {
  assert.match(dialogSource, /previewTab === 'video' \? 'flex' : 'hidden'/);
  assert.match(dialogSource, /previewTab === 'frames' \? 'flex' : 'hidden'/);
  assert.match(dialogSource, /<video ref=\{videoRef\}/);
  assert.match(dialogSource, /active=\{previewTab === 'frames'\}/);
});

test('video editor keeps compose dependencies stable during local rerenders', () => {
  assert.match(dialogSource, /const frames = useMemo\([\s\S]*?\[data\?\.frames\],[\s\S]*?\);/);
  assert.match(dialogSource, /const groupFrames = useCallback\([\s\S]*?\[frames\]\);/);
  assert.match(dialogSource, /const composeSheetDataUrl = useCallback\([\s\S]*?\[groupFrames, sheetLayout\.cols\]\);/);
});

test('frame player advances locally and releases its timer', () => {
  assert.match(playerSource, /setInterval\(\(\) =>/);
  assert.match(playerSource, /return \(\) => clearInterval\(timer\)/);
  assert.match(playerSource, /<img[\s\S]*src=\{currentUrl\}/);
  assert.doesNotMatch(playerSource, /getFastImageSequence/);
  assert.doesNotMatch(vendorLoaderSource, /getFastImageSequence/);
});

test('frame player exposes a loop toggle and stops at the end when loop is disabled', () => {
  assert.match(playerSource, /Repeat2/);
  assert.match(playerSource, /aria-pressed=\{loop\}/);
  assert.match(playerSource, /if \(!loop && current >= end\) \{[\s\S]*setPlaying\(false\);[\s\S]*return;/);
  assert.match(playerSource, /const next = current >= end \? start : current \+ 1/);
});

test('frame list exposes clamped range inputs, quick group creation, and a wrapped scroll grid', () => {
  assert.match(dialogSource, /setFrameBoundary\('startFrame', event\.target\.value\)/);
  assert.match(dialogSource, /setFrameBoundary\('endFrame', event\.target\.value\)/);
  assert.match(dialogSource, /title="添加到动画组"/);
  assert.match(dialogSource, /setActiveTab\('anim'\)/);
  assert.match(dialogSource, /gridTemplateColumns: 'repeat\(auto-fill, minmax\(112px, 1fr\)\)'/);
});

test('animation groups retain their own extracted frame source', () => {
  assert.match(dialogSource, /frames: \[\.\.\.frames\]/);
  assert.match(dialogSource, /Array\.isArray\(g\.frames\) && g\.frames\.length \? g\.frames : frames/);
  assert.match(dialogSource, /frames=\{groupSourceFrames\}/);
});

test('video upload and thumbnails fill the sidebar with compact spacing', () => {
  assert.match(dialogSource, /\.video-thumb-upload \{ width: 100%; \}/);
  assert.match(dialogSource, /className="video-thumb-upload mb-1"/);
  assert.match(dialogSource, /className="flex flex-col gap-1"/);
});
