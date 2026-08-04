const ALIGNMENT_SCREEN_THRESHOLD = 6;

function toSize(value) {
  const size = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function getNodeSize(node) {
  return {
    width: toSize(node?.measured?.width ?? node?.width ?? node?.style?.width),
    height: toSize(node?.measured?.height ?? node?.height ?? node?.style?.height),
  };
}

function getAnchors(start, size) {
  return [start + size / 2, start, start + size];
}

function findClosestAlignment(movingAnchors, targetAnchors, threshold) {
  let closest = null;
  for (const moving of movingAnchors) {
    for (const target of targetAnchors) {
      const delta = target - moving;
      const distance = Math.abs(delta);
      if (distance <= threshold && (!closest || distance < closest.distance)) {
        closest = { delta, distance, guide: target };
      }
    }
  }
  return closest;
}

/**
 * 计算单节点拖拽时的最近横纵对齐线，并返回修正后的节点位置。
 */
export function computeAlignmentGuides(nodes, movingNodeId, position, zoom = 1) {
  const movingNode = nodes.find((node) => node.id === movingNodeId);
  if (!movingNode || !position) return { position, vertical: null, horizontal: null };

  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const threshold = ALIGNMENT_SCREEN_THRESHOLD / safeZoom;
  const movingSize = getNodeSize(movingNode);
  const movingX = getAnchors(position.x, movingSize.width);
  const movingY = getAnchors(position.y, movingSize.height);
  let closestX = null;
  let closestY = null;

  for (const target of nodes) {
    if (target.id === movingNodeId || target.hidden) continue;
    const targetSize = getNodeSize(target);
    const targetX = getAnchors(target.position.x, targetSize.width);
    const targetY = getAnchors(target.position.y, targetSize.height);
    const matchX = findClosestAlignment(movingX, targetX, threshold);
    const matchY = findClosestAlignment(movingY, targetY, threshold);
    if (matchX && (!closestX || matchX.distance < closestX.distance)) closestX = matchX;
    if (matchY && (!closestY || matchY.distance < closestY.distance)) closestY = matchY;
  }

  return {
    position: {
      x: position.x + (closestX?.delta || 0),
      y: position.y + (closestY?.delta || 0),
    },
    vertical: closestX?.guide ?? null,
    horizontal: closestY?.guide ?? null,
  };
}

