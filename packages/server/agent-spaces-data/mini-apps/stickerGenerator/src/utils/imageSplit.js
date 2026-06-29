// 贴纸集合一键拆分 —— 浏览器端 Canvas 图像处理
// 移植自 StickerCraft 的 imageProcessing.ts（连通域检测 + 透明沟谷切分）
// 全程在浏览器跑，无需服务端或工作流

// ---------- 基础工具 ----------

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const NAMED_COLORS = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
  red: { r: 239, g: 68, b: 68 },
  orange: { r: 249, g: 115, b: 22 },
  yellow: { r: 234, g: 179, b: 8 },
  green: { r: 34, g: 197, b: 94 },
  blue: { r: 59, g: 130, b: 246 },
  purple: { r: 168, g: 85, b: 247 },
  pink: { r: 236, g: 72, b: 153 },
};

const sameColor = (a, b) =>
  Math.abs(a.r - b.r) <= 2 && Math.abs(a.g - b.g) <= 2 && Math.abs(a.b - b.b) <= 2;

const parseCssColor = (value) => {
  if (!value) return undefined;
  const n = value.trim().toLowerCase();
  if (!n) return undefined;
  if (NAMED_COLORS[n]) return NAMED_COLORS[n];
  const hex = n.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split('').map((c) => `${c}${c}`).join('')
      : hex[1];
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  const rgb = n.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return {
      r: clamp(Number(rgb[1]), 0, 255),
      g: clamp(Number(rgb[2]), 0, 255),
      b: clamp(Number(rgb[3]), 0, 255),
    };
  }
  return undefined;
};

// ---------- Canvas 快照 ----------

function loadImageSnapshot(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { reject(new Error('无法创建 canvas 上下文')); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ canvas, ctx, imageData, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error('无法加载图片'));
    img.src = dataUrl;
  });
}

// ---------- 背景检测 / 透明修复 ----------

const getEdgePixelPositions = (width, height) => {
  const pos = [];
  for (let x = 0; x < width; x += 1) {
    pos.push(x);
    pos.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    pos.push(y * width);
    pos.push(y * width + width - 1);
  }
  return pos;
};

const getDominantEdgeColors = (data, width, height) => {
  const buckets = new Map();
  const edgePositions = getEdgePixelPositions(width, height);
  edgePositions.forEach((position) => {
    const idx = position * 4;
    if (data[idx + 3] <= 20) return;
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  });
  const minCount = Math.max(2, Math.floor(edgePositions.length * 0.025));
  return [...buckets.values()]
    .filter((b) => b.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((b) => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count) }));
};

const hasUsableAlphaBackground = (data, width, height) => {
  const total = width * height;
  const edge = getEdgePixelPositions(width, height);
  let transparent = 0, soft = 0, transparentEdge = 0, corners = 0;
  for (let p = 0; p < total; p += 1) {
    const a = data[p * 4 + 3];
    if (a <= 12) transparent += 1;
    if (a < 250) soft += 1;
  }
  edge.forEach((p) => { if (data[p * 4 + 3] <= 12) transparentEdge += 1; });
  [0, width - 1, (height - 1) * width, height * width - 1].forEach((p) => { if (data[p * 4 + 3] <= 12) corners += 1; });
  const tRatio = transparent / total;
  const sRatio = soft / total;
  const eRatio = transparentEdge / edge.length;
  return eRatio >= 0.12 || (corners >= 2 && tRatio >= 0.01) || (eRatio >= 0.04 && sRatio >= 0.08);
};

const getBackgroundCandidates = (data, width, height, options = {}) => {
  const candidates = [];
  const baseTolerance = options.tolerance ?? 44;
  const addCandidate = (color, tolerance) => {
    if (!color) return;
    if (candidates.some((c) => sameColor(c.color, color))) return;
    candidates.push({ color, tolerance });
  };
  addCandidate(parseCssColor(options.backgroundColor), baseTolerance + 8);
  addCandidate(options.hasStickerBorder ? NAMED_COLORS.black : NAMED_COLORS.white, baseTolerance);
  getDominantEdgeColors(data, width, height).forEach((c) => addCandidate(c, baseTolerance));
  return candidates;
};

const colorMatches = (data, idx, candidate) => {
  const { color, tolerance } = candidate;
  return (
    Math.abs(data[idx] - color.r) <= tolerance &&
    Math.abs(data[idx + 1] - color.g) <= tolerance &&
    Math.abs(data[idx + 2] - color.b) <= tolerance
  );
};

