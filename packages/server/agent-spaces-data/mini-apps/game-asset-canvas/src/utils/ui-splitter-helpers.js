/**
 * UiSplitterDialog 的无状态纯函数 / 常量（从原组件文件拆出）。
 * 这些函数无 DOM、无 React 依赖，便于复用与单测。
 */

// hex(#rrggbb / #rgb) → [r,g,b]
export const hexToRgb = (hex) => {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// 背景色预设（ColorPicker 色板）
export const BG_PRESETS = ['#ffffff', '#000000', '#f5f5f5', '#1a1a1a', '#00b140', '#ff00ff'];

export const normalizeGridCount = (value, fallback = 2) => Math.max(1, Math.min(20, Math.round(value) || fallback));

export const gridSplitThrottleMs = (cols, rows) => Math.min(1000, 80 + normalizeGridCount(cols) * normalizeGridCount(rows) * 2);

export const evenlySpacedGuides = (size, count) => {
  const guides = [];
  for (let i = 1; i < count; i++) guides.push(Math.round((size * i) / count));
  return guides;
};

export const normalizeGuideAxis = (values, size, expectedCount) => {
  if (!Array.isArray(values)) return null;
  const guides = [...new Set(values
    .filter(Number.isFinite)
    .map((value) => Math.max(1, Math.min(size - 1, Math.round(value)))))]
    .sort((a, b) => a - b);
  return guides.length === expectedCount ? guides : null;
};

export const resolveGridGuides = (saved, width, height, fallbackCols = 2, fallbackRows = 2) => {
  const cols = normalizeGridCount(saved?.cols, fallbackCols);
  const rows = normalizeGridCount(saved?.rows, fallbackRows);
  return {
    cols,
    rows,
    v: normalizeGuideAxis(saved?.v, width, cols - 1) || evenlySpacedGuides(width, cols),
    h: normalizeGuideAxis(saved?.h, height, rows - 1) || evenlySpacedGuides(height, rows),
  };
};

export const gridBoxesFromGuides = (width, height, vertical, horizontal) => {
  const vx = [0, ...(vertical || []).filter((x) => x > 0 && x < width), width].sort((a, b) => a - b);
  const hy = [0, ...(horizontal || []).filter((y) => y > 0 && y < height), height].sort((a, b) => a - b);
  const boxes = [];
  for (let i = 0; i < vx.length - 1; i++) {
    const boxWidth = vx[i + 1] - vx[i];
    if (boxWidth < 2) continue;
    for (let j = 0; j < hy.length - 1; j++) {
      const boxHeight = hy[j + 1] - hy[j];
      if (boxHeight >= 2) boxes.push({ x: vx[i], y: hy[j], width: boxWidth, height: boxHeight });
    }
  }
  return boxes;
};

// 输入签名 = inputImages 用 '|' 拼接，用于判定恢复时输入是否一致。
export const inputSignature = (urls) => (urls || []).filter(Boolean).join('|');
