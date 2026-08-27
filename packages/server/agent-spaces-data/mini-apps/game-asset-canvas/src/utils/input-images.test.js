import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInputAudios, computeInputImages, computeInputTexts, computeInputVideos } from './input-images.js';
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

test('computeInputTexts replaces only selected variables in the persisted target template', () => {
  const nodes = [
    { id: 'subject', type: NODE_TYPES.text, data: { output: { text: '<p>机械骑士</p>' } } },
    { id: 'style', type: NODE_TYPES.text, data: { output: { text: '像素风' } } },
    {
      id: 'target',
      type: NODE_TYPES.textToImage,
      data: { params: { prompt: '<p>绘制 {subject}，使用 {style}，保留 {lighting}</p>' } },
    },
  ];
  const edges = [
    { ...edge('subject', 'target'), data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' } },
    { ...edge('style', 'target'), id: 'style-target', data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'style' } },
  ];

  assert.deepEqual(computeInputTexts(nodes, edges).get('target'), {
    prompt: '绘制 机械骑士，使用 像素风，保留 {lighting}',
  });
});

test('computeInputTexts keeps legacy whole-field replacement ahead of variable edges', () => {
  const nodes = [
    { id: 'whole', type: NODE_TYPES.text, data: { output: { text: '完整提示词' } } },
    { id: 'subject', type: NODE_TYPES.text, data: { output: { text: '机械骑士' } } },
    { id: 'target', type: NODE_TYPES.textToImage, data: { params: { prompt: '绘制 {subject}' } } },
  ];
  const edges = [
    { ...edge('whole', 'target'), data: { inputType: 'text', inputTarget: 'prompt' } },
    { ...edge('subject', 'target'), id: 'subject-target', data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' } },
  ];

  assert.deepEqual(computeInputTexts(nodes, edges).get('target'), { prompt: '完整提示词' });
});

test('computeInputTexts uses connected text before manual fallback and restores fallback after disconnect', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.text, data: { output: { text: '连线角色' } } },
    {
      id: 'target',
      type: NODE_TYPES.textToImage,
      data: {
        params: { prompt: '绘制 {subject}' },
        textVariableValues: { prompt: { subject: '手动角色' } },
      },
    },
  ];
  const connectedEdges = [{
    ...edge('source', 'target'),
    data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' },
  }];

  assert.deepEqual(computeInputTexts(nodes, connectedEdges).get('target'), { prompt: '绘制 连线角色' });
  assert.deepEqual(computeInputTexts(nodes, []).get('target'), { prompt: '绘制 手动角色' });
});

test('computeInputTexts resolves {{node.key}} output references at execution time', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.text, data: { title: '文案', output: { text: '机械骑士', mood: '史诗' } } },
    { id: 'target', type: NODE_TYPES.textToImage, data: { params: { prompt: '主题 {{文案.text}}，风格 {{文案.mood}}' } } },
  ];
  const edges = [{ ...edge('source', 'target'), data: { inputType: 'text', inputTarget: 'prompt', inputVariable: 'subject' } }];
  assert.deepEqual(computeInputTexts(nodes, edges).get('target'), { prompt: '主题 机械骑士，风格 史诗' });
});

test('computeInputAudios forwards generated audio through display nodes', () => {
  const nodes = [
    { id: 'source', type: NODE_TYPES.textToVoice, data: { output: { audios: ['voice.mp3'] } } },
    { id: 'display-a', type: NODE_TYPES.audioDisplay, data: { audios: [] } },
    { id: 'display-b', type: NODE_TYPES.audioDisplay, data: { audios: [] } },
  ];
  const result = computeInputAudios(nodes, [edge('source', 'display-a'), edge('display-a', 'display-b')]);
  assert.deepEqual(result.get('display-a')?.audios, ['voice.mp3']);
  assert.deepEqual(result.get('display-b')?.audios, ['voice.mp3']);
});

test('storyboard edges forward only their selected source asset', () => {
  const nodes = [
    { id: 'story', type: NODE_TYPES.storyboard, data: { scenes: [] } },
    { id: 'image-target', type: NODE_TYPES.imageDisplay, data: {} },
    { id: 'video-target', type: NODE_TYPES.videoDisplay, data: {} },
    { id: 'audio-target', type: NODE_TYPES.audioDisplay, data: {} },
  ];
  const edges = [
    { ...edge('story', 'image-target'), data: { inputType: 'image', inputTarget: 'images', sourceAsset: { type: 'image', url: 'shot.png', thumb: 'shot-thumb.jpg', label: '图片 1' } } },
    { ...edge('story', 'video-target'), id: 'story-video', data: { inputType: 'video', inputTarget: 'videos', sourceAsset: { type: 'video', url: 'shot.mp4' } } },
    { ...edge('story', 'audio-target'), id: 'story-audio', data: { inputType: 'audio', inputTarget: 'audios', sourceAsset: { type: 'audio', url: 'line.mp3' } } },
  ];

  assert.deepEqual(computeInputImages(nodes, edges).get('image-target')?.images, ['shot.png']);
  assert.deepEqual(computeInputImages(nodes, edges).get('image-target')?.resources, [
    { url: 'shot.png', thumb: 'shot-thumb.jpg', label: '图片 1' },
  ]);
  assert.deepEqual(computeInputVideos(nodes, edges).get('video-target')?.videos, ['shot.mp4']);
  assert.deepEqual(computeInputAudios(nodes, edges).get('audio-target')?.audios, ['line.mp3']);
});
