export const DEFAULT_GRID_STITCH_DATA = {
  order: [],
  columns: 4,
  spacing: 0,
  cutoutMethod: 'none',
  tolerance: 70,
  cutoutColor: '#ff00ff',
  backgroundColor: '#ffffff',
};

export function orderGridStitchInputs(inputImages, savedOrder) {
  const inputs = Array.from(new Set((inputImages || []).filter(Boolean)));
  const available = new Set(inputs);
  const ordered = [];
  for (const url of savedOrder || []) {
    if (available.has(url) && !ordered.includes(url)) ordered.push(url);
  }
  for (const url of inputs) {
    if (!ordered.includes(url)) ordered.push(url);
  }
  return ordered;
}

export function normalizeGridStitchData(data, inputImages, processorParams = {}) {
  const source = data || {};
  return {
    ...DEFAULT_GRID_STITCH_DATA,
    ...source,
    columns: Math.max(1, Math.min(32, Math.round(source.columns ?? processorParams.columns ?? 4) || 4)),
    spacing: Math.max(0, Math.min(64, Math.round(source.spacing ?? processorParams.spacing ?? 0) || 0)),
    tolerance: Math.max(0, Math.min(765, Math.round(source.tolerance ?? processorParams.tolerance ?? 70) || 0)),
    order: orderGridStitchInputs(inputImages, source.order),
  };
}

export function moveGridStitchItem(items, fromIndex, toIndex) {
  const next = [...(items || [])];
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= next.length || toIndex >= next.length) {
    return next;
  }
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function mapObjectContainPoint(point, box, image) {
  if (!box?.width || !box?.height || !image?.width || !image?.height) return null;
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const offsetX = (box.width - renderedWidth) / 2;
  const offsetY = (box.height - renderedHeight) / 2;
  const localX = point.x - offsetX;
  const localY = point.y - offsetY;
  if (localX < 0 || localY < 0 || localX >= renderedWidth || localY >= renderedHeight) return null;
  return {
    x: Math.min(image.width - 1, Math.floor(localX / scale)),
    y: Math.min(image.height - 1, Math.floor(localY / scale)),
  };
}

export function gridStitchProcessorParams(data) {
  return {
    columns: data.columns,
    spacing: data.spacing,
    cutoutMethod: data.cutoutMethod,
    tolerance: data.tolerance,
    cutoutColor: data.cutoutColor,
    backgroundColor: data.backgroundColor,
  };
}
