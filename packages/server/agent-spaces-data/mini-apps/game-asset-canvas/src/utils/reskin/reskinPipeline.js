/**
 * AI 换肤 pipeline 串联（对译 app/backend/reskin/pipeline.py + atlas_rebake.rebake_skin）。
 *
 * 支持两种合成方法：
 *   - atlas（默认）：[snapshot | atlas_sheet] 左右并排
 *   - exploded：每个 region 按 attachment 位置摆放成爆炸图
 *
 * 支持两种分割方法：
 *   - sam（默认）：逐 region 调 rembg SAM 抠图（精确但慢，N 次网络往返）
 *   - bg_components：形状交集法（原轮廓 ∩ 新alpha，纯前端像素遍历，快）
 *
 * 另含 per-slot 局部重绘（runInpaintSlot）。
 *
 * 所有步骤通过 onLog(step, msg, data) 回调实时上报，供 UI 展示。
 */

import { parseAtlas, safeFilename } from './atlasReader';
import { repackAtlas } from './atlasRepack';
import { addSkin, regionToSlotMap } from './skinWriter';
import {
  buildAtlasComposite, cropAtlasHalf, ATLAS_RESKIN_PROMPT, ATLAS_RESKIN_NEGATIVE,
} from './compositeBuilder';
import {
  buildExplodedComposite, EXPLODED_RESKIN_PROMPT, EXPLODED_RESKIN_NEGATIVE,
} from './explodedComposer';
import {
  buildOriginalSilhouettes, segmentByShapeIntersection, applyMaskToRegion,
} from './shapeSegmenter';
import {
  loadImage, createCanvas, cropRegionRotated, drawToCanvas, erodeAlpha,
} from './canvasUtils';
import { generateImages, normalizeImageUrl } from '../workflow';

const REMBG_PLUGIN = 'workflow.rembg';
const EDIT_ASPECTS = [
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
];

/** 工具函数：等待并解包 callPluginTool 结果 */
async function callPlugin(pluginId, toolName, args) {
  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');
  const ret = await AS.callPluginTool(pluginId, toolName, args);
  const data = ret && typeof ret === 'object' && 'result' in ret && typeof ret.success === 'boolean'
    ? ret.result
    : ret;
  return data;
}

/** http URL → dataUrl（经 proxyImageUrl 代理避免跨域） */
async function urlToDataUrl(url) {
  const AS = window.AgentSpaces;
  const proxied = AS?.proxyImageUrl ? AS.proxyImageUrl(url) : url;
  const resp = await fetch(proxied);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror = () => reject(new Error('urlToDataUrl 失败'));
    r.readAsDataURL(blob);
  });
}

/** dataUrl/Blob → 上传宿主 → http URL */
async function uploadDataUrl(dataUrl, filename) {
  const AS = window.AgentSpaces;
  if (!AS?.uploadFile) throw new Error('宿主 uploadFile 不可用');
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: blob.type || 'image/png' });
  const uploaded = await AS.uploadFile(file);
  return normalizeImageUrl(uploaded?.url || uploaded?.httpPath);
}

function closestEditAspect(width, height) {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  return EDIT_ASPECTS.reduce((best, option) => (
    Math.abs(option[1] - ratio) < Math.abs(best[1] - ratio) ? option : best
  ))[0];
}

/**
 * 侵蚀半径默认配置（对齐参考 SettingsModal 的 DEFAULT_EROSION）。
 * 按部件边长分四档：tiny / small / medium / large，每档独立半径。
 */
export const DEFAULT_EROSION = {
  enabled: true,
  pxSmall: 0,
  pxMedium: 1,
  pxLarge: 2,
  pxXlarge: 3,
  smallThreshold: 60,
  mediumThreshold: 200,
  largeThreshold: 500,
};

