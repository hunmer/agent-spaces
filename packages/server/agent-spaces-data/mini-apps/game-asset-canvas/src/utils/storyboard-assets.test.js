import test from 'node:test';
import assert from 'node:assert/strict';
import { NODE_TYPES } from './constants.js';
import {
  createStoryboardSceneHandleId, getStoryboardSceneAssets,
  parseStoryboardSceneHandleId, resolveStoryboardHandleAssets,
} from './storyboard-assets.js';

test('storyboard scene handle ids round-trip arbitrary scene ids', () => {
  const handleId = createStoryboardSceneHandleId('scene / 1');
  assert.equal(parseStoryboardSceneHandleId(handleId), 'scene / 1');
  assert.equal(parseStoryboardSceneHandleId('source'), null);
});

test('storyboard scene assets preserve media type, order, and image thumbnails', () => {
  assert.deepEqual(getStoryboardSceneAssets({
    id: 'scene-1',
    images: [{ url: 'hero.png', thumb: 'hero-thumb.jpg' }, 'wide.png'],
    videos: ['shot.mp4'],
    audios: ['line.mp3'],
  }), [
    { id: 'image:0', sceneId: 'scene-1', type: 'image', url: 'hero.png', thumb: 'hero-thumb.jpg', label: '图片 1' },
    { id: 'image:1', sceneId: 'scene-1', type: 'image', url: 'wide.png', thumb: 'wide.png', label: '图片 2' },
    { id: 'video:0', sceneId: 'scene-1', type: 'video', url: 'shot.mp4', thumb: undefined, label: '视频 1' },
    { id: 'audio:0', sceneId: 'scene-1', type: 'audio', url: 'line.mp3', thumb: undefined, label: '音频 1' },
  ]);
});

test('storyboard handle lookup distinguishes unrelated handles from empty scenes', () => {
  const node = {
    type: NODE_TYPES.storyboard,
    data: { scenes: [{ id: 'empty', images: [], videos: [], audios: [] }] },
  };
  assert.equal(resolveStoryboardHandleAssets(node, 'source'), null);
  assert.deepEqual(resolveStoryboardHandleAssets(node, createStoryboardSceneHandleId('empty')), []);
});
