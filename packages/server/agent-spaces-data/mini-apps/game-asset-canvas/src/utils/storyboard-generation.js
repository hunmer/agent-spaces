import {
  DEFAULT_MODEL, DEFAULT_VIDEO_MODEL, VIDEO_ASPECT_OPTIONS,
  VIDEO_DURATION_OPTIONS, VIDEO_QUALITY_OPTIONS, VOICE_PROVIDER_OPTIONS,
} from './constants.js';

const positiveInt = (value) => Math.max(1, Number(value) || 1);

export function resolveStoryboardGenerationParams(params = {}, settings = {}) {
  const legacyAspect = params.aspect || '16:9';
  const legacyCount = positiveInt(params.count);
  const legacyConcurrency = Math.min(legacyCount, positiveInt(params.concurrency));
  const common = { count: legacyCount, concurrency: legacyConcurrency };

  return {
    textToImage: {
      model: params.imageModel || settings.textToImageModels?.[0] || DEFAULT_MODEL,
      aspect: legacyAspect,
      size: params.size || '1k',
      ...common,
      ...(params.textToImage || {}),
    },
    editImage: {
      model: params.editImageModel || params.imageModel || settings.editImageModels?.[0] || DEFAULT_MODEL,
      aspect: legacyAspect,
      size: params.size || '1k',
      ...common,
      ...(params.editImage || {}),
    },
    video: {
      model: params.videoModel || DEFAULT_VIDEO_MODEL,
      aspect: legacyAspect || VIDEO_ASPECT_OPTIONS[0],
      quality: params.quality || VIDEO_QUALITY_OPTIONS[0],
      duration: params.duration || VIDEO_DURATION_OPTIONS[0],
      ...common,
      ...(params.video || {}),
    },
    voice: {
      model: params.voiceModel || VOICE_PROVIDER_OPTIONS[0]?.value || 'fish-audio',
      voiceId: params.voiceId || '',
      ...common,
      ...(params.voice || {}),
    },
  };
}

export function mergeStoryboardGenerationPreset(params, key, value, settings) {
  const resolved = resolveStoryboardGenerationParams(params, settings);
  return { ...(params || {}), [key]: { ...resolved[key], ...(value || {}) } };
}
