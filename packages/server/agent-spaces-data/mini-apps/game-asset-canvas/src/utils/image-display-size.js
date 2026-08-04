const DEFAULT_SIZE = { w: 260, h: 240 };
const DISPLAY_LONG_SIDE = 320;
const DISPLAY_PADDING = 24;

const dimensionCache = new Map();

export function normalizeImageRotation(rotation = 0) {
  const value = Number(rotation) || 0;
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}

export function getImageDisplayNodeSize(naturalWidth, naturalHeight, rotation = 0) {
  const width = Number(naturalWidth);
  const height = Number(naturalHeight);
  if (!(width > 0) || !(height > 0)) return { ...DEFAULT_SIZE };

  const quarterTurn = normalizeImageRotation(rotation) % 180 !== 0;
  const displayWidth = quarterTurn ? height : width;
  const displayHeight = quarterTurn ? width : height;
  const ratio = displayWidth / displayHeight;
  const contentWidth = ratio >= 1 ? DISPLAY_LONG_SIDE : Math.round(DISPLAY_LONG_SIDE * ratio);
  const contentHeight = ratio >= 1 ? Math.round(DISPLAY_LONG_SIDE / ratio) : DISPLAY_LONG_SIDE;

  return {
    w: contentWidth + DISPLAY_PADDING,
    h: contentHeight + DISPLAY_PADDING,
  };
}

export function loadImageDimensions(src) {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  if (dimensionCache.has(src)) return dimensionCache.get(src);

  const pending = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth && image.naturalHeight
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  dimensionCache.set(src, pending);
  return pending;
}

export async function loadImageFileDimensions(file) {
  if (!file || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadImageDimensions(objectUrl);
  } finally {
    dimensionCache.delete(objectUrl);
    URL.revokeObjectURL(objectUrl);
  }
}
