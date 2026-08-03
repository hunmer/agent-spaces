export const DRAG_AUTO_PAN_EDGE_SIZE = 72;
export const DRAG_AUTO_PAN_MAX_SPEED = 18;

export function isCanvasFileDrag(dataTransfer, canvasDropMime) {
  const types = Array.from(dataTransfer?.types || []);
  return types.includes('Files') || types.includes(canvasDropMime);
}

export function getDragAutoPanDelta(
  clientX,
  clientY,
  rect,
  edgeSize = DRAG_AUTO_PAN_EDGE_SIZE,
  maxSpeed = DRAG_AUTO_PAN_MAX_SPEED,
) {
  if (!rect || clientX < rect.left || clientX > rect.right
    || clientY < rect.top || clientY > rect.bottom) {
    return { x: 0, y: 0 };
  }

  const horizontalEdge = Math.min(edgeSize, rect.width / 2);
  const verticalEdge = Math.min(edgeSize, rect.height / 2);
  return {
    x: getAxisDelta(clientX, rect.left, rect.right, horizontalEdge, maxSpeed),
    y: getAxisDelta(clientY, rect.top, rect.bottom, verticalEdge, maxSpeed),
  };
}

function getAxisDelta(pointer, start, end, edgeSize, maxSpeed) {
  if (edgeSize <= 0) return 0;
  if (pointer < start + edgeSize) {
    return maxSpeed * (1 - (pointer - start) / edgeSize);
  }
  if (pointer > end - edgeSize) {
    return -maxSpeed * (1 - (end - pointer) / edgeSize);
  }
  return 0;
}
