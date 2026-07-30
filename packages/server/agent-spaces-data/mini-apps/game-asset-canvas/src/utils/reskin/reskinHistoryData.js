const imageSrc = (value) => (typeof value === 'string' ? value : value?.src || value?.url || '');

export function resolveReskinComparison(item) {
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
      before: imageSrc(item?.compare?.spineBefore),
      after: imageSrc(item?.compare?.spineAfter),
    },
  };
}
