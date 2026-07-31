import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInputImages, computeInputVideos } from './input-images.js';
import { NODE_TYPES } from './constants.js';

const edge = (source, target) => ({ id: `${source}-${target}`, source, target });

test('computeInputImages replaces stale passthrough data after an upstream version switch', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.editImage, data: { output: { images: ['new.png'] } } },
    { id: 'display', type: NODE_TYPES.imageDisplay, data: { images: ['old.png'] } },
    { id: 'target', type: NODE_TYPES.imageProcess, data: {} },
  ];
  const result = computeInputImages(nodes, [edge('source', 'display'), edge('display', 'target')]);

  assert.deepEqual(result.get('display')?.images, ['new.png']);
  assert.deepEqual(result.get('target')?.images, ['new.png']);
});

test('computeInputVideos replaces stale display data after an upstream version switch', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.videoGenerator, data: { output: { videos: ['new.mp4'] } } },
    { id: 'display', type: NODE_TYPES.videoDisplay, data: { videos: ['old.mp4'] } },
    { id: 'target', type: NODE_TYPES.videoGenerator, data: {} },
  ];
  const result = computeInputVideos(nodes, [edge('source', 'display'), edge('display', 'target')]);

  assert.deepEqual(result.get('display')?.videos, ['new.mp4']);
  assert.deepEqual(result.get('target')?.videos, ['new.mp4']);
});

test('computeInputImages propagates an empty switched output instead of falling back to stale data', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.editImage, data: { output: { images: [] } } },
    { id: 'display', type: NODE_TYPES.imageDisplay, data: { images: ['old.png'] } },
    { id: 'target', type: NODE_TYPES.imageProcess, data: {} },
  ];
  const result = computeInputImages(nodes, [edge('source', 'display'), edge('display', 'target')]);

  assert.deepEqual(result.get('display')?.images, []);
  assert.deepEqual(result.get('target')?.images, []);
});

test('computeInputVideos keeps video editor uploads while forwarding the current upstream value', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.videoGenerator, data: { output: { videos: ['new.mp4'] } } },
    { id: 'editor', type: NODE_TYPES.videoEditor, data: { videos: ['upload.mp4'] } },
    { id: 'target', type: NODE_TYPES.videoGenerator, data: {} },
  ];
  const result = computeInputVideos(nodes, [edge('source', 'editor'), edge('editor', 'target')]);

  assert.deepEqual(result.get('editor')?.videos, ['new.mp4']);
  assert.deepEqual(result.get('target')?.videos, ['upload.mp4', 'new.mp4']);
});
