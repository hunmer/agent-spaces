import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStoryboardGenerationPreset, resolveStoryboardGenerationParams } from './storyboard-generation.js';

test('legacy storyboard parameters resolve into four independent presets', () => {
  const resolved = resolveStoryboardGenerationParams({
    imageModel: 'legacy-image', videoModel: 'legacy-video', voiceModel: 'minimax',
    voiceId: 'speaker-1', aspect: '9:16', size: '2k', quality: '1080', duration: '10',
  });
  assert.deepEqual(resolved.textToImage, { model: 'legacy-image', aspect: '9:16', size: '2k', count: 1, concurrency: 1 });
  assert.deepEqual(resolved.editImage, { model: 'legacy-image', aspect: '9:16', size: '2k', count: 1, concurrency: 1 });
  assert.equal(resolved.video.model, 'legacy-video');
  assert.equal(resolved.video.quality, '1080');
  assert.equal(resolved.voice.model, 'minimax');
  assert.equal(resolved.voice.voiceId, 'speaker-1');
});

test('nested presets override legacy values and save independently', () => {
  const params = { imageModel: 'legacy', textToImage: { model: 'text-model', aspect: '1:1' } };
  const resolved = resolveStoryboardGenerationParams(params);
  assert.equal(resolved.textToImage.model, 'text-model');
  assert.equal(resolved.editImage.model, 'legacy');

  const next = mergeStoryboardGenerationPreset(params, 'editImage', { model: 'edit-model', size: '4k' });
  assert.equal(next.textToImage.model, 'text-model');
  assert.equal(next.editImage.model, 'edit-model');
  assert.equal(next.editImage.size, '4k');
});
