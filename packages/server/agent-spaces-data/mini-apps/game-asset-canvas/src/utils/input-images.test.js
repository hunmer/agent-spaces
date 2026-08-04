import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInputImages, computeInputTexts, computeInputVideos } from './input-images.js';
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

test('computeInputImages propagates thumbnail resources through passthrough nodes', () => {
  const resource = { url: 'full.png', thumb: 'thumb.jpg', groupName: '动作', label: '待机' };
  const nodes = [
    { id: 'source', type: NODE_TYPES.editImage, data: { output: { images: ['full.png'], resources: [resource] } } },
    { id: 'display', type: NODE_TYPES.imageDisplay, data: {} },
    { id: 'target', type: NODE_TYPES.imageProcess, data: {} },
  ];
  const result = computeInputImages(nodes, [edge('source', 'display'), edge('display', 'target')]);

  assert.deepEqual(result.get('display')?.resources, [resource]);
  assert.deepEqual(result.get('target')?.resources, [resource]);
  assert.deepEqual(result.get('target')?.images, ['full.png']);
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

test('computeInputImages does not accumulate images across repeated version switches', () => {
  const outputs = [['one.png'], ['one.png', 'two.png'], ['one.png'], ['one.png', 'two.png'], ['one.png']];
  const edges = [edge('source', 'target')];

  const counts = outputs.map((images) => {
    const nodes = [
      { id: 'source', type: NODE_TYPES.editImage, data: { output: { images } } },
      { id: 'target', type: NODE_TYPES.imageProcess, data: {} },
    ];
    return computeInputImages(nodes, edges).get('target')?.images.length;
  });
  assert.deepEqual(counts, [1, 2, 1, 2, 1]);
});

test('computeInputImages routes a selected edit-image mask away from regular inputs', () => {
  const nodes = [
    { id: 'input', type: NODE_TYPES.textToImage, data: { output: { images: ['input.png'] } } },
    { id: 'mask', type: NODE_TYPES.textToImage, data: { output: { images: ['mask.png'] } } },
    { id: 'target', type: NODE_TYPES.editImage, data: {} },
  ];
  const edges = [
    edge('input', 'target'),
    { ...edge('mask', 'target'), id: 'mask-target', data: { inputTarget: 'mask' } },
  ];

  const result = computeInputImages(nodes, edges).get('target');
  assert.deepEqual(result?.images, ['input.png']);
  assert.deepEqual(result?.fileUploads, { mask: ['mask.png'] });
});

test('computeInputTexts routes text products to selected target fields', () => {
  const nodes = [
    { id: 'manual', type: NODE_TYPES.text, data: { output: { text: '# Hero' } } },
    { id: 'reverse', type: NODE_TYPES.promptReverse, data: { output: { text: 'pixel art' } } },
    { id: 'target', type: NODE_TYPES.textToImage, data: {} },
  ];
  const edges = [
    { ...edge('manual', 'target'), data: { inputType: 'text', inputTarget: 'prompt' } },
    { ...edge('reverse', 'target'), id: 'reverse-target', data: { inputType: 'text', inputTarget: 'prompt' } },
  ];

  assert.deepEqual(computeInputTexts(nodes, edges).get('target'), {
    prompt: '# Hero\n\npixel art',
  });
});

test('computeInputTexts ignores image edges and keeps separate text targets', () => {
  const nodes = [
    { id: 'text', type: NODE_TYPES.text, data: { output: { text: 'voice line' } } },
    { id: 'image', type: NODE_TYPES.textToImage, data: { output: { images: ['hero.png'] } } },
    { id: 'target', type: NODE_TYPES.textToVoice, data: {} },
  ];
  const edges = [
    { ...edge('text', 'target'), data: { inputType: 'text', inputTarget: 'prompt' } },
    { ...edge('text', 'target'), id: 'voice-id', data: { inputType: 'text', inputTarget: 'voiceId' } },
    edge('image', 'target'),
  ];

  assert.deepEqual(computeInputTexts(nodes, edges).get('target'), {
    prompt: 'voice line',
    voiceId: 'voice line',
  });
});