// 透明背景修复：从边缘 flood-fill 清除背景色
export async function repairStickerTransparency(dataUrl, options = {}) {
  const { canvas, ctx, imageData, width, height } = await loadImageSnapshot(dataUrl);
  const { data } = imageData;
  if (hasUsableAlphaBackground(data, width, height)) return dataUrl;

  const candidates = getBackgroundCandidates(data, width, height, options);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const edgePositions = getEdgePixelPositions(width, height);
  let head = 0, tail = 0;

  const matchesBg = (position) => {
    const idx = position * 4;
    if (data[idx + 3] <= 10) return true;
    return candidates.some((c) => colorMatches(data, idx, c));
  };
  const enqueue = (position) => {
    if (visited[position] || !matchesBg(position)) return;
    visited[position] = 1;
    queue[tail] = position;
    tail += 1;
  };

  edgePositions.forEach(enqueue);
  while (head < tail) {
    const position = queue[head]; head += 1;
    const idx = position * 4;
    data[idx + 3] = 0;
    const x = position % width;
    const y = Math.floor(position / width);
    if (x > 0) enqueue(position - 1);
    if (x < width - 1) enqueue(position + 1);
    if (y > 0) enqueue(position - width);
    if (y < height - 1) enqueue(position + width);
  }

  // 去除一层背景晕边
  for (let pass = 0; pass < 2; pass += 1) {
    const toClear = [];
    for (let position = 0; position < width * height; position += 1) {
      const idx = position * 4;
      if (data[idx + 3] <= 10) continue;
      if (!candidates.some((c) => colorMatches(data, idx, { ...c, tolerance: Math.max(12, c.tolerance - 18) }))) continue;
      const x = position % width;
      const y = Math.floor(position / width);
      const touchesTransparent =
        (x > 0 && data[(position - 1) * 4 + 3] <= 10) ||
        (x < width - 1 && data[(position + 1) * 4 + 3] <= 10) ||
        (y > 0 && data[(position - width) * 4 + 3] <= 10) ||
        (y < height - 1 && data[(position + width) * 4 + 3] <= 10);
      if (touchesTransparent) toClear.push(idx);
    }
    toClear.forEach((idx) => { data[idx + 3] = 0; });
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

// ---------- 连通域检测（贴纸主体识别） ----------

function findOpaqueComponents(snapshot) {
  const { imageData, width, height } = snapshot;
  const { data } = imageData;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const minArea = Math.max(48, Math.floor(width * height * 0.0002));
  const components = [];
  const isOpaque = (position) => data[position * 4 + 3] > 24;

  for (let position = 0; position < width * height; position += 1) {
    if (visited[position] || !isOpaque(position)) continue;
    let head = 0, tail = 0, area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    visited[position] = 1;
    queue[tail] = position; tail += 1;

    while (head < tail) {
      const current = queue[head]; head += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const neighbors = [
        current - 1, current + 1, current - width, current + width,
        current - width - 1, current - width + 1, current + width - 1, current + width + 1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor < 0 || neighbor >= width * height || visited[neighbor] || !isOpaque(neighbor)) return;
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) return;
        visited[neighbor] = 1;
        queue[tail] = neighbor; tail += 1;
      });
    }
    if (area >= minArea) components.push({ minX, minY, maxX, maxY, area });
  }
  return components;
}

// ---------- 盒子合并 / 排序 ----------

const boxesOverlapWithGap = (a, b, gap) =>
  a.minX - gap <= b.maxX && a.maxX + gap >= b.minX &&
  a.minY - gap <= b.maxY && a.maxY + gap >= b.minY;

function mergeBoxes(boxes, gap) {
  const merged = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (!boxesOverlapWithGap(merged[i], merged[j], gap)) continue;
        merged[i] = {
          minX: Math.min(merged[i].minX, merged[j].minX),
          minY: Math.min(merged[i].minY, merged[j].minY),
          maxX: Math.max(merged[i].maxX, merged[j].maxX),
          maxY: Math.max(merged[i].maxY, merged[j].maxY),
          area: merged[i].area + merged[j].area,
        };
        merged.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return merged;
}

function sortBoxesReadingOrder(boxes) {
  const medianHeight = [...boxes]
    .map((b) => b.maxY - b.minY + 1)
    .sort((a, b) => a - b)[Math.floor(boxes.length / 2)] || 1;
  const rowTolerance = Math.max(24, medianHeight * 0.45);
  return [...boxes].sort((a, b) => {
    const ay = (a.minY + a.maxY) / 2;
    const by = (b.minY + b.maxY) / 2;
    if (Math.abs(ay - by) <= rowTolerance) return a.minX - b.minX;
    return ay - by;
  });
}

