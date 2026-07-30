const METHODS = new Set(['atlas', 'exploded']);
const SEGMENT_METHODS = new Set(['sam', 'bg_components']);
const IMAGE_SIZES = new Set(['auto', '1k', '2k', '4k']);
const RESULT_SCOPES = new Set(['all', 'animation', 'preview']);

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
  const matchingAssets = saved.assetSignature === assetSignature;
  const selectedSlots = Array.isArray(saved.selectedSlots)
    ? saved.selectedSlots.map((slot) => text(slot)).filter(Boolean)
    : [text(saved.selectedSlot)].filter(Boolean);
  const slotResults = matchingAssets && Array.isArray(saved.slotResults)
    ? saved.slotResults.slice(0, 100).filter((result) => (
      result && typeof result === 'object'
      && text(result.id) && text(result.regionName) && text(result.imageUrl)
      && Number(result.width) > 0 && Number(result.height) > 0
    )).map((result) => ({
      id: text(result.id),
      slot: text(result.slot),
      attachment: text(result.attachment),
      regionName: text(result.regionName),
      width: Number(result.width),
      height: Number(result.height),
      imageUrl: text(result.imageUrl),
      scope: RESULT_SCOPES.has(result.scope) ? result.scope : null,
      animation: text(result.animation),
    }))
    : [];

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
    selectedSlot: selectedSlots[0] || '',
    selectedSlots,
    slotResults,
    generatedImageUrl: matchingAssets
      ? text(saved.generatedImageUrl)
      : '',
  };
}
