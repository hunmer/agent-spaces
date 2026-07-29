/**
 * Exploded（爆炸图）合成 —— 对译 app/backend/reskin/exploded_compose.py。
 *
 * 把每个 region 按其 default-skin attachment 的 x/y 摆放到大致组装位置，
 * 迭代推开重叠直到每对间有 padding 间隙，得到一张「爆炸视图」合成图。
 *
 * 与 atlas 方法（[snapshot|atlas] 左右并排）的区别：
 * exploded 不需要 snapshot，直接用 region 摆放图作为 Gemini 输入和分割源。
 * 给 Gemini 更强的解剖上下文（头→身→肢），跨部位风格一致性通常更好。
 */
import { cropRegionRotated } from './canvasUtils';

export const EXPLODED_RESKIN_PROMPT = `This image shows EVERY body part of ONE single character, laid out roughly
in their assembled positions but separated with small gaps so each part is
fully visible (an "exploded view" of the character). Each rectangular
region in the image is a separate body part of the SAME character — head,
eyes, hair, hands, body, limbs, clothing pieces, accessories, etc.

TASK: reskin every part to: "{user_prompt}".

CRITICAL CONSTRAINTS:
- All parts belong to ONE coherent character. Apply the SAME colour palette,
  shading, line weight, and art style across every part.
- Keep every part in EXACTLY the same position, size, and rotation as the
  input. Do NOT move, scale, rotate, merge, split, add, or remove any part.
  Each part stays inside its current rectangle.
- Preserve each part's silhouette and overall shape — only the surface
  appearance changes.

OUTPUT:
- Same dimensions as the input.
- Background between parts must remain clean white. Do NOT add shadows,
  gradients, or coloured fills in the gaps.
- Do NOT render any text in the output.`;

export const EXPLODED_RESKIN_NEGATIVE = (
  'do not move parts; do not change part sizes; do not rotate parts; do '
  + 'not merge or overlap parts; do not add shadows or gradients to the '
  + 'background; do not change part silhouettes; do not crop or reframe; '
  + 'do not render any text.'
);

/**
 * 取 default skin 里 region → {cx, cy, scaleX, scaleY} 的世界中心位置。
 * 对译 _world_centers_by_region。cx/cy 已做 Y 翻转（Spine Y up → image Y down）。
 *
 * @param {object} spineJson
 * @returns {Object<string,{cx,cy,scaleX,scaleY}>}
 */
function worldCentersByRegion(spineJson) {
  const skins = spineJson.skins;
  let atts;
  if (Array.isArray(skins)) {
    const def = skins.find((s) => s && s.name === 'default');
    atts = (def || {}).attachments || {};
  } else {
    atts = (skins || {}).default || {};
  }
  const out = {};
  for (const slotAtts of Object.values(atts)) {
    for (const [attKey, meta] of Object.entries(slotAtts || {})) {
      if (!meta || typeof meta !== 'object') continue;
      const region = meta.name || attKey;
      if (region in out) continue; // 多 slot 共享同一 region 只取第一个
      out[region] = {
        cx: Number(meta.x ?? 0),
        cy: -Number(meta.y ?? 0), // Spine Y up → image Y down
        scaleX: Number(meta.scaleX ?? 1),
        scaleY: Number(meta.scaleY ?? 1),
      };
    }
  }
  return out;
}

/**
 * 迭代 AABB 推开，直到每对 rect 间有 padding 间隙。
 * 对译 _resolve_overlaps。原地修改 placed。
 */
function resolveOverlaps(placed, padding, maxIter = 250, damping = 0.5, minPushPx = 0.5) {
  const n = placed.length;
  for (let iter = 0; iter < maxIter; iter++) {
    let anyPush = false;
    for (let i = 0; i < n; i++) {
      const a = placed[i];
      for (let j = i + 1; j < n; j++) {
        const b = placed[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const reqX = (a.w + b.w) / 2 + padding;
        const reqY = (a.h + b.h) / 2 + padding;
        const overlapX = reqX - Math.abs(dx);
        const overlapY = reqY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) {
          a.cx -= 1; b.cx += 1; anyPush = true; continue;
        }
        if (overlapX < overlapY) {
          const push = overlapX * damping;
          if (push < minPushPx) continue;
          const sign = dx > 0 ? 1 : -1;
          a.cx -= (sign * push) / 2;
          b.cx += (sign * push) / 2;
        } else {
          const push = overlapY * damping;
          if (push < minPushPx) continue;
          const sign = dy > 0 ? 1 : -1;
          a.cy -= (sign * push) / 2;
          b.cy += (sign * push) / 2;
        }
        anyPush = true;
      }
    }
    if (!anyPush) break;
  }
}

/**
 * 构建 exploded 合成图。
 *
 * @param {object} opts
 * @param {HTMLImageElement|ImageBitmap|HTMLCanvasElement} opts.atlasSheet 原 atlas sheet
 * @param {Array} opts.regions parseAtlas 返回的 region 列表
 * @param {object} opts.spineJson spine JSON（取 default skin attachment 位置）
 * @param {number} [opts.padding=10] region 间距
 * @returns {{canvas:HTMLCanvasElement, layout:Object}}
 *   layout = { mode:'exploded', compositeW, compositeH, padding, placements:{region:{x,y,w,h}} }
 */
export function buildExplodedComposite({ atlasSheet, regions, spineJson, padding = 10 }) {
  const centers = worldCentersByRegion(spineJson);

  // 裁出每个 region 并记录尺寸
  const placed = [];
  for (const region of regions) {
    const cropped = cropRegionRotated(atlasSheet, region.x, region.y, region.w, region.h, region.rotate);
    const meta = centers[region.name] || { cx: 0, cy: 0, scaleX: 1, scaleY: 1 };
    placed.push({
      region: region.name,
      img: cropped,
      cx: meta.cx,
      cy: meta.cy,
      w: cropped.width,
      h: cropped.height,
    });
  }

  resolveOverlaps(placed, padding);

  // 计算画布边界
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.cx - p.w / 2);
    minY = Math.min(minY, p.cy - p.h / 2);
    maxX = Math.max(maxX, p.cx + p.w / 2);
    maxY = Math.max(maxY, p.cy + p.h / 2);
  }
  const margin = padding;
  const canvasW = Math.round(maxX - minX) + 2 * margin;
  const canvasH = Math.round(maxY - minY) + 2 * margin;

  const c = document.createElement('canvas');
  c.width = Math.max(1, canvasW);
  c.height = Math.max(1, canvasH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  const placements = {};
  for (const p of placed) {
    const x = Math.round(p.cx - p.w / 2 - minX + margin);
    const y = Math.round(p.cy - p.h / 2 - minY + margin);
    ctx.drawImage(p.img, x, y);
    placements[p.region] = { x, y, w: p.w, h: p.h };
  }

  const layout = {
    version: 2,
    mode: 'exploded',
    compositeW: canvasW,
    compositeH: canvasH,
    padding,
    placements,
  };
  return { canvas, layout };
}