/**
 * 选取某个部件的侵蚀半径（px）。
 *
 * 优先级：
 *   1. opts.erosion（分档对象）→ 按边长落入 tiny/small/medium/large 档
 *   2. opts.erodePx（单一半径）→ 所有部件统一
 *   3. 兜底 → side / 60（保留原动态行为）
 *
 * 当 erosion.enabled === false 或计算出的 px <= 0 时返回 0（不侵蚀）。
 */
function pickErodePx(side, opts) {
  if (!opts) return 0;
  const erosion = opts.erosion;
  if (erosion && typeof erosion === 'object') {
    if (erosion.enabled === false) return 0;
    const s = side || 0;
    let px;
    if (s < (erosion.smallThreshold ?? 60)) px = erosion.pxSmall ?? 0;
    else if (s < (erosion.mediumThreshold ?? 200)) px = erosion.pxMedium ?? 1;
    else if (s < (erosion.largeThreshold ?? 500)) px = erosion.pxLarge ?? 2;
    else px = erosion.pxXlarge ?? 3;
    return Math.max(0, Math.round(px));
  }
  if (!opts.erode) return 0;
  return opts.erodePx ?? Math.max(1, Math.round((side || 0) / 60));
}

/** 调 edit_image workflow 重绘一张图，返回重绘后的 http URL */
async function workflowRedraw(imageUrl, prompt, opts, log) {
  const {
    workflowId, model = 'gpt-image-1', aspect = '1:1', size = '2k',
  } = opts;
  if (!workflowId) throw new Error('未配置编辑图片工作流');
  log('workflow', `调用 edit_image（${model} / ${aspect} / ${size}）…`);
  const t0 = performance.now();
  const images = await generateImages(workflowId, {
    images: [imageUrl], prompt, model, aspect, size,
  });
  const url = images[0];
  if (!url) throw new Error('edit_image 未返回重绘结果图');
  const ms = Math.round(performance.now() - t0);
  log('workflow', `edit_image 重绘完成（${ms}ms）`, { url, durationMs: ms });
  return { url, durationMs: ms };
}

async function resolveReskinnedImage({
  generatedImageUrl, compositeCanvas, skinName, prompt, workflowId, model, size,
  log, onGeneratedImage,
}) {
  if (generatedImageUrl) {
    const url = normalizeImageUrl(generatedImageUrl);
    log('workflow', '复用已有生成图，跳过 edit_image', { url, reused: true });
    return { url, durationMs: 0, reused: true };
  }

  log('upload', '上传 composite 到宿主…');
  const compositeUrl = await uploadDataUrl(
    compositeCanvas.toDataURL('image/png'),
    `composite-${skinName}-${Date.now()}.png`,
  );
  log('upload', 'composite 已上传');
  const result = await workflowRedraw(
    compositeUrl,
    prompt,
    {
      workflowId,
      model,
      size,
      aspect: closestEditAspect(compositeCanvas.width, compositeCanvas.height),
    },
    log,
  );
  try { onGeneratedImage?.(result.url); } catch { /* UI callback must not break pipeline */ }
  return { ...result, reused: false };
}

/**
 * 执行完整换肤 pipeline。
 *
 * @param {Object} input 输入素材
 * @param {HTMLCanvasElement|string} input.snapshot 角色截图（atlas 方法必需）
 * @param {string} input.atlasSheetUrl 原 atlas sheet PNG 的 http URL
 * @param {string} input.atlasText 原 .atlas 文件文本
 * @param {object} input.spineJson 原 Spine JSON 对象
 * @param {string} input.skinName 新皮肤名
 * @param {string} input.prompt 用户换肤描述
 * @param {string} [input.generatedImageUrl] 已生成的 composite 图片；存在时跳过 edit_image
 * @param {Object} [opts]
 * @param {'atlas'|'exploded'} [opts.method='atlas'] 合成方法
 * @param {'sam'|'bg_components'} [opts.segMethod='sam'] 分割方法
 * @param {string} opts.workflowId edit_image workflow ID
 * @param {string} [opts.model] 处理模型
 * @param {string} [opts.size='2k'] 输出尺寸
 * @param {boolean} [opts.erode] 是否侵蚀去白边（默认 false）
 * @param {number} [opts.erodePx] 侵蚀半径（默认按 region 边长缩放）
 * @param {(step:string, msg:string, data?:object) => void} [opts.onLog] 日志回调
 * @param {(url:string) => void} [opts.onGeneratedImage] 新图生成后、分割前回调
 * @returns {Promise<Object>} { newAtlasCanvas, newAtlasText, newSpineJson, layout, stats }
 */
