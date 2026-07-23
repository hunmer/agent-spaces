/**
 * 图层叠加合成：手写 alpha-over + 常见混合模式。
 * 来源：FrameRonin Rseprite/composeFrame.ts composeFrameToImageData（原本用 canvas drawImage 叠加），
 * 这里改成纯像素 alpha-over 公式 + 混合模式。
 *
 * 零依赖。
 */

/**
 * 合成模式实现（对不透明像素的 RGB 做混合）。
 * base = 下层已合成色，src = 当前层色。
 */
const BLEND = {
  normal: (b, s) => s,
  multiply: (b, s) => (b * s) / 255,
  screen: (b, s) => 255 - ((255 - b) * (255 - s)) / 255,
  overlay: (b, s) => (b < 128 ? (2 * b * s) / 255 : 255 - (2 * (255 - b) * (255 - s)) / 255),
  add: (b, s) => Math.min(255, b + s),
};

/**
 * 多图层自下而上 alpha-over 合成。
 * 所有图层需同尺寸；尺寸不同时按第一张的画布，后续居中放置（超出裁掉）。
 * @param {ImageData[]} layers 从下到上
 * @param {{ mode?: 'normal'|'multiply'|'screen'|'overlay'|'add' }} opts
 * @returns {ImageData}
 */
export function composeLayers(layers, opts = {}) {
  if (!layers.length) throw new Error('无图层可合成');
  const mode = BLEND[opts.mode] ? opts.mode : 'normal';
  const blend = BLEND[mode];
  const w = layers[0].width;
  const h = layers[0].height;
  const out = new ImageData(w, h);
  const od = out.data;

  for (const layer of layers) {
    const ld = layer.data;
    const lw = layer.width;
    const lh = layer.height;
    const offX = Math.floor((w - lw) / 2);
    const offY = Math.floor((h - lh) / 2);
    for (let y = 0; y < lh; y++) {
      const dy = offY + y;
      if (dy < 0 || dy >= h) continue;
      for (let x = 0; x < lw; x++) {
        const dx = offX + x;
        if (dx < 0 || dx >= w) continue;
        const si = (y * lw + x) * 4;
        const sa = ld[si + 3] / 255;
        if (sa === 0) continue;
        const oi = (dy * w + dx) * 4;
        const oa = od[oi + 3] / 255;

        if (mode === 'normal' || oa === 0) {
          // 标准 source-over
          const outA = sa + oa * (1 - sa);
          if (outA === 0) continue;
          for (let c = 0; c < 3; c++) {
            const srcC = ld[si + c];
            const dstC = od[oi + c];
            od[oi + c] = Math.round((srcC * sa + dstC * oa * (1 - sa)) / outA);
          }
          od[oi + 3] = Math.round(outA * 255);
        } else {
          // 非正常模式：先对 RGB 做混合，再标准合成
          const mixed = [blend(od[oi], ld[si]), blend(od[oi + 1], ld[si + 1]), blend(od[oi + 2], ld[si + 2])];
          const outA = sa + oa * (1 - sa);
          if (outA === 0) continue;
          for (let c = 0; c < 3; c++) {
            od[oi + c] = Math.round((Math.round(mixed[c]) * sa + od[oi + c] * oa * (1 - sa)) / outA);
          }
          od[oi + 3] = Math.round(outA * 255);
        }
      }
    }
  }
  return out;
}
