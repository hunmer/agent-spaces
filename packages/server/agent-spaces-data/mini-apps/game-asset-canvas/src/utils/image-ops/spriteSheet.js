/**
 * Sprite Sheet 拆分 / 合成。
 * 来源：FrameRonin SpriteSheetTool.tsx splitSpriteSheet + ParamsStep/utils.ts composeSpriteSheetClient +
 * lib/superSplitTransparent.ts 的透明检测。全部改为 ImageData 出入参。
 *
 * 零依赖（纯像素操作）。
 */

/**
 * 按行列均匀切分 Sprite Sheet。
 * 来源：splitSpriteSheet。
 * @param {ImageData} img
 * @param {number} cols
 * @param {number} rows
 * @returns {ImageData[]}
 */
export function splitSpriteSheet(img, cols, rows) {
  const fullW = img.width;
  const fullH = img.height;
  const colsNum = Math.max(1, Math.floor(cols));
  const rowsNum = Math.max(1, Math.floor(rows));
  const out = [];
  for (let row = 0; row < rowsNum; row++) {
    for (let col = 0; col < colsNum; col++) {
      const sx = Math.floor((col * fullW) / colsNum);
      const ex = Math.floor(((col + 1) * fullW) / colsNum);
      const sy = Math.floor((row * fullH) / rowsNum);
      const ey = Math.floor(((row + 1) * fullH) / rowsNum);
      const w = Math.max(1, ex - sx);
      const h = Math.max(1, ey - sy);
      const cell = new ImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = ((sy + y) * fullW + (sx + x)) * 4;
          const oi = (y * w + x) * 4;
          cell.data[oi] = img.data[si];
          cell.data[oi + 1] = img.data[si + 1];
          cell.data[oi + 2] = img.data[si + 2];
          cell.data[oi + 3] = img.data[si + 3];
        }
      }
      out.push(cell);
    }
  }
  return out;
}

// ---- 透明行列自动拆分（superSplitByTransparent 检测部分）----

function findTransparentRows(imageData) {
  const { data, width, height } = imageData;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let allT = true;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] !== 0) { allT = false; break; }
    }
    if (allT) rows.push(y);
  }
  return rows;
}

function findTransparentCols(imageData, y0, y1) {
  const { data, width } = imageData;
  const cols = [];
  for (let x = 0; x < width; x++) {
    let allT = true;
    for (let y = y0; y < y1; y++) {
      if (data[(y * width + x) * 4 + 3] !== 0) { allT = false; break; }
    }
    if (allT) cols.push(x);
  }
  return cols;
}

function getRuns(arr) {
  if (!arr.length) return [];
  const runs = [];
  let start = arr[0];
  let end = start;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === end + 1) {
      end = arr[i];
    } else {
      runs.push([start, end]);
      start = arr[i];
      end = start;
    }
  }
  runs.push([start, end]);
  return runs;
}

function gapsFromRuns(runs, total) {
  if (!runs.length) return [[0, total - 1]];
  const regions = [[0, runs[0][0] - 1]];
  for (let i = 0; i < runs.length - 1; i++) {
    regions.push([runs[i][1] + 1, runs[i + 1][0] - 1]);
  }
  regions.push([runs[runs.length - 1][1] + 1, total - 1]);
  return regions.filter(([a, b]) => a <= b);
}

/**
 * 按透明行列自动切割（每行/列全透明的位置作为分隔）。
 * 来源：superSplitByTransparent。
 * @param {ImageData} img
 * @returns {ImageData[]} 切出的每个图块
 */
export function splitByTransparent(img) {
  const { width, height } = img;
  const rowGaps = gapsFromRuns(getRuns(findTransparentRows(img)), height);
  const out = [];
  for (const [ry0, ry1] of rowGaps) {
    if (ry0 > ry1) continue;
    const colGaps = gapsFromRuns(getRuns(findTransparentCols(img, ry0, ry1 + 1)), width);
    for (const [cx0, cx1] of colGaps) {
      if (cx0 > cx1) continue;
      const w = cx1 - cx0 + 1;
      const h = ry1 - ry0 + 1;
      const cell = new ImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = ((ry0 + y) * width + (cx0 + x)) * 4;
          const oi = (y * w + x) * 4;
          cell.data[oi] = img.data[si];
          cell.data[oi + 1] = img.data[si + 1];
          cell.data[oi + 2] = img.data[si + 2];
          cell.data[oi + 3] = img.data[si + 3];
        }
      }
      out.push(cell);
    }
  }
  return out;
}

/**
 * 多帧合成 Sprite Sheet（网格布局）。
 * 来源：composeSpriteSheetClient，简化为统一帧尺寸 + 列数布局。
 * @param {ImageData[]} frames
 * @param {{ columns?: number, spacing?: number }} opts
 * @returns {ImageData}
 */
export function composeSpriteSheet(frames, opts = {}) {
  if (!frames.length) throw new Error('无帧可合成');
  const columns = Math.max(1, Math.floor(opts.columns ?? Math.min(frames.length, 4)));
  const spacing = Math.max(0, Math.floor(opts.spacing ?? 0));
  // 取最大帧尺寸作为格子尺寸
  const cellW = Math.max(...frames.map((f) => f.width));
  const cellH = Math.max(...frames.map((f) => f.height));
  const rows = Math.ceil(frames.length / columns);
  const sheetW = columns * cellW + (columns - 1) * spacing;
  const sheetH = rows * cellH + (rows - 1) * spacing;
  const sheet = new ImageData(sheetW, sheetH);
  // 默认全透明，无需显式 fill（ImageData 默认 0）

  frames.forEach((frame, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const baseX = col * (cellW + spacing);
    const baseY = row * (cellH + spacing);
    const offX = Math.floor((cellW - frame.width) / 2);
    const offY = Math.floor((cellH - frame.height) / 2);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const si = (y * frame.width + x) * 4;
        const dx = baseX + offX + x;
        const dy = baseY + offY + y;
        const oi = (dy * sheetW + dx) * 4;
        sheet.data[oi] = frame.data[si];
        sheet.data[oi + 1] = frame.data[si + 1];
        sheet.data[oi + 2] = frame.data[si + 2];
        sheet.data[oi + 3] = frame.data[si + 3];
      }
    }
  });
  return sheet;
}