export async function runReskin(input, opts = {}) {
  const {
    snapshot, atlasSheetUrl, atlasText, spineJson, skinName, prompt, generatedImageUrl,
  } = input;
  const {
    method = 'atlas', segMethod = 'sam',
    workflowId, model = 'gpt-image-1', size = '2k', onLog = () => {}, onGeneratedImage,
  } = opts;

  const log = (step, msg, data) => { try { onLog(step, msg, data); } catch { /* ignore */ } };
  const t0 = performance.now();

  // ① 解析原 atlas
  log('parse', '解析原 atlas…');
  const atlas = parseAtlas(atlasText);
  const regions = atlas.regions;
  if (!regions.length) throw new Error('原 atlas 无 region，无法换肤');
  log('parse', `原 atlas: ${atlas.sheetW}×${atlas.sheetH}，${regions.length} 个 region`, {
    sheetW: atlas.sheetW, sheetH: atlas.sheetH, regionCount: regions.length,
  });

  // ② 加载原 atlas sheet
  const atlasSheetImg = await loadImage(atlasSheetUrl);

  // ③ 合成 composite（按 method 分流）
  log('compose', `合成 composite（方法: ${method}）…`);
  let compositeCanvas, layout, reskinPrompt, reskinNegative;
  if (method === 'exploded') {
    const r = buildExplodedComposite({ atlasSheet: atlasSheetImg, regions, spineJson, padding: 10 });
    compositeCanvas = r.canvas;
    layout = r.layout;
    reskinPrompt = EXPLODED_RESKIN_PROMPT.replace('{user_prompt}', prompt);
    reskinNegative = EXPLODED_RESKIN_NEGATIVE;
  } else {
    // atlas 方法需要 snapshot
    if (!snapshot) throw new Error('atlas 方法需要 snapshot（角色截图）');
    const snapImg = snapshot instanceof HTMLCanvasElement ? snapshot : await loadImage(snapshot);
    const r = buildAtlasComposite(snapImg, atlasSheetImg);
    compositeCanvas = r.canvas;
    layout = r.layout;
    reskinPrompt = ATLAS_RESKIN_PROMPT.replace('{user_prompt}', prompt);
    reskinNegative = ATLAS_RESKIN_NEGATIVE;
  }
  log('compose', `composite 合成完成: ${layout.compositeW}×${layout.compositeH}`, { layout, method });

  // ④ 复用已有生成图，或上传 composite → edit_image workflow 重绘
  const {
    url: reskinnedUrl, durationMs: editImageMs, reused: reusedGeneratedImage,
  } = await resolveReskinnedImage({
    generatedImageUrl,
    compositeCanvas,
    skinName,
    prompt: reskinPrompt,
    workflowId,
    model,
    size,
    log,
    onGeneratedImage,
  });

  // ⑤ 下载重绘图，确定分割源
  const reskinnedImg = await loadImage(await urlToDataUrl(reskinnedUrl));
  let segmentSource; // 分割用的源 canvas
  if (method === 'atlas') {
    log('split', '裁取 atlas 半边…');
    segmentSource = cropAtlasHalf(reskinnedImg, layout, atlas.sheetW, atlas.sheetH);
    log('split', `atlas 半边已裁齐: ${segmentSource.width}×${segmentSource.height}`);
  } else {
    // exploded：分割源就是重绘后的 composite 本身
    segmentSource = reskinnedImg;
    // 尺寸对齐（工作流可能改尺寸）
    if (segmentSource.width !== layout.compositeW || segmentSource.height !== layout.compositeH) {
      const tmp = createCanvas(layout.compositeW, layout.compositeH);
      tmp.getContext('2d').drawImage(segmentSource, 0, 0, layout.compositeW, layout.compositeH);
      segmentSource = tmp;
    }
  }

  // ⑥ 分割（按 segMethod 分流）
  log('segment', `开始分割（方法: ${segMethod}，共 ${regions.length} 个 region）…`, { segMethod });
  const regionParts = {};       // region 名 → {img, width, height}
  let segDone = 0;

  if (segMethod === 'bg_components') {
    // 形状交集法：原轮廓 ∩ 新alpha
    // atlas 模式：原轮廓从原 atlas sheet 取；exploded：从原 composite 取（但原 composite 没存，用原 atlas sheet 近似）
    const silhouettes = buildOriginalSilhouettes(atlasSheetImg, regions);
    // 对于 exploded，silhouettes 的坐标系是原 atlas 的，但 segmentSource 是 composite 的 placements 坐标系
    // 需要把 segmentSource 按 placement 裁出（exploded 的 region bbox 来自 layout.placements）
    const segRegions = method === 'exploded'
      ? Object.entries(layout.placements || {}).map(([name, p]) => ({ name, x: p.x, y: p.y, w: p.w, h: p.h, rotate: 0 }))
      : regions;
    // exploded 的 silhouettes 要从 segmentSource 自身重建（它的轮廓就是原 region alpha）
    const useSilhouettes = method === 'exploded'
      ? buildOriginalSilhouettes(segmentSource, segRegions)
      : silhouettes;
    const masks = segmentByShapeIntersection(segmentSource, segRegions, useSilhouettes);
    const srcW = segmentSource.width, srcH = segmentSource.height;
    for (const region of segRegions) {
      const mask = masks[region.name];
      if (mask) {
        const masked = applyMaskToRegion(segmentSource, region, mask, srcW, srcH);
        let finalImg = masked;
        const px = pickErodePx(Math.max(region.w, region.h), opts);
        if (px > 0) finalImg = erodeAlpha(masked, px);
        regionParts[region.name] = { img: finalImg, width: region.w, height: region.h };
      } else {
        regionParts[region.name] = { img: cropRegionRotated(segmentSource, region.x, region.y, region.w, region.h, region.rotate), width: region.w, height: region.h };
      }
      segDone += 1;
      log('segment', `分割进度 ${segDone}/${segRegions.length}`, { done: segDone, total: segRegions.length });
    }
  } else {
    // SAM 模式：逐 region rembg 抠图
    for (const region of regions) {
      const safe = safeFilename(region.name);
      const regionCanvas = cropRegionRotated(segmentSource, region.x, region.y, region.w, region.h, region.rotate);
      try {
        const regionUrl = await uploadDataUrl(regionCanvas.toDataURL('image/png'), `region-${safe}-${Date.now()}.png`);
        const cx = Math.round(region.w / 2);
        const cy = Math.round(region.h / 2);
        const samResult = await callPlugin(REMBG_PLUGIN, 'rembg_sam_segment', {
          image: regionUrl,
          extras: { sam_prompt: [{ type: 'point', data: [cx, cy], label: 1 }] },
        });
        const maskedUrl = samResult?.data?.imageUrl || samResult?.imageUrl;
        if (!maskedUrl) throw new Error('rembg 未返回抠图结果');
        const loadedMask = await loadImage(await urlToDataUrl(maskedUrl));
        let maskedImg = drawToCanvas(loadedMask, region.w, region.h);
        const px = pickErodePx(Math.max(region.w, region.h), opts);
        if (px > 0) maskedImg = erodeAlpha(maskedImg, px);
        regionParts[region.name] = { img: maskedImg, width: region.w, height: region.h };
      } catch (err) {
        log('segment', `region "${region.name}" 抠图失败，降级用原始裁切: ${err?.message || err}`, { region: region.name, error: true });
        regionParts[region.name] = { img: regionCanvas, width: region.w, height: region.h };
      }
      segDone += 1;
      log('segment', `分割进度 ${segDone}/${regions.length}`, { done: segDone, total: regions.length });
    }
  }
  log('segment', `分割完成，成功 ${Object.keys(regionParts).length}/${regions.length} 个 region`);

  // ⑦ repack 打包
  log('repack', '打包新 atlas sheet…');
  const repackResult = await repackAtlas(regionParts, skinName, 2);
  log('repack', `新 atlas 打包完成: ${repackResult.sheetW}×${repackResult.sheetH}，${Object.keys(repackResult.placements).length} region`, {
    sheetW: repackResult.sheetW, sheetH: repackResult.sheetH,
  });

  // ⑧ skin_writer
  log('skin', '生成新 spine JSON（含新 skin）…');
  const region2slot = regionToSlotMap(spineJson);
  const skinPlacements = {};
  const attachmentNames = {};
  for (const [origRegion] of Object.entries(regionParts)) {
    const slot = region2slot[origRegion];
    if (!slot) continue;
    const safe = safeFilename(origRegion);
    const placement = repackResult.placements[safe];
    if (!placement) continue;
    skinPlacements[slot] = placement;
    attachmentNames[slot] = safe;
  }
  const newSpineJson = addSkin(spineJson, skinName, skinPlacements, { attachmentNames });
  log('skin', `新 skin "${skinName}" 已写入（${Object.keys(skinPlacements).length} slot）`, {
    slotCount: Object.keys(skinPlacements).length,
  });

  const totalMs = Math.round(performance.now() - t0);
  log('done', `换肤完成，总耗时 ${totalMs}ms`, { totalMs });

  return {
    newAtlasCanvas: repackResult.canvas,
    newAtlasText: repackResult.atlasText,
    newSpineJson,
    layout,
    stats: { totalMs, regionCount: regions.length, packedCount: Object.keys(repackResult.placements).length, slotCount: Object.keys(skinPlacements).length, editImageMs, reusedGeneratedImage, method, segMethod },
  };
}

