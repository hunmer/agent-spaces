/**
 * 合成 [snapshot | atlas_sheet] 左右并排图（对译 app/backend/reskin/atlas_compose.py）。
 *
 * 处理模型收到单张含两半的图：左半=角色渲染（颜色/风格参考），右半=atlas sheet（重绘目标）。
 * 较矮的一半垂直居中，上下白底填充。
 */

export const ATLAS_RESKIN_PROMPT = `This image is a 2-half side-by-side composition of ONE character.

LEFT half: a fully-rendered single character in a pose. Use this as the
single source of truth for the new colour palette, shading, line weight,
and overall art style.

RIGHT half: that SAME character's atlas spritesheet — every body part
packed into a rectangular grid at native size, with empty space between
parts. Each packed region corresponds to one body part on the character.

TASK: reskin the entire character to: "{user_prompt}".

CRITICAL CONSTRAINTS:
- Every region on the RIGHT must belong to the SAME reskinned character
  shown on the LEFT. Pull colours from the LEFT and apply them
  consistently to every region on the RIGHT.
- Keep every region on the RIGHT in EXACTLY the same position, size, and
  rotation as the input. Do NOT move, scale, rotate, merge, split, add,
  or remove any region. Each region stays inside its current rectangle on
  the sheet.
- Preserve the LEFT-half pose, silhouette, and proportions exactly.

OUTPUT:
- Same dimensions as the input.
- Background between regions on the RIGHT must remain the same neutral
  colour as the input (transparent / black / white as the input shows).
  Do NOT introduce shadows, gradients, or coloured fills in the empty
  atlas areas.
- Do NOT render any text anywhere in the output.`;

export const ATLAS_RESKIN_NEGATIVE = (
  'do not move regions on the right; do not change region sizes; do not '
  + 'rotate regions; do not merge or overlap regions; do not add shadows or '
  + 'gradients to the atlas background; do not change the silhouette on the '
  + 'left; do not crop or reframe; do not render any text.'
);

/**
 * 合成 [snapshot | atlas] 左右并排。
 *
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} snapshot 角色截图
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} atlasSheet 原 atlas sheet
 * @returns {{canvas:HTMLCanvasElement, layout:Object}}
 *   layout = { mode, compositeW, compositeH, snapshotRect, atlasRect }
 */
export function buildAtlasComposite(snapshot, atlasSheet) {
  const sw = snapshot.width, sh = snapshot.height;
  const aw = atlasSheet.width, ah = atlasSheet.height;
  const canvasH = Math.max(sh, ah);
  const canvasW = sw + aw;
  const c = document.createElement('canvas');
  c.width = canvasW;
  c.height = canvasH;
  const ctx = c.getContext('2d');
  // 白底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);
  // 左半 snapshot 垂直居中
  const snapOffY = Math.floor((canvasH - sh) / 2);
  ctx.drawImage(snapshot, 0, snapOffY);
  // 右半 atlas 垂直居中
  const atlasOffY = Math.floor((canvasH - ah) / 2);
  ctx.drawImage(atlasSheet, sw, atlasOffY);

  const layout = {
    version: 2,
    mode: 'atlas',
    compositeW: canvasW,
    compositeH: canvasH,
    snapshotRect: { x: 0, y: snapOffY, w: sw, h: sh },
    atlasRect: { x: sw, y: atlasOffY, w: aw, h: ah },
  };
  return { canvas: c, layout };
}

/**
 * 从重绘后的 composite 裁出 atlas 半边（对译 pipeline.py 的 atlas_half 裁剪）。
 * layout 使用输入 composite 的逻辑坐标；工作流可能返回更高分辨率图片，
 * 因此先映射到实际输出坐标再裁切，并保留实际分辨率。
 *
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} composite 重绘后的合成图
 * @param {Object} layout buildAtlasComposite 返回的 layout
 * @returns {HTMLCanvasElement} atlas 半边 canvas
 */
export function cropAtlasHalf(composite, layout) {
  const ar = layout.atlasRect;
  const scaleX = composite.width / Math.max(1, layout.compositeW);
  const scaleY = composite.height / Math.max(1, layout.compositeH);
  const sourceX = Math.round(ar.x * scaleX);
  const sourceY = Math.round(ar.y * scaleY);
  const sourceW = Math.max(1, Math.round(ar.w * scaleX));
  const sourceH = Math.max(1, Math.round(ar.h * scaleY));
  const c = document.createElement('canvas');
  c.width = sourceW;
  c.height = sourceH;
  c.getContext('2d').drawImage(
    composite,
    sourceX, sourceY, sourceW, sourceH,
    0, 0, sourceW, sourceH,
  );
  return c;
}