const boxGap = (a, b) => {
  const hg = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const vg = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.hypot(hg, vg);
};

function mergeClosestBoxesUntilCount(boxes, targetCount) {
  const merged = [...boxes];
  while (merged.length > targetCount) {
    let bestA = 0, bestB = 1, bestGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const g = boxGap(merged[i], merged[j]);
        if (g < bestGap) { bestGap = g; bestA = i; bestB = j; }
      }
    }
    merged[bestA] = {
      minX: Math.min(merged[bestA].minX, merged[bestB].minX),
      minY: Math.min(merged[bestA].minY, merged[bestB].minY),
      maxX: Math.max(merged[bestA].maxX, merged[bestB].maxX),
      maxY: Math.max(merged[bestA].maxY, merged[bestB].maxY),
      area: merged[bestA].area + merged[bestB].area,
    };
    merged.splice(bestB, 1);
  }
  return merged;
}

// ---------- 透明沟谷切分（基于 alpha 投影） ----------

function getAlphaProjections(snapshot) {
  const { data } = snapshot.imageData;
  const columns = new Uint32Array(snapshot.width);
  const rows = new Uint32Array(snapshot.height);
  for (let y = 0; y < snapshot.height; y += 1) {
    for (let x = 0; x < snapshot.width; x += 1) {
      if (data[(y * snapshot.width + x) * 4 + 3] <= 24) continue;
      columns[x] += 1;
      rows[y] += 1;
    }
  }
  return { columns, rows };
}

const findTransparentValley = (projection, approximateBoundary, searchRadius) => {
  const start = clamp(Math.round(approximateBoundary - searchRadius), 1, projection.length - 2);
  const end = clamp(Math.round(approximateBoundary + searchRadius), start, projection.length - 2);
  const windowRadius = Math.max(2, Math.round(projection.length * 0.004));
  let bestIndex = start, bestScore = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    let score = 0;
    for (let s = Math.max(0, index - windowRadius); s <= Math.min(projection.length - 1, index + windowRadius); s += 1) {
      score += projection[s];
    }
    if (score < bestScore) { bestScore = score; bestIndex = index; }
  }
  return bestIndex;
};

function getOpaqueBoundsInRegion(snapshot, region) {
  const { data } = snapshot.imageData;
  let minX = snapshot.width, minY = snapshot.height, maxX = 0, maxY = 0, area = 0;
  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      if (data[(y * snapshot.width + x) * 4 + 3] <= 24) continue;
      area += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (area === 0) return undefined;
  return { minX, minY, maxX, maxY, area };
}

function splitByTransparentGutters(snapshot, expectedCount) {
  const count = Math.max(2, Math.min(12, expectedCount));
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const { columns: colProj, rows: rowProj } = getAlphaProjections(snapshot);
  const xBoundaries = [0];
  const yBoundaries = [0];
  for (let column = 1; column < columns; column += 1) {
    const approx = (snapshot.width * column) / columns;
    xBoundaries.push(findTransparentValley(colProj, approx, (snapshot.width / columns) * 0.42));
  }
  xBoundaries.push(snapshot.width - 1);
  for (let row = 1; row < rows; row += 1) {
    const approx = (snapshot.height * row) / rows;
    yBoundaries.push(findTransparentValley(rowProj, approx, (snapshot.height / rows) * 0.42));
  }
  yBoundaries.push(snapshot.height - 1);

  const minArea = Math.max(256, snapshot.width * snapshot.height * 0.001);
  const boxes = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (boxes.length >= count) break;
      const region = {
        minX: xBoundaries[column], maxX: xBoundaries[column + 1],
        minY: yBoundaries[row], maxY: yBoundaries[row + 1],
      };
      const box = getOpaqueBoundsInRegion(snapshot, region);
      if (box && box.area >= minArea) boxes.push(box);
    }
  }
  return boxes;
}

// ---------- 裁剪 ----------

const normalizeCropBox = (snapshot, box, padding = 0) => ({
  minX: Math.round(clamp(box.minX - padding, 0, snapshot.width - 1)),
  minY: Math.round(clamp(box.minY - padding, 0, snapshot.height - 1)),
  maxX: Math.round(clamp(box.maxX + padding, 0, snapshot.width - 1)),
  maxY: Math.round(clamp(box.maxY + padding, 0, snapshot.height - 1)),
});