// ===== Per-slot 局部重绘 =====

const SLOT_PROMPT = (prompt) => `Redraw this single character body part in the new style: "${prompt}".
CRITICAL CONSTRAINTS: keep the EXACT same silhouette/outline/shape; transparent background; match input dimensions exactly; no text/labels.`;
const SLOT_NEGATIVE = 'do not change the silhouette; do not add background scenery; do not crop the part; do not render any text.';

/**
 * Per-slot 局部重绘（对译 server.py inpaint_slot）。
 *
 * 只重绘一个 slot 的 region，用原 alpha 当 mask（不跑 SAM），保证 silhouette 不变。
 *
 * @param {Object} input
 * @param {string} input.slot slot 名
 * @param {string} input.skinName 当前皮肤名（用于读取已有 region）
 * @param {string} input.prompt 重绘描述
 * @param {HTMLCanvasElement} input.regionCanvas 该 slot 当前 region 的 PNG（canvas）
 * @param {object} input.spineJson 当前 spine JSON
 * @param {Array} input.regions 原 atlas 的 region 列表
 * @param {HTMLCanvasElement} input.atlasSheet 原 atlas sheet（供其他 region 占位）
 * @param {Object} [opts] 同 runReskin 的 opts（workflowId/model/size/erode/onLog）
 * @returns {Promise<Object>} { newAtlasCanvas, newAtlasText, newSpineJson, stats }
 */
