/**
 * Shelf（货架）bin-packing（对译 scripts/make_atlas.py:pack）。
 *
 * 算法：按高度降序排 → 从左到右铺 → 超宽换行 → 最终宽高 round up 到 pow2。
 * 不是 MaxRects，但与原后端一致，保证布局可复现。
 */

/** 向上取整到最近的 2 的幂（对译 next_pow2） */
export function nextPow2(v) {
  v = Math.max(0, Math.floor(v));
  v -= 1;
  v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
  return Math.max(v + 1, 1);
}

/**
 * Shelf packing。
 * @param {Object<string,{width:number,height:number}>} images 名→尺寸
 * @param {number} padding 间距（px，默认 2）
 * @returns {{width:number, height:number, placements:Object<string,[number,number,number,number]>}}
 *   placements: 名 → [x, y, w, h]
 */
export function pack(images, padding = 2) {
  const entries = Object.entries(images).sort((a, b) => b[1].height - a[1].height);

  let totalArea = 0;
  for (const { width, height } of Object.values(images)) totalArea += width * height;
  const est = Math.floor(Math.sqrt(totalArea) * 1.3);
  let atlasW = nextPow2(est);

  const placements = {};
  let rx = padding, ry = padding, rh = 0, maxW = 0;

  for (const [name, img] of entries) {
    if (rx + img.width + padding > atlasW) {
      rx = padding;
      ry += rh + padding;
      rh = 0;
    }
    placements[name] = [rx, ry, img.width, img.height];
    maxW = Math.max(maxW, rx + img.width + padding);
    rh = Math.max(rh, img.height);
    rx += img.width + padding;
  }

  return {
    width: nextPow2(maxW),
    height: nextPow2(ry + rh + padding),
    placements,
  };
}
