/**
 * 抠图去背：色度键（绿幕/蓝幕）+ 白底抠图 + alpha 侵蚀。
 * 来源：FrameRonin ImageMatte.tsx chromaKeyCanvas + erodeAlphaOnCanvas +
 * doubleBackgroundMatte.ts（双背景抠图此处暂不移植，需两张图输入，节点单图场景用不到）。
 *
 * 零依赖（纯逐像素 + 3×3 邻域）。GLSL 版白底抠图改用 CPU 等价物 erodeAlphaOnCanvas。
 */

/**
 * 色度键抠图：按指定键色（绿/蓝/自定义）+ 容差 + 平滑带 + 抑色。
 * 来源：chromaKeyCanvas。
 * @param {ImageData} imageData
 * @param {[number,number,number]} keyColor [r,g,b]
 * @param {number} tolerance 0-100（阈值，越大抠除范围越广）
 * @param {number} smoothness 0-100（过渡带宽度）
 * @param {number} spill 0-100（抑色强度，去边缘溢色）
 * @returns {ImageData}
 */
export function chromaKey(imageData, keyColor, tolerance = 80, smoothness = 30, spill = 0) {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const [kr, kg, kb] = keyColor;
  const thresh = (tolerance / 100) * 100;
  const smooth = 50 + (smoothness / 100) * 120;
  const spillStr = spill / 100;
  const data = out.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = r - kr, dg = g - kg, db = b - kb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    let alpha;
    if (dist <= thresh) {
      alpha = 0;
    } else if (dist < thresh + smooth) {
      alpha = Math.min(1, (dist - thresh) / smooth);
    } else {
      alpha = 1;
    }

    // 抑色：去饱和 + 绿/蓝幕通道收紧
    if (spillStr > 0 && alpha > 0) {
      const baseMask = Math.max(0, dist - thresh);
      const spillVal = Math.pow(Math.min(1, baseMask / Math.max(1, spillStr * 120)), 1.5);
      const gray = r * 0.2126 + g * 0.7152 + b * 0.0722;
      let rr = gray * (1 - spillVal) + r * spillVal;
      let gg = gray * (1 - spillVal) + g * spillVal;
      let bb = gray * (1 - spillVal) + b * spillVal;
      const strength = Math.min(1, spillStr * (1.2 - spillVal * 0.4));
      if (kg >= kr && kg >= kb && g > Math.max(r, b)) {
        const limit = (rr + bb) / 2;
        gg = gg - strength * (gg - limit);
      }
      if (kb >= kr && kb >= kg && b > Math.max(r, g)) {
        const limit = (rr + gg) / 2;
        bb = bb - strength * (bb - limit);
      }
      data[i] = Math.round(Math.max(0, Math.min(255, rr)));
      data[i + 1] = Math.round(Math.max(0, Math.min(255, gg)));
      data[i + 2] = Math.round(Math.max(0, Math.min(255, bb)));
    }
    data[i + 3] = Math.round(alpha * 255);
  }
  return out;
}

/**
 * 白底抠图：把接近白色的像素置透明（RGB 距离白点 < tolerance）。
 * 来源：ImageMatte 白底逻辑（CPU 版，替代 GLSL）。
 * @param {ImageData} imageData
 * @param {number} tolerance 0-255（RGB 各通道差值之和阈值）
 * @returns {ImageData}
 */
export function whiteKey(imageData, tolerance = 30) {
  const out = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  const data = out.data;
  // 阈值换算：tolerance 0-100 映射到差值之和 0-255*3
  const thresh = (tolerance / 100) * 255 * 3;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = (255 - r) + (255 - g) + (255 - b);
    if (dist < thresh) {
      data[i + 3] = 0;
    }
  }
  return out;
}

/**
 * alpha 侵蚀：3×3 邻域取最小 alpha，去边缘杂色。
 * 来源：erodeAlphaOnCanvas。
 * @param {ImageData} imageData
 * @param {number} passes 侵蚀次数（每次缩进 1px）
 * @returns {ImageData}
 */
export function erodeAlpha(imageData, passes) {
  if (passes <= 0) return imageData;
  const w = imageData.width;
  const h = imageData.height;
  let read = new ImageData(new Uint8ClampedArray(imageData.data), w, h);
  let write = new ImageData(new Uint8ClampedArray(imageData.data), w, h);
  const dx = [-1, -1, -1, 0, 0, 1, 1, 1];
  const dy = [-1, 0, 1, -1, 1, -1, 0, 1];
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        write.data[i] = read.data[i];
        write.data[i + 1] = read.data[i + 1];
        write.data[i + 2] = read.data[i + 2];
        let minA = read.data[i + 3];
        for (let k = 0; k < 8; k++) {
          const nx = x + dx[k];
          const ny = y + dy[k];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            minA = Math.min(minA, read.data[(ny * w + nx) * 4 + 3]);
          }
        }
        write.data[i + 3] = minA;
      }
    }
    [read, write] = [write, read];
  }
  return read;
}

/** hex 颜色字符串 → [r,g,b] */
export function hexToRgb(hex) {
  const h = String(hex || '#00ff00').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(n, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