function cropSnapshotToDataUrl(snapshot, box) {
  const x = clamp(Math.min(box.minX, box.maxX), 0, snapshot.width - 1);
  const y = clamp(Math.min(box.minY, box.maxY), 0, snapshot.height - 1);
  const right = clamp(Math.max(box.minX, box.maxX), x, snapshot.width - 1);
  const bottom = clamp(Math.max(box.minY, box.maxY), y, snapshot.height - 1);
  const width = Math.max(1, right - x + 1);
  const height = Math.max(1, bottom - y + 1);
  const output = document.createElement('canvas');
  const outputCtx = output.getContext('2d');
  output.width = width;
  output.height = height;
  if (!outputCtx) return snapshot.canvas.toDataURL('image/png');
  outputCtx.drawImage(snapshot.canvas, x, y, width, height, 0, 0, width, height);
  return output.toDataURL('image/png');
}

function cropBox(snapshot, box, padding) {
  return cropSnapshotToDataUrl(snapshot, normalizeCropBox(snapshot, box, padding));
}

// ---------- 主入口：自动拆分 ----------

// 自动检测并切分贴纸集合，返回 { sourceDataUrl, pieces: [{ dataUrl }] }
// options: { expectedCount?, backgroundColor?, hasStickerBorder? }
export async function splitStickerCollection(dataUrl, options = {}) {
  const repairedDataUrl = await repairStickerTransparency(dataUrl, options);
  const snapshot = await loadImageSnapshot(repairedDataUrl);
  const expectedCount = options.expectedCount ? Math.max(2, Math.min(12, options.expectedCount)) : undefined;
  const imageArea = snapshot.width * snapshot.height;
  const mergeGap = Math.max(18, Math.round(Math.min(snapshot.width, snapshot.height) * 0.045));
  const minBoxArea = Math.max(256, imageArea * 0.0012);
  const componentBoxes = mergeBoxes(findOpaqueComponents(snapshot), mergeGap)
    .filter((box) => (box.maxX - box.minX + 1) * (box.maxY - box.minY + 1) >= minBoxArea);

  let boxes = expectedCount ? splitByTransparentGutters(snapshot, expectedCount) : componentBoxes;
  if (expectedCount && boxes.length === 0) boxes = componentBoxes;
  if (expectedCount && boxes.length > expectedCount) boxes = mergeClosestBoxesUntilCount(boxes, expectedCount);
  if (!expectedCount && boxes.length <= 1) {
    const gutterBoxes = splitByTransparentGutters(snapshot, 6);
    if (gutterBoxes.length > boxes.length) boxes = gutterBoxes;
  }

  // 按阅读顺序裁剪，每片加 10% padding
  const padding = Math.max(10, Math.round(Math.min(snapshot.width, snapshot.height) * 0.02));
  const pieces = sortBoxesReadingOrder(boxes).map((box) => {
    const boxWidth = box.maxX - box.minX + 1;
    const boxHeight = box.maxY - box.minY + 1;
    const pad = Math.max(padding, Math.round(Math.max(boxWidth, boxHeight) * 0.1));
    return { dataUrl: cropBox(snapshot, box, pad) };
  });

  return { sourceDataUrl: repairedDataUrl, pieces };
}

// 网格切分（手动指定行列）
export async function splitStickerCollectionByGrid(dataUrl, options) {
  const { rows, columns } = options;
  const repairedDataUrl = await repairStickerTransparency(dataUrl, options);
  const snapshot = await loadImageSnapshot(repairedDataUrl);
  const r = Math.max(1, Math.min(6, Math.round(rows || 1)));
  const c = Math.max(1, Math.min(6, Math.round(columns || 1)));
  const minArea = Math.max(96, (snapshot.width * snapshot.height) / (r * c) * 0.004);
  const boxes = [];
  for (let row = 0; row < r; row += 1) {
    for (let column = 0; column < c; column += 1) {
      const minX = Math.round((snapshot.width * column) / c);
      const maxX = Math.round((snapshot.width * (column + 1)) / c) - 1;
      const minY = Math.round((snapshot.height * row) / r);
      const maxY = Math.round((snapshot.height * (row + 1)) / r) - 1;
      const box = getOpaqueBoundsInRegion(snapshot, {
        minX: clamp(minX, 0, snapshot.width - 1),
        minY: clamp(minY, 0, snapshot.height - 1),
        maxX: clamp(maxX, 0, snapshot.width - 1),
        maxY: clamp(maxY, 0, snapshot.height - 1),
      });
      if (box && box.area >= minArea) boxes.push(box);
    }
  }
  return { sourceDataUrl: repairedDataUrl, pieces: boxes.map((box) => ({ dataUrl: cropBox(snapshot, box, 8) })) };
}
