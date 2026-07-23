/**
 * 像素图片处理：最近邻缩放 + 内描边（BFS 距离场）+ 裁切。
 * 来源：FrameRonin ParamsStep/utils.ts resizeImageToBlobNearestNeighborPS / applyInnerStroke / cropImageBlob，
 * 改为 ImageData 出入参，去掉 yieldToMain 让步。
 *
 * 零依赖。
 */

/**
 * 最近邻硬缩放（PS 风格，保持像素锐利，避免 canvas drawImage 非整数倍模糊）。
 * 来源：resizeImageToBlobNearestNeighborPS。
 * 居中放置，多余区域透明。
 * @param {ImageData} img
 * @param {number} targetW
 * @param {number} targetH
 * @returns {ImageData}
 */
export function resizeNearest(img, targetW, targetH) {
  const tw = Math.max(1, Math.floor(targetW));
  const th = Math.max(1, Math.floor(targetH));
  const out = new ImageData(tw, th);
  const iw = img.width;
  const ih = img.height;
  // 保持原图比例，按 contain 方式居中
  const scale = Math.min(tw / iw, th / ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const offX = Math.floor((tw - dw) / 2);
  const offY = Math.floor((th - dh) / 2);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(ih - 1, Math.floor((y * ih) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(iw - 1, Math.floor((x * iw) / dw));
      const si = (sy * iw + sx) * 4;
      const oi = ((offY + y) * tw + (offX + x)) * 4;
      out.data[oi] = img.data[si];
      out.data[oi + 1] = img.data[si + 1];
      out.data[oi + 2] = img.data[si + 2];
      out.data[oi + 3] = img.data[si + 3];
    }
  }
  return out;
}

/**
 * 内描边：从透明像素出发多源 BFS 算距离场，距离 ∈ [1, strokeWidth] 的像素染描边色。
 * 来源：applyInnerStroke。
 * @param {ImageData} img
 * @param {number} strokeWidth 描边宽度（px）
 * @param {[number,number,number]} strokeColor [r,g,b]
 * @returns {ImageData}
 */
export function innerStroke(img, strokeWidth, strokeColor) {
  const sw = Math.max(1, Math.floor(strokeWidth));
  const [sr, sg, sb] = strokeColor;
  const w = img.width;
  const h = img.height;
  const data = img.data;
  const out = new ImageData(new Uint8ClampedArray(data), w, h);
  const od = out.data;

  // 多源 BFS：透明像素（alpha<128）为起点，距离 = 0；不透明像素距离 = INF
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [];
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    if (data[p + 3] < 128) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  const dx = [-1, 1, 0, 0];
  const dy = [0, 0, -1, 1];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    const nd = dist[cur] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = cx + dx[k];
      const ny = cy + dy[k];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = ny * w + nx;
      if (dist[ni] !== -1) continue;
      // 只在不透明像素里传播（描边只在主体内）
      if (data[ni * 4 + 3] >= 128) {
        dist[ni] = nd;
        queue.push(ni);
      }
    }
  }

  // 染色：距离 ∈ [1, sw] 的像素改为描边色（保持原 alpha）
  for (let i = 0; i < w * h; i++) {
    if (dist[i] >= 1 && dist[i] <= sw) {
      const p = i * 4;
      od[p] = sr;
      od[p + 1] = sg;
      od[p + 2] = sb;
      // alpha 保持原值
    }
  }
  return out;
}

/**
 * 矩形裁切。
 * 来源：cropImageBlob。
 * @param {ImageData} img
 * @param {{ x?: number, y?: number, w?: number, h?: number }} rect 默认裁掉 alpha 全透明边缘
 * @returns {ImageData}
 */
export function crop(img, rect) {
  if (rect && rect.w && rect.h) {
    const x = Math.max(0, Math.floor(rect.x ?? 0));
    const y = Math.max(0, Math.floor(rect.y ?? 0));
    const w = Math.min(img.width - x, Math.floor(rect.w));
    const h = Math.min(img.height - y, Math.floor(rect.h));
    if (w < 1 || h < 1) return img;
    const out = new ImageData(w, h);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const si = ((y + yy) * img.width + (x + xx)) * 4;
        const oi = (yy * w + xx) * 4;
        out.data[oi] = img.data[si];
        out.data[oi + 1] = img.data[si + 1];
        out.data[oi + 2] = img.data[si + 2];
        out.data[oi + 3] = img.data[si + 3];
      }
    }
    return out;
  }
  // 默认：自动裁掉四周全透明边缘
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img; // 全透明，原样返回
  return crop(img, { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
}
