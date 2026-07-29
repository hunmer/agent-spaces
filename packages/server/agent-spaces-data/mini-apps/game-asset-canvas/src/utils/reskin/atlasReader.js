/**
 * Spine .atlas 文本解析（对译 app/backend/spine/atlas_reader.py）。
 *
 * 支持两种格式：
 *  - Spine 4.x 标准：`xy: x, y` + `size: w, h` + 可选 `rotate:`
 *  - 遗留紧凑：`bounds: x, y, w, h`
 *
 * 解析为 { sheetFilename, sheetW, sheetH, regions: [{name,x,y,w,h,rotate,origW,origH}] }
 */

/**
 * 解析 .atlas 文本。
 * @param {string} text atlas 文件内容
 * @returns {{sheetFilename:string, sheetW:number, sheetH:number, regions:Array}}
 */
export function parseAtlas(text) {
  const lines = text.split(/\r?\n/);

  // 第一个非空行 = sheet 文件名
  let sheetFilename = '';
  let cursor = 0;
  while (cursor < lines.length) {
    const s = lines[cursor].trim();
    if (s) { sheetFilename = s; break; }
    cursor += 1;
  }
  cursor += 1;

  // 页级尺寸：任意位置的 `size: W, H`
  let sheetW = 0, sheetH = 0;
  for (const ln of lines) {
    const m = /^\s*size:\s*(\d+)\s*[,xX]\s*(\d+)\s*$/.exec(ln);
    if (m) { sheetW = parseInt(m[1], 10); sheetH = parseInt(m[2], 10); break; }
  }

  const regions = [];
  let curName = null;
  let cur = null;

  const flush = () => {
    if (curName == null || cur == null) { curName = null; cur = null; return; }
    const rotate = cur.rotate ?? 0;
    let x, y, w, h;
    if (cur.bounds) { [x, y, w, h] = cur.bounds; }
    else { x = (cur.xy ?? [0, 0])[0]; y = (cur.xy ?? [0, 0])[1]; w = (cur.size ?? [0, 0])[0]; h = (cur.size ?? [0, 0])[1]; }
    if (w <= 0 || h <= 0) { curName = null; cur = null; return; }
    let [origW, origH] = cur.orig ?? [w, h];
    if ((rotate === 90 || rotate === 270) && !cur.orig) {
      origW = h; origH = w; // 旋转后 packed 的 w/h 是 footprint，互换得原始
    }
    regions.push({
      name: curName,
      x: parseInt(x, 10), y: parseInt(y, 10),
      w: parseInt(w, 10), h: parseInt(h, 10),
      rotate: parseInt(rotate, 10),
      origW: parseInt(origW, 10), origH: parseInt(origH, 10),
    });
    curName = null; cur = null;
  };

  for (let i = cursor; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\r?\n$/, '');
    if (!raw.trim()) continue;
    const isIndented = /^\s/.test(raw);
    if (!isIndented && !/:\s*/.test(line.trim())) {
      // 新 region 名（非缩进、无冒号）
      flush();
      curName = line.trim();
      cur = {};
      continue;
    }
    if (cur == null) continue;
    const s = line.trim();
    let m;
    if ((m = /^bounds:\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s))) {
      cur.bounds = [+m[1], +m[2], +m[3], +m[4]]; continue;
    }
    if ((m = /^xy:\s*(\d+)\s*,\s*(\d+)/.exec(s))) { cur.xy = [+m[1], +m[2]]; continue; }
    if ((m = /^size:\s*(\d+)\s*,\s*(\d+)/.exec(s)) && !cur.size) { cur.size = [+m[1], +m[2]]; continue; }
    if ((m = /^orig:\s*(\d+)\s*,\s*(\d+)/.exec(s))) { cur.orig = [+m[1], +m[2]]; continue; }
    if ((m = /^rotate:\s*(\d+|true|false)/i.exec(s))) {
      const v = m[1].toLowerCase();
      cur.rotate = v === 'true' ? 90 : v === 'false' ? 0 : parseInt(v, 10);
      continue;
    }
  }
  flush();

  return { sheetFilename, sheetW, sheetH, regions };
}

/**
 * 文件名转文件系统安全名（对译 _safe_filename / repack._safe）。
 * 折叠 `/ \` 空白 → `_`，确保 PNG 存盘不把 `/` 当路径分隔符。
 */
export function safeFilename(name) {
  return (String(name).replace(/[\s/\\]+/g, '_').replace(/^_+|_+$/g, '') || name);
}
