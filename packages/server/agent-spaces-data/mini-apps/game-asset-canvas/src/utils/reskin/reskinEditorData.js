const METHODS = new Set(['atlas', 'exploded']);
const SEGMENT_METHODS = new Set(['sam', 'bg_components']);
const IMAGE_SIZES = new Set(['auto', '1k', '2k', '4k']);

const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

export function getSpineAssetsSignature(assets) {
  return [assets?.skel || '', assets?.atlas || '', assets?.png || ''].join('|');
}

export function normalizeReskinEditorData(value, assets, fallbacks = {}) {
  const saved = value && typeof value === 'object' ? value : {};
  const restoredAssets = assets || (saved.assets && typeof saved.assets === 'object' ? saved.assets : null);
  const assetSignature = getSpineAssetsSignature(restoredAssets);
  const fallbackErosion = fallbacks.erosion && typeof fallbacks.erosion === 'object'
    ? fallbacks.erosion
    : {};
  const savedErosion = saved.erosion && typeof saved.erosion === 'object'
    ? saved.erosion
    : {};

  return {
    assetSignature,
    assets: restoredAssets ? {
      skel: restoredAssets.skel || '',
      atlas: restoredAssets.atlas || '',
      png: restoredAssets.png || '',
      name: restoredAssets.name || '',
    } : null,
    prompt: text(saved.prompt),
    skinName: text(saved.skinName),
    method: METHODS.has(saved.method) ? saved.method : 'atlas',
    segMethod: SEGMENT_METHODS.has(saved.segMethod) ? saved.segMethod : 'sam',
    size: IMAGE_SIZES.has(saved.size) ? saved.size : (fallbacks.size || '2k'),
    erosion: { ...fallbackErosion, ...savedErosion },
    processingModel: text(saved.processingModel, fallbacks.processingModel || ''),
    slotMode: saved.slotMode === true,
    selectedSlot: text(saved.selectedSlot),
    generatedImageUrl: saved.assetSignature === assetSignature
      ? text(saved.generatedImageUrl)
      : '',
  };
}
