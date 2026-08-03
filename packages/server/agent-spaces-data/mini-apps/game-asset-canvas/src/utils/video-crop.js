const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const round = (value) => Math.round(value * 100000) / 100000;

export function normalizeCropRegion(region) {
  if (!region) return null;
  const x = clamp(Number(region.x) || 0, 0, 1);
  const y = clamp(Number(region.y) || 0, 0, 1);
  const width = clamp(Number(region.width) || 0, 0, 1 - x);
  const height = clamp(Number(region.height) || 0, 0, 1 - y);
  if (width <= 0 || height <= 0) return null;
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function cropPointFromClient(clientX, clientY, rect) {
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function cropRegionFromPoints(start, end, minimumSize = 0.01) {
  if (!start || !end) return null;
  const region = normalizeCropRegion({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });
  if (!region || region.width < minimumSize || region.height < minimumSize) return null;
  return region;
}
