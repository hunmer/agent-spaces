import test from 'node:test';
import assert from 'node:assert/strict';
import { countNodesWithOutput, hasNodeOutput } from './batch-run.js';

test('hasNodeOutput recognizes generated image, audio, video, and text outputs', () => {
  assert.equal(hasNodeOutput({ data: { output: { images: ['image.png'] } } }), true);
  assert.equal(hasNodeOutput({ data: { output: { audio: 'audio.mp3' } } }), true);
  assert.equal(hasNodeOutput({ data: { output: { videos: ['video.mp4'] } } }), true);
  assert.equal(hasNodeOutput({ data: { output: { text: 'result' } } }), true);
});

test('countNodesWithOutput ignores empty output values', () => {
  const nodes = [
    { data: { output: { images: [] } } },
    { data: { output: { audio: '', videos: [] } } },
    { data: { output: { images: ['image.png'] } } },
    { data: {} },
  ];

  assert.equal(countNodesWithOutput(nodes), 1);
});
