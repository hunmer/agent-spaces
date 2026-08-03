import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFrameSelection, updateFrameSelection } from './frame-selection.js';

test('resolveFrameSelection defaults to the complete frame range', () => {
  assert.deepEqual(resolveFrameSelection(12, null), { startFrame: 0, endFrame: 11 });
});

test('resolveFrameSelection clamps persisted boundaries and rejects non-numeric values', () => {
  assert.deepEqual(resolveFrameSelection(5, { startFrame: 9, endFrame: 'bad' }), {
    startFrame: 4,
    endFrame: 4,
  });
});

test('plain click sets the start and keeps a later end', () => {
  assert.deepEqual(updateFrameSelection({ startFrame: 0, endFrame: 8 }, 3, false), {
    startFrame: 3,
    endFrame: 8,
  });
});

test('plain click past the end moves both boundaries', () => {
  assert.deepEqual(updateFrameSelection({ startFrame: 0, endFrame: 4 }, 7, false), {
    startFrame: 7,
    endFrame: 7,
  });
});

test('Ctrl or Command click sets only the end boundary', () => {
  assert.deepEqual(updateFrameSelection({ startFrame: 3, endFrame: 8 }, 10, true), {
    startFrame: 3,
    endFrame: 10,
  });
});
