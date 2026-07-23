/**
 * ImageData 纯函数操作集（不依赖 DOM，可放 Worker）。
 * 来源：FrameRonin frontend/src/lib/pixellise/imageDataOps.ts，逐行搬移，去掉 TS 类型。
 */

/** 克隆 ImageData */
export function cloneImageData(src) {
  const out = new ImageData(src.width, src.height);
  out.data.set(src.data);
  return out;
}

/** 最近邻缩放到目标宽高 */
export function scaleNearestToSize(img, nw, nh) {
  const out = new ImageData(nw, nh);
  const iw = img.width;
  const ih = img.height;
  if (iw < 1 || ih < 1) return out;
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(ih - 1, Math.floor((y * ih) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(iw - 1, Math.floor((x * iw) / nw));
      const si = (sy * iw + sx) * 4;
      const oi = (y * nw + x) * 4;
      out.data[oi] = img.data[si];
      out.data[oi + 1] = img.data[si + 1];
      out.data[oi + 2] = img.data[si + 2];
      out.data[oi + 3] = img.data[si + 3];
    }
  }
  return out;
}

/** 按倍数最近邻缩放 */
export function scaleNearestByFactor(img, factor) {
  const nw = Math.max(1, Math.round(img.width * factor));
  const nh = Math.max(1, Math.round(img.height * factor));
  return scaleNearestToSize(img, nw, nh);
}

/** 裁掉四边各 n 像素 */
export function cropBorder(img, n) {
  const nw = img.width - 2 * n;
  const nh = img.height - 2 * n;
  if (nw < 1 || nh < 1) return cloneImageData(img);
  const out = new ImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const si = ((y + n) * img.width + (x + n)) * 4;
      const oi = (y * nw + x) * 4;
      out.data.set(img.data.subarray(si, si + 4), oi);
    }
  }
  return out;
}

/** 单通道 alpha 最近邻缩放 */
export function scaleNearestAlpha(alpha, w, h, nw, nh) {
  const out = new Uint8ClampedArray(nw * nh);
  if (w < 1 || h < 1) return out;
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / nh));
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / nw));
      out[y * nw + x] = alpha[sy * w + sx];
    }
  }
  return out;
}

/**
 * 提取 alpha 通道为独立 Uint8ClampedArray（pixelate 流程用）。
 * @param {ImageData} img
 * @returns {Uint8ClampedArray}
 */
export function extractAlpha(img) {
  const out = new Uint8ClampedArray(img.width * img.height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = img.data[p + 3];
  }
  return out;
}