export async function runInpaintSlot(input, opts = {}) {
  const { slot, skinName, prompt, regionCanvas, spineJson, regions, atlasSheet } = input;
  const {
    workflowId, model = 'gpt-image-1', size = '2k', onLog = () => {},
  } = opts;
  const log = (step, msg, data) => { try { onLog(step, msg, data); } catch { /* ignore */ } };
  const t0 = performance.now();

  const region2slot = regionToSlotMap(spineJson);
  const slot2region = {};
  for (const [r, s] of Object.entries(region2slot)) slot2region[s] = r;
  const targetRegionName = slot2region[slot];
  if (!targetRegionName) throw new Error(`slot "${slot}" 无对应 region`);

  log('inpaint', `开始局部重绘：${slot}（region: ${targetRegionName}）`);

  // ① 上传 region → edit_image workflow 重绘（锁 silhouette）
  const regionUrl = await uploadDataUrl(regionCanvas.toDataURL('image/png'), `slot-${slot}-${Date.now()}.png`);
  const { url: reskinnedUrl } = await workflowRedraw(
    regionUrl,
    SLOT_PROMPT(prompt),
    {
      workflowId,
      model,
      size,
      aspect: closestEditAspect(regionCanvas.width, regionCanvas.height),
    },
    log,
  );

  // ② 下载 → rembg 清背景（不跑 SAM，只去背景）
  log('inpaint', '清理背景…');
  let maskedImg = await loadImage(await urlToDataUrl(reskinnedUrl));
  try {
    const rembgResult = await callPlugin(REMBG_PLUGIN, 'rembg_remove', { image: reskinnedUrl });
    const cleanUrl = rembgResult?.data?.imageUrl || rembgResult?.imageUrl;
    if (cleanUrl) maskedImg = await loadImage(await urlToDataUrl(cleanUrl));
  } catch (err) {
    log('inpaint', `rembg 清背景失败，用原图: ${err?.message || err}`, { error: true });
  }
  // 转为 canvas 并对齐尺寸，后续 erodeAlpha 只接受 canvas。
  const rw = regionCanvas.width, rh = regionCanvas.height;
  maskedImg = drawToCanvas(maskedImg, rw, rh);
  const px = pickErodePx(Math.max(rw, rh), opts);
  if (px > 0) maskedImg = erodeAlpha(maskedImg, px);

  // ③ 收集所有 region（目标 slot 用新图，其余用原 atlas sheet 裁出）
  log('inpaint', '组装新 atlas…');
  const regionParts = {};
  for (const region of regions) {
    if (region.name === targetRegionName) {
      regionParts[region.name] = { img: maskedImg, width: rw, height: rh };
    } else {
      const c = cropRegionRotated(atlasSheet, region.x, region.y, region.w, region.h, region.rotate);
      regionParts[region.name] = { img: c, width: region.w, height: region.h };
    }
  }

  // ④ repack + skin_writer
  const repackResult = await repackAtlas(regionParts, skinName, 2);
  const skinPlacements = {};
  const attachmentNames = {};
  for (const [origRegion] of Object.entries(regionParts)) {
    const s = region2slot[origRegion];
    if (!s) continue;
    const safe = safeFilename(origRegion);
    const placement = repackResult.placements[safe];
    if (!placement) continue;
    skinPlacements[s] = placement;
    attachmentNames[s] = safe;
  }
  const newSpineJson = addSkin(spineJson, skinName, skinPlacements, { attachmentNames });
  const totalMs = Math.round(performance.now() - t0);
  log('inpaint', `局部重绘完成（${totalMs}ms）`, { totalMs });

  return {
    newAtlasCanvas: repackResult.canvas,
    newAtlasText: repackResult.atlasText,
    newSpineJson,
    stats: { totalMs, slot, region: targetRegionName },
  };
}

export { ATLAS_RESKIN_PROMPT, ATLAS_RESKIN_NEGATIVE, EXPLODED_RESKIN_PROMPT, EXPLODED_RESKIN_NEGATIVE };
