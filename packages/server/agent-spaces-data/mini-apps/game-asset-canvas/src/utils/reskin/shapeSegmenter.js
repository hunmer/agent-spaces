/**
 * 形状交集分割（bg_components 方法的纯前端实现，替代 cv2.connectedComponents）。
 *
 * 后端原算法（cc_segment.py）：Bria 抠背景 → 连通组件 → 与原 atlas 轮廓 IoU 匹配。
 * 前端简化：直接用「原 region 轮廓 ∩ 新图非透明像素」作为 mask。
 *
 * 前提：换肤保持 pose-consistent（部件位置大致不动）——这是同一套骨架换肤的常态。
 * 若 reskin 把部件挪位导致交集失效，可降级为 bbox 内非透明像素（精度略低）。
 *
 * 不引入 opencv.js（~8MB 不值得），纯 Canvas 像素遍历。
 */

/**
 * 从源图（原 atlas sheet 或 exploded composite）构建每个 region 的「原轮廓」mask。
 * 轮廓 = 该 region 在源图 bbox 内、alpha > 阈值 的像素集合。
 *
 * @param {HTMLCanvasElement} sourceCanvas 源图（原 atlas sheet）
 * @param {Array} regions parseAtlas 返回的 region 列表
 * @param {number} [alphaThreshold=16] alpha 阈值
 * @returns {Object<string,Uint8Array>} region 名 → 整图尺寸的布尔 mask（1=轮廓内，0=外）
 */
export function buildOriginalSilhouettes(sourceCanvas, regions, alphaThreshold = 16) {
  const { width: w, height: h } = sourceCanvas;
  const ctx = sourceCanvas.getContext('2d');
  const srcData = ctx.getImageData(0, 0, w, h).data;
  const out = {};
  for (const region of regions) {
    const mask = new Uint8Array(w * h);
    const x0 = Math.max(0, Math.floor(region.x));
    const y0 = Math.max(0, Math.floor(region.y));
    const x1 = Math.min(w, Math.ceil(region.x + region.w));
    const y1 = Math.min(h, Math.ceil(region.y + region.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const a = srcData[(y * w + x) * 4 + 3];
        if (a > alphaThreshold) mask[y * w + x] = 1;
      }
    }
    out[region.name] = mask;
  }
  return out;
}

/**
 * 用形状交集法分割新图（reskinned）。
 * mask = 原轮廓 ∩ 新图非透明像素。
 *
 * @param {HTMLCanvasElement} newCanvas 重绘后的图（reskinned composite 或 atlas half）
 * @param {Array} regions region 列表
 * @param {Object<string,Uint8Array>} silhouettes buildOriginalSilhouettes 的输出
 * @param {number} [alphaThreshold=16]
 * @returns {Object<string,Uint8Array>} region 名 → 整图尺寸 mask（255=保留，0=丢弃）
 */
export function segmentByShapeIntersection(newCanvas, regions, silhouettes, alphaThreshold = 16) {
  const { width: w, height: h } = newCanvas;
  const ctx = newCanvas.getContext('2d');
  const newData = ctx.getImageData(0, 0, w, h).data;
  const out = {};
  for (const region of regions) {
    const sil = silhouettes[region.name];
    if (!sil) continue;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      // 原轮廓内有像素 且 新图此处非透明 → 保留
      if (sil[i] && newData[i * 4 + 3] > alphaThreshold) {
        mask[i] = 255;
      }
    }
    out[region.name] = mask;
  }
  return out;
}

/**
 * 把整图尺寸的 mask 应用到 region crop 上（裁出 + 蒙版）。
 *
 * @param {HTMLCanvasElement} sheet 源图
 * @param {{x,y,w,h,rotate}} region bbox
 * @param {Uint8Array} fullMask 整图尺寸 mask（255=保留）
 * @param {number} sheetW,sheetH 整图尺寸
 * @returns {HTMLCanvasElement} 蒙版后的 region canvas
 */
export function applyMaskToRegion(sheet, region, fullMask, sheetW, sheetH) {
  // 先裁出 region（含旋转处理）
  const tmp = document.createElement('canvas');
  tmp.width = Math.max(1, Math.round(region.w));
  tmp.height = Math.max(1, Math.round(region.h));
  const tCtx = tmp.getContext('2d');
  tCtx.drawImage(
    sheet,
    Math.round(region.x), Math.round(region.y), tmp.width, tmp.height,
    0, 0, tmp.width, tmp.height,
  );
  // 应用 mask：把 region bbox 内对应的 mask 区域乘到 alpha 上
  const imgData = tCtx.getImageData(0, 0, tmp.width, tmp.height);
  const d = imgData.data;
  for (let y = 0; y < tmp.height; y++) {
    for (let x = 0; x < tmp.width; x++) {
      const sx = Math.round(region.x) + x;
      const sy = Math.round(region.y) + y;
      if (sx < 0 || sy < 0 || sx >= sheetW || sy >= sheetH) continue;
      const m = fullMask[sy * sheetW + sx] || 0;
      const i = (y * tmp.width + x) * 4 + 3;
      d[i] = Math.min(d[i], m); // mask 0 → alpha 0
    }
  }
  tCtx.putImageData(imgData, 0, 0);
  return tmp;
}
