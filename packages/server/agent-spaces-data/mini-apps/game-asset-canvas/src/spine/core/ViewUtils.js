export function calculateFitTransform(bounds, screen, options = {}) {
  const padding = Math.max(0, Number(options.padding) || 0);
  const minScale = Math.max(0.01, Number(options.minScale) || 0.1);
  const maxScale = Math.max(minScale, Number(options.maxScale) || 2);
  const width = Number(bounds?.width);
  const height = Number(bounds?.height);
  const screenWidth = Number(screen?.width);
  const screenHeight = Number(screen?.height);

  if (![width, height, screenWidth, screenHeight].every(Number.isFinite)
    || width <= 0 || height <= 0 || screenWidth <= 0 || screenHeight <= 0) return null;

  const availableWidth = Math.max(1, screenWidth - padding * 2);
  const availableHeight = Math.max(1, screenHeight - padding * 2);
  const scale = Math.max(minScale, Math.min(
    availableWidth / width,
    availableHeight / height,
    maxScale,
  ));
  const centerX = Number(bounds.x || 0) + width / 2;
  const centerY = Number(bounds.y || 0) + height / 2;

  return {
    scale,
    x: screenWidth / 2 - centerX * scale,
    y: screenHeight / 2 - centerY * scale,
  };
}
