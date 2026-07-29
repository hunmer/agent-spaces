/**
 * Canvas 图像工具 —— 前端替代 PIL 的图像操作。
 *
 * 提供 dataUrl↔Image↔Canvas 互转、裁剪、粘贴、按 bbox+rotate 裁 region、
 * 侵蚀 alpha 边缘（去 Gemini 白边）等能力，供 reskin pipeline 使用。
 *
 * 浏览器原生 Canvas 2D API，无第三方依赖。
 */

/** 把 dataUrl 加载成 HTMLImageElement */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`图片加载失败: ${src?.slice?.(0, 64) || src}`));
    img.src = src;
  });
}

/** Image/Blob/dataUrl → ImageBitmap（更高效，drawImage 友好） */
export async function toImageBitmap(src) {
  if (src instanceof ImageBitmap) return src;
  if (src instanceof Blob) {
    try { return await createImageBitmap(src); } catch { /* 降级 */ }
  }
  const img = await loadImage(src);
  try { return await createImageBitmap(img); } catch { return img; }
}

/** 创建指定尺寸的 canvas（透明背景） */
export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** 把 Image/ImageBitmap/dataUrl 画到 canvas，返回该 canvas */
export function drawToCanvas(src, w, h) {
  const img = src instanceof HTMLImageElement || src instanceof ImageBitmap ? src : null;
  const cw = w ?? img?.width;
  const ch = h ?? img?.height;
  const c = createCanvas(cw, ch);
  const ctx = c.getContext('2d');
  if (img) ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Canvas → PNG dataUrl */
export function canvasToDataUrl(canvas, type = 'image/png', quality) {
  return canvas.toDataURL(type, quality);
}

/** Canvas → Blob */
export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob 失败'))), type, quality);
  });
}

/**
 * 按 bbox + rotate 裁剪 region（对译 Python _crop_region_rotated）。
 * rotate: 0 / 90 / 180 / 270，Spine 旋转是逆时针，Canvas rotate 是顺时针，故取反。
 *
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} sheet 源图
 * @param {number} x,y,w,h region 在 sheet 上的 bbox
 * @param {number} rotate 0/90/180/270
 * @returns {HTMLCanvasElement} 裁出的 region（已去旋转）
 */
export function cropRegionRotated(sheet, x, y, w, h, rotate = 0) {
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));
  // 先按 bbox 尺寸裁出（旋转后的 footprint）
  const cropped = createCanvas(rw, rh);
  cropped.getContext('2d').drawImage(
    sheet,
    Math.round(x), Math.round(y), rw, rh,
    0, 0, rw, rh,
  );
  if (!rotate) return cropped;
  // 反向旋转得到原始朝向
  // Spine rotate=90 表示原图逆时针转90°贴入，故 expand 反向转 -90（即 ctx rotate +90? 见下）
  const out = createCanvas(rw, rh);
  const ctx = out.getContext('2d');
  ctx.translate(rw / 2, rh / 2);
  // Python: rotate(-90, expand=True) 对应 ctx 顺时针 -(-90)=? 统一用 deg 数值映射
  let deg = 0;
  if (rotate === 90) deg = -90;
  else if (rotate === 180) deg = 180;
  else if (rotate === 270) deg = 90;
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-rw / 2, -rh / 2);
  ctx.drawImage(cropped, 0, 0);
  return out;
}

/**
 * 侵蚀 alpha 边缘（去 Gemini 重绘后的白边）。
 * 简化版：遍历像素，alpha < 阈值的置 0，边缘 N 像素的 alpha 衰减。
 * radius > 0 才生效；返回新 canvas（不改原）。
 *
 * @param {HTMLCanvasElement} canvas 输入
 * @param {number} radius 侵蚀半径（px）
 * @returns {HTMLCanvasElement}
 */
export function erodeAlpha(canvas, radius = 0) {
  if (!radius || radius < 1) return canvas;
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = Math.max(1, Math.round(radius));
  // 简易侵蚀：若像素的 8 邻域内有透明像素，则按距离衰减该像素 alpha
  const out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (d[i] === 0) continue;
      // 找最近的透明像素距离
      let minDist = r + 1;
      for (let dy = -r; dy <= r && minDist > 1; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (d[(ny * w + nx) * 4 + 3] < 32) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) minDist = dist;
          }
        }
      }
      if (minDist <= r) {
        const factor = minDist / r; // 0..1
        out[i] = Math.floor(d[i] * factor);
      }
    }
  }
  const oCtx = createCanvas(w, h).getContext('2d');
  const oImg = new ImageData(out, w, h);
  oCtx.putImageData(oImg, 0, 0);
  return oCtx.canvas;
}

/**
 * 把多张 region 图按 placements 粘贴到一张大 canvas（对译 atlas.paste 循环）。
 *
 * @param {number} sheetW,sheetH 目标尺寸
 * @param {Array<{img, x, y}>} placements 待粘贴项（img 为 Image/ImageBitmap/Canvas）
 * @param {[number,number,number,number]} [bg] 背景色 [r,g,b,a]，默认全透明
 * @returns {HTMLCanvasElement}
 */
export function pasteToSheet(sheetW, sheetH, placements, bg = [0, 0, 0, 0]) {
  const c = createCanvas(sheetW, sheetH);
  const ctx = c.getContext('2d');
  if (bg[3] > 0) {
    ctx.fillStyle = `rgba(${bg[0]},${bg[1]},${bg[2]},${bg[3] / 255})`;
    ctx.fillRect(0, 0, sheetW, sheetH);
  }
  for (const p of placements) {
    if (!p.img) continue;
    ctx.drawImage(p.img, Math.round(p.x), Math.round(p.y));
  }
  return c;
}

/** 缩放 canvas（返回新 canvas） */
export function resizeCanvas(src, w, h) {
  const c = createCanvas(w, h);
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return c;
}
