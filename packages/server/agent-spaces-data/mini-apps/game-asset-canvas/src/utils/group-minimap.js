const GROUP_COLOR_VALUES = {
  '蓝色': '#3b82f6',
  '绿色': '#10b981',
  '紫色': '#8b5cf6',
  '橙色': '#f97316',
  '粉色': '#ec4899',
};

export function getGroupMiniMapColor(color) {
  if (/^#[0-9a-f]{6}$/i.test(color || '')) return color;
  return GROUP_COLOR_VALUES[color] || GROUP_COLOR_VALUES['蓝色'];
}

export function getGroupMiniMapBounds(group, childNodes) {
  if (!childNodes.length) {
    return {
      x: group.x ?? 50,
      y: group.y ?? 50,
      width: group.width ?? 300,
      height: group.height ?? 200,
    };
  }

  const padding = 30;
  const headerHeight = 28;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of childNodes) {
    minX = Math.min(minX, node.position.x - padding);
    minY = Math.min(minY, node.position.y - headerHeight - padding);
    maxX = Math.max(maxX, node.position.x + (node.width || 200) + padding);
    maxY = Math.max(maxY, node.position.y + (node.height || 100) + padding);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(200, maxX - minX),
    height: Math.max(100, maxY - minY),
  };
}
