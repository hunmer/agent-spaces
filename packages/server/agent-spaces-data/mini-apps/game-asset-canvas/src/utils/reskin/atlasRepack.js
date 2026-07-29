/**
 * 把一组 region PNG 重新打包成 Spine atlas sheet（对译 app/backend/spine/atlas_repack.py）。
 *
 * 输入：region 名 → {img: ImageBitmap/Canvas, width, height}
 * 输出：{ canvas(合成好的 sheet), atlasText, sheetW, sheetH, placements, nameMap }
 *
 * placements 的 key 是 sanitized 名；nameMap 是 原始名 → sanitized 名（保证含 `/` 的名 round-trip）。
 */
import { pack } from './atlasPacker';
import { pasteToSheet } from './canvasUtils';

/** 折叠 `/ \` 空白 → `_`（与 safeFilename 一致，保持 round-trip） */
function _safe(name) {
  return (String(name).replace(/[\s/\\]+/g, '_').replace(/^_+|_+$/g, '') || name);
}

/**
 * 打包 region 集合成 atlas sheet。
 *
 * @param {Object<string,{img:HTMLImageElement|ImageBitmap|HTMLCanvasElement, width:number, height:number}>} parts
 *   key 是原始 region 名（可能含 `/`）
 * @param {string} name atlas 基名（产出 .png/.atlas 文件名前缀）
 * @param {number} padding 间距（默认 2）
 * @returns {Promise<{canvas:HTMLCanvasElement, atlasText:string, sheetW:number, sheetH:number, placements:Object, nameMap:Object}>}
 */
export async function repackAtlas(parts, name, padding = 2) {
  const images = {};          // sanitized 名 → {width, height}
  const imagesWithImg = {};   // sanitized 名 → {img, width, height}
  const stemToOrig = {};      // 原始名 → sanitized 名

  for (const [origName, meta] of Object.entries(parts)) {
    const safe = _safe(origName);
    images[safe] = { width: meta.width, height: meta.height };
    imagesWithImg[safe] = meta;
    stemToOrig[origName] = safe;
  }
  if (!Object.keys(images).length) throw new Error('repackAtlas: 无 region PNG');

  const { width: sheetW, height: sheetH, placements } = pack(images, padding);

  // 合成 sheet
  const pasteList = Object.entries(placements).map(([stem, [x, y]]) => ({
    img: imagesWithImg[stem]?.img,
    x, y,
  }));
  const canvas = pasteToSheet(sheetW, sheetH, pasteList, [0, 0, 0, 0]);

  // 写 Spine 4.x atlas 文本（与 Python 版格式一致）
  const lines = [
    '',
    `${name}.png`,
    `  size: ${sheetW},${sheetH}`,
    '  format: RGBA8888',
    '  filter: Linear,Linear',
    '  repeat: none',
  ];
  for (const [stem, [x, y, w, h]] of Object.entries(placements)) {
    lines.push(
      stem,
      '  rotate: false',
      `  xy: ${x}, ${y}`,
      `  size: ${w}, ${h}`,
      `  orig: ${w}, ${h}`,
      '  offset: 0, 0',
      '  index: -1',
    );
  }
  const atlasText = `${lines.join('\n')}\n`;

  return {
    canvas,
    atlasText,
    sheetW,
    sheetH,
    placements: Object.fromEntries(
      Object.entries(placements).map(([stem, [x, y, w, h]]) => [stem, { x, y, w, h }]),
    ),
    nameMap: stemToOrig, // 原始名 → sanitized 名
  };
}
