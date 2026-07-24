/**
 * 雪碧图/UI 图集拆分算法（从 sprite-splitter-web 移植，纯函数，无 DOM 依赖）。
 *
 * 核心能力：
 * - detect：连通域 + 包围盒，按 method（四角色/吸取色/alpha/亮度）判断前景
 * - exportBox：按 box 裁剪，可把背景色像素置透明
 * - sampleColor / cornerColor / toHex：辅助
 *
 * 输入统一为 ImageData（{ width, height, data: Uint8ClampedArray }）。
 */

/**
 * 检测图片中所有独立的「前景块」包围盒。
 * @param {ImageData} imageData
 * @param {object} options
 * @param {string} [options.method='corner']  corner|picked|alpha|brightness
 * @param {number} [options.tolerance=70]     容差（0..765）
 * @param {number} [options.minArea=500]      最小像素面积
 * @param {number} [options.minWidth=20]      最小宽
 * @param {number} [options.minHeight=20]     最小高
 * @param {number} [options.padding=2]        外扩像素
 * @param {[number,number,number]} [options.backgroundColor] picked 时的背景色
 * @returns {Array<{x,y,width,height,area}>}  按 y/x 排序
 */
export function detect(imageData, options = {}) {
  const tolerance = options.tolerance ?? 70;
  const minArea = options.minArea ?? 500;
  const minWidth = options.minWidth ?? 20;
  const minHeight = options.minHeight ?? 20;
  const padding = options.padding ?? 2;
  const method = options.method || 'corner';
  const bg = options.backgroundColor || cornerColor(imageData);
  const { width, height, data } = imageData;
  const seen = new Uint8Array(width * height);
  const boxes = [];

  const foreground = (x, y) => {
    const i = (y * width + x) * 4;
    if (method === 'alpha') return data[i + 3] > tolerance;
    if (method === 'brightness') return data[i] + data[i + 1] + data[i + 2] < tolerance * 3;
    return colorDistance(data[i], data[i + 1], data[i + 2], bg) > tolerance;
  };

  const DX = [1, -1, 0, 0];
  const DY = [0, 0, 1, -1];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start] || !foreground(x, y)) {
        seen[start] = 1;
        continue;
      }

      const queue = [x, y];
      seen[start] = 1;
      let head = 0;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;

      while (head < queue.length) {
        const cx = queue[head++];
        const cy = queue[head++];
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let n = 0; n < 4; n += 1) {
          const nx = cx + DX[n];
          const ny = cy + DY[n];
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (seen[ni]) continue;
          seen[ni] = 1;
          if (foreground(nx, ny)) queue.push(nx, ny);
        }
      }

      const rawWidth = maxX - minX + 1;
      const rawHeight = maxY - minY + 1;
      if (area >= minArea && rawWidth >= minWidth && rawHeight >= minHeight) {
        const x1 = Math.max(0, minX - padding);
        const y1 = Math.max(0, minY - padding);
        const x2 = Math.min(width, maxX + 1 + padding);
        const y2 = Math.min(height, maxY + 1 + padding);
        boxes.push({ x: x1, y: y1, width: x2 - x1, height: y2 - y1, area });
      }
    }
  }

  return boxes.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 按 box 裁剪出一张图（可选把背景色像素置透明）。
 * @param {ImageData} imageData
 * @param {{x,y,width,height}} box
 * @param {object} options
 * @param {[number,number,number]} [options.backgroundColor]
 * @param {number} [options.tolerance=70]
 * @param {boolean} [options.transparent=true]  背景色像素是否置透明
 * @returns {HTMLCanvasElement}
 */
export function exportBox(imageData, box, options = {}) {
  const bg = options.backgroundColor || cornerColor(imageData);
  const tolerance = options.tolerance ?? 70;
  const transparent = options.transparent !== false;
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(width, height);

  for (let yy = 0; yy < height; yy += 1) {
    for (let xx = 0; xx < width; xx += 1) {
      const sx = x + xx;
      const sy = y + yy;
      const dst = (yy * width + xx) * 4;
      if (sx >= imageData.width || sy >= imageData.height) continue;
      const src = (sy * imageData.width + sx) * 4;
      out.data[dst] = imageData.data[src];
      out.data[dst + 1] = imageData.data[src + 1];
      out.data[dst + 2] = imageData.data[src + 2];
      out.data[dst + 3] =
        transparent &&
        colorDistance(imageData.data[src], imageData.data[src + 1], imageData.data[src + 2], bg) <= tolerance
          ? 0
          : imageData.data[src + 3];
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** 取 (x,y) 处像素 RGB（自动夹到边界）。 */
export function sampleColor(imageData, x, y) {
  const sx = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
  const i = (sy * imageData.width + sx) * 4;
  return [imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]];
}

/** 取四角中位色作为背景色估计。 */
export function cornerColor(imageData) {
  const { width, height, data } = imageData;
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  return [0, 1, 2].map((channel) => {
    const values = points.map(([x, y]) => data[(y * width + x) * 4 + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
}

/** RGB 颜色距离（L1）。 */
export function colorDistance(r, g, b, bg) {
  return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
}

/** [r,g,b] → #rrggbb */
export function toHex(color) {
  return `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 把图片 URL 加载成 { image, canvas, ctx, imageData }（用于 detect/exportBox）。
 * 走 proxyImageUrl 代理避免跨域污染 canvas。
 * @param {string} url
 * @returns {Promise<{image:HTMLImageElement, canvas:HTMLCanvasElement, ctx:CanvasRenderingContext2D, imageData:ImageData}>}
 */
export async function loadImageSource(url) {
  const AS = window.AgentSpaces;
  const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = proxied;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return { image, canvas, ctx, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}
