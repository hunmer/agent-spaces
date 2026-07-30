import { createCanvas } from './canvasUtils.js';

/** 构建保持原 atlas region 坐标的热预览图，供仍沿用旧 UV 的 Pixi 实例使用。 */
export function buildPreviewAtlas(regions, parts, sheetW, sheetH, canvasFactory = createCanvas) {
  const canvas = canvasFactory(sheetW, sheetH);
  const ctx = canvas.getContext('2d');
  for (const region of regions) {
    const img = parts[region.name]?.img;
    if (!img) continue;
    const x = Math.round(region.x), y = Math.round(region.y);
    const w = Math.max(1, Math.round(region.w)), h = Math.max(1, Math.round(region.h));
    const rotate = Number(region.rotate) || 0;
    if (!rotate) {
      ctx.drawImage(img, x, y, w, h);
      continue;
    }
    ctx.save();
    if (rotate === 90) {
      ctx.translate(x + w, y);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, 0, 0, h, w);
    } else if (rotate === 180) {
      ctx.translate(x + w, y + h);
      ctx.rotate(Math.PI);
      ctx.drawImage(img, 0, 0, w, h);
    } else if (rotate === 270) {
      ctx.translate(x, y + h);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0, h, w);
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  }
  return canvas;
}
