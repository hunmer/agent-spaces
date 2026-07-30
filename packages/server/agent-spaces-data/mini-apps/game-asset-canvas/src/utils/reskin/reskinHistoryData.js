const imageSrc = (value) => (typeof value === 'string' ? value : value?.src || value?.url || '');

const spineAssets = (value, skinName = '') => {
  if (!value?.skel || !value?.atlas || !value?.png) return null;
  return {
    skel: value.skel,
    atlas: value.atlas,
    png: value.png,
    skinName: value.skinName || skinName,
  };
};

export function resolveReskinComparison(item, originalAssets) {
  const stages = Array.isArray(item?.stages) ? item.stages : [];
  const originalAtlas = stages.find((stage) => /原.*Atlas/i.test(stage?.label || ''));
  const finalAtlas = [...stages].reverse().find((stage) => /Atlas/i.test(stage?.label || ''));
  return {
    material: {
      before: imageSrc(item?.compare?.materialBefore) || imageSrc(originalAtlas),
      after: imageSrc(item?.compare?.materialAfter)
        || imageSrc(item?.assets?.previewPngUrl)
        || imageSrc(item?.assets?.previewPngDataUrl)
        || imageSrc(finalAtlas),
    },
    spine: {
      beforeAssets: spineAssets(item?.compare?.spineBeforeAssets)
        || spineAssets(originalAssets, 'default'),
      afterAssets: spineAssets(item?.compare?.spineAfterAssets, item?.name)
        || spineAssets({
          skel: item?.assets?.spineJsonUrl || item?.assets?.skelUrl,
          atlas: item?.assets?.atlasUrl,
          png: item?.assets?.pngUrl,
          skinName: item?.name,
        }),
    },
  };
}
