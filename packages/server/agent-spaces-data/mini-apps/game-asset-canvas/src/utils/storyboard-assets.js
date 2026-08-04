import { NODE_TYPES } from './constants.js';

export const STORYBOARD_SCENE_HANDLE_PREFIX = 'storyboard-scene:';

const MEDIA_FIELDS = [
  { field: 'images', type: 'image', label: '图片' },
  { field: 'videos', type: 'video', label: '视频' },
  { field: 'audios', type: 'audio', label: '音频' },
];

function normalizeMediaUrl(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.url === 'string') return value.url.trim();
  return '';
}

export function createStoryboardSceneHandleId(sceneId) {
  return `${STORYBOARD_SCENE_HANDLE_PREFIX}${encodeURIComponent(String(sceneId || ''))}`;
}

export function parseStoryboardSceneHandleId(handleId) {
  if (typeof handleId !== 'string' || !handleId.startsWith(STORYBOARD_SCENE_HANDLE_PREFIX)) return null;
  const encoded = handleId.slice(STORYBOARD_SCENE_HANDLE_PREFIX.length);
  if (!encoded) return null;
  try { return decodeURIComponent(encoded); }
  catch { return null; }
}

export function getStoryboardSceneAssets(scene) {
  if (!scene || typeof scene !== 'object') return [];
  return MEDIA_FIELDS.flatMap(({ field, type, label }) => {
    const values = Array.isArray(scene[field]) ? scene[field] : [];
    return values.map((value, index) => {
      const url = normalizeMediaUrl(value);
      if (!url) return null;
      return {
        id: `${type}:${index}`,
        sceneId: String(scene.id || ''),
        type,
        url,
        thumb: type === 'image'
          ? (typeof value === 'object' && value?.thumb ? value.thumb : url)
          : undefined,
        label: `${label} ${index + 1}`,
      };
    }).filter(Boolean);
  });
}

/** 非分镜 handle 返回 null；合法分镜 handle 即使暂无素材也返回空数组。 */
export function resolveStoryboardHandleAssets(sourceNode, handleId) {
  if (sourceNode?.type !== NODE_TYPES.storyboard) return null;
  const sceneId = parseStoryboardSceneHandleId(handleId);
  if (!sceneId) return null;
  const scenes = Array.isArray(sourceNode.data?.scenes) ? sourceNode.data.scenes : [];
  const scene = scenes.find((item) => String(item?.id || '') === sceneId);
  return scene ? getStoryboardSceneAssets(scene) : [];
}
