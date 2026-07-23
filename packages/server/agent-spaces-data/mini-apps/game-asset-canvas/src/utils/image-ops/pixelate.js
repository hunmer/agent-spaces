/**
 * 像素化 + 色彩量化。
 * 来源：FrameRonin frontend/src/lib/pixellise/pixelate.ts + colors.ts，去掉 opencv 网格检测，
 * 改用均匀 mesh（fallbackUniformMesh），算法核心（下采样 + 多数票取色 + 透明判定）完全保留。
 *
 * 依赖：image-q（Wu 色彩量化），通过 CDN 加载。
 */
import { getImageQ } from './cdn';
import { cloneImageData, extractAlpha, scaleNearestAlpha, scaleNearestToSize } from './imageDataOps';

const ALPHA_THRESHOLD = 128;

/**
 * 色彩量化：把 ImageData 压缩到指定颜色数（Wu 算法）。
 * 来源：colors.ts paletteImage。
 * @param {ImageData} imageData
 * @param {number} numColors 2-256
 * @returns {Promise<ImageData>}
 */
export async function paletteImage(imageData, numColors) {
  const n = Math.max(2, Math.min(256, Math.floor(numColors)));
  const imageQ = await getImageQ();
  const { utils, buildPaletteSync, applyPaletteSync } = imageQ;
  const pc = utils.PointContainer.fromImageData(imageData);
  const palette = buildPaletteSync([pc], { paletteQuantization: 'wuquant', colors: n });
  const outPc = applyPaletteSync(pc, palette, { imageQuantization: 'nearest' });
  const w = outPc.getWidth();
  const h = outPc.getHeight();
  const u8 = outPc.toUint8Array();
  const copy = new Uint8ClampedArray(w * h * 4);
  copy.set(u8.subarray(0, w * h * 4));
  return new ImageData(copy, w, h);
}

/**
 * 把边界出现最多的 RGB 精确匹配置透明（抠纯色背景）。
 * 来源：colors.ts makeBackgroundTransparent。
 * @param {ImageData} img
 * @returns {ImageData}
 */
export function makeBackgroundTransparent(img) {
  const out = cloneImageData(img);
  const w = out.width;
  const h = out.height;
  if (w < 2 || h < 2) return out;

  const counts = new Map();
  const add = (base) => {
    if (out.data[base + 3] < 128) return;
    const k = `${out.data[base]},${out.data[base + 1]},${out.data[base + 2]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  };
  // 四条边统计
  for (let x = 0; x < w; x++) {
    add(x * 4);
    add(((h - 1) * w + x) * 4);
  }
  for (let y = 1; y < h - 1; y++) {
    add(y * w * 4);
    add((y * w + (w - 1)) * 4);
  }
  if (counts.size === 0) return out;

  let bestKey = '0,0,0';
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) { bestN = n; bestKey = k; }
  }
  const [br, bg, bb] = bestKey.split(',').map(Number);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i] === br && out.data[i + 1] === bg && out.data[i + 2] === bb) {
      out.data[i + 3] = 0;
    }
  }
  return out;
}

/** 均匀网格 mesh：把图按目标逻辑分辨率均匀切分（替代 opencv 网格检测） */
function uniformMesh(srcW, srcH, targetW, targetH) {
  const vx = [];
  for (let i = 0; i <= targetW; i++) vx.push(Math.round((i * srcW) / targetW));
  const hy = [];
  for (let i = 0; i <= targetH; i++) hy.push(Math.round((i * srcH) / targetH));
  return [vx, hy];
}

function mostCommonRgbInCell(rgbData, iw, x0, y0, x1, y1) {
  const counts = new Map();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * iw + x) * 4;
      const k = `${rgbData[p]},${rgbData[p + 1]},${rgbData[p + 2]}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let best = '0,0,0';
  let bn = -1;
  for (const [k, n] of counts) {
    if (n > bn) { bn = n; best = k; }
  }
  return best.split(',').map(Number);
}

/**
 * 下采样：每格多数票取色 + 多数透明判定（proper-pixel-art 算法）。
 * 来源：pixelate.ts downsampleProper。
 */
function downsampleProper(scaledRgb, scaledAlpha, mesh) {
  const [vx, hy] = mesh;
  const iw = scaledRgb.width;
  const ih = scaledRgb.height;
  const outW = vx.length - 1;
  const outH = hy.length - 1;
  const out = new ImageData(outW, outH);

  for (let j = 0; j < outH; j++) {
    const y0 = Math.max(0, Math.min(ih, hy[j]));
    const y1 = Math.max(0, Math.min(ih, hy[j + 1]));
    for (let i = 0; i < outW; i++) {
      const x0 = Math.max(0, Math.min(iw, vx[i]));
      const x1 = Math.max(0, Math.min(iw, vx[i + 1]));
      const cellPixels = (x1 - x0) * (y1 - y0);
      const oi = (j * outW + i) * 4;
      if (cellPixels <= 0) {
        out.data[oi + 3] = 0;
        continue;
      }
      let opaqueCount = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (scaledAlpha[y * iw + x] >= ALPHA_THRESHOLD) opaqueCount++;
        }
      }
      if (opaqueCount <= cellPixels / 2) {
        // 多数透明 → 输出透明
        out.data[oi] = 0;
        out.data[oi + 1] = 0;
        out.data[oi + 2] = 0;
        out.data[oi + 3] = 0;
      } else {
        const [r, g, b] = mostCommonRgbInCell(scaledRgb.data, iw, x0, y0, x1, y1);
        out.data[oi] = r;
        out.data[oi + 1] = g;
        out.data[oi + 2] = b;
        out.data[oi + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * 像素化主流程（含色彩量化）。
 * @param {ImageData} originalRgba 原图 RGBA
 * @param {{ numColors?: number, blockSize?: number, transparentBg?: boolean }} opts
 *   numColors 颜色数（2-256，0 表示不量化）；blockSize 每个像素块覆盖的原图像素数；
 *   transparentBg 是否自动把背景置透明
 * @returns {Promise<ImageData>}
 */
export async function pixelate(originalRgba, opts = {}) {
  const blockSize = Math.max(1, Math.floor(opts.blockSize ?? 4));
  const numColors = opts.numColors ?? 16;
  const transparentBg = opts.transparentBg ?? true;

  const W = originalRgba.width;
  const H = originalRgba.height;
  const sw = Math.max(1, Math.floor(W / blockSize));
  const sh = Math.max(1, Math.floor(H / blockSize));

  const alpha = extractAlpha(originalRgba);
  const scaledAlpha = scaleNearestAlpha(alpha, W, H, sw, sh);

  let processed = originalRgba;
  if (numColors > 0) {
    processed = await paletteImage(originalRgba, numColors);
  }
  const scaledRgb = scaleNearestToSize(processed, sw, sh);
  const mesh = uniformMesh(W, H, sw, sh);

  let result = downsampleProper(scaledRgb, scaledAlpha, mesh);
  if (transparentBg) {
    result = makeBackgroundTransparent(result);
  }
  // 放大回原尺寸便于查看（最近邻，保持像素感）
  if (result.width < W || result.height < H) {
    result = scaleNearestToSize(result, result.width * blockSize, result.height * blockSize);
  }
  return result;
}
