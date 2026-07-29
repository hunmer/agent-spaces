/**
 * AI 换肤 pipeline 串联（对译 app/backend/reskin/pipeline.py + atlas_rebake.rebake_skin）。
 *
 * 全流程：
 *   ① 取素材：snapshot + 原 atlas sheet + 原 .atlas 文本 + spine JSON
 *   ② 合成 composite [snapshot | atlas]
 *   ③ nano-banana (Gemini) 重绘 composite
 *   ④ 逐 region：裁出 → rembg SAM 抠图 → 收集
 *   ⑤ repack 打包成新 atlas sheet
 *   ⑥ skin_writer 写新 spine JSON
 *   ⑦ 返回 { newAtlasCanvas, newAtlasText, newSpineJson, layout, stats }
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
  loadImage, createCanvas, cropRegionRotated, erodeAlpha, canvasToBlob,
} from './canvasUtils';

const NANO_BANANA_PLUGIN = 'workflow.nano-banana';
const REMBG_PLUGIN = 'workflow.rembg';

/** 工具函数：等待并解包 callPluginTool 结果 */
async function callPlugin(pluginId, toolName, args) {
  const AS = window.AgentSpaces;
  if (!AS?.callPluginTool) throw new Error('宿主 callPluginTool 不可用');
  const ret = await AS.callPluginTool(pluginId, toolName, args);
  // 解包：{ success, result } → result；否则直接用 ret
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
  return uploaded?.url || uploaded?.httpPath;
}

/**
 * 执行完整换肤 pipeline。
 *
 * @param {Object} input 输入素材
 * @param {HTMLCanvasElement|string} input.snapshot 角色截图（canvas 或 dataUrl）
 * @param {string} input.atlasSheetUrl 原 atlas sheet PNG 的 http URL
 * @param {string} input.atlasText 原 .atlas 文件文本
 * @param {object} input.spineJson 原 Spine JSON 对象
 * @param {string} input.skinName 新皮肤名
 * @param {string} input.prompt 用户换肤描述
 * @param {Object} [opts]
 * @param {string} [opts.nanoApiKey] nano-banana apiKey（不传则用插件配置默认值）
 * @param {string} [opts.nanoModel] Gemini 模型（默认 gemini-2.5-flash-image-preview）
 * @param {string} [opts.imageSize] 输出尺寸 auto/1K/2K/4K
 * @param {boolean} [opts.erode] 是否侵蚀去白边（默认 false，MVP 关闭）
 * @param {number} [opts.erodePx] 侵蚀半径（默认按 region 边长缩放）
 * @param {(step:string, msg:string, data?:object) => void} [opts.onLog] 日志回调
 * @returns {Promise<Object>} { newAtlasCanvas, newAtlasText, newSpineJson, layout, stats }
 */
export async function runReskin(input, opts = {}) {
  const {
    snapshot, atlasSheetUrl, atlasText, spineJson, skinName, prompt,
  } = input;
  const {
    nanoApiKey, nanoModel = 'gemini-2.5-flash-image-preview',
    imageSize = 'auto', erode = false, onLog = () => {},
  } = opts;

  const log = (step, msg, data) => {
    try { onLog(step, msg, data); } catch { /* 忽略回调错误 */ }
  };
  const t0 = performance.now();

  // ① 解析原 atlas，拿 region 列表
  log('parse', '解析原 atlas…');
  const atlas = parseAtlas(atlasText);
  const regions = atlas.regions;
  if (!regions.length) throw new Error('原 atlas 无 region，无法换肤');
  log('parse', `原 atlas: ${atlas.sheetW}×${atlas.sheetH}，${regions.length} 个 region`, {
    sheetW: atlas.sheetW, sheetH: atlas.sheetH, regionCount: regions.length,
  });

  // ② 加载 snapshot + atlas sheet，合成 composite
  log('compose', '加载素材并合成 composite…');
  const snapImg = snapshot instanceof HTMLCanvasElement ? snapshot : await loadImage(snapshot);
  const atlasSheetImg = await loadImage(atlasSheetUrl);
  const { canvas: compositeCanvas, layout } = buildAtlasComposite(snapImg, atlasSheetImg);
  log('compose', `composite 合成完成: ${layout.compositeW}×${layout.compositeH}`, { layout });

  // ③ 上传 composite → nano-banana 重绘
  log('upload', '上传 composite 到宿主…');
  const compositeUrl = await uploadDataUrl(compositeCanvas.toDataURL('image/png'), `composite-${skinName}-${Date.now()}.png`);
  log('upload', 'composite 已上传', { url: compositeUrl });

  const fullPrompt = ATLAS_RESKIN_PROMPT.replace('{user_prompt}', prompt);
  log('gemini', `调用 Gemini 重绘（${nanoModel}）…`);
  const geminiT0 = performance.now();
  const editArgs = {
    image: compositeUrl,
    prompt: fullPrompt,
    model: nanoModel,
    responseModalities: 'image',
  };
  if (nanoApiKey) editArgs.apiKey = nanoApiKey;
  if (imageSize && imageSize !== 'auto') editArgs.imageSize = imageSize;

  const editResult = await callPlugin(NANO_BANANA_PLUGIN, 'nano_banana_edit_image', editArgs);
  const reskinnedUrl = editResult?.data?.images?.[0] || editResult?.images?.[0];
  if (!reskinnedUrl) throw new Error('Gemini 未返回重绘结果图');
  const geminiMs = Math.round(performance.now() - geminiT0);
  log('gemini', `Gemini 重绘完成（${geminiMs}ms）`, { url: reskinnedUrl, durationMs: geminiMs });

  // ④ 下载重绘图，裁 atlas 半边，resize 对齐原 sheet
  log('split', '裁取 atlas 半边…');
  const reskinnedImg = await loadImage(await urlToDataUrl(reskinnedUrl));
  const atlasHalf = cropAtlasHalf(reskinnedImg, layout, atlas.sheetW, atlas.sheetH);
  log('split', `atlas 半边已裁齐: ${atlasHalf.width}×${atlasHalf.height}`);

  // ⑤ 逐 region：裁出 → rembg SAM 抠图 → 收集
  log('segment', `开始逐 region 分割（共 ${regions.length} 个）…`);
  const regionParts = {};       // region 名 → {img, width, height}
  const regionSafeMap = {};     // sanitized 名 → 原始 region 名
  let segDone = 0;
  for (const region of regions) {
    const safe = safeFilename(region.name);
    regionSafeMap[safe] = region.name;
    // 按 bbox+rotate 裁出 region
    const regionCanvas = cropRegionRotated(
      atlasHalf, region.x, region.y, region.w, region.h, region.rotate,
    );
    // 上传 region → rembg SAM 抠图
    try {
      const regionUrl = await uploadDataUrl(
        regionCanvas.toDataURL('image/png'),
        `region-${safe}-${Date.now()}.png`,
      );
      // SAM point prompt：bbox 中心，label=1（前景）
      const cx = Math.round(region.w / 2);
      const cy = Math.round(region.h / 2);
      const samResult = await callPlugin(REMBG_PLUGIN, 'rembg_sam_segment', {
        image: regionUrl,
        extras: { sam_prompt: [{ type: 'point', data: [cx, cy], label: 1 }] },
      });
      const maskedUrl = samResult?.data?.imageUrl || samResult?.imageUrl;
      if (!maskedUrl) throw new Error('rembg 未返回抠图结果');
      let maskedImg = await loadImage(await urlToDataUrl(maskedUrl));
      // 尺寸对齐（rembg 可能改变尺寸）
      if (maskedImg.width !== region.w || maskedImg.height !== region.h) {
        const tmp = createCanvas(region.w, region.h);
        tmp.getContext('2d').drawImage(maskedImg, 0, 0, region.w, region.h);
        maskedImg = tmp;
      }
      // 可选侵蚀去白边
      if (erode) {
        const side = Math.max(region.w, region.h);
        const px = opts.erodePx ?? Math.max(1, Math.round(side / 60));
        maskedImg = erodeAlpha(maskedImg, px);
      }
      regionParts[region.name] = { img: maskedImg, width: region.w, height: region.h };
    } catch (err) {
      // 单 region 抠图失败 → 降级用原始裁切（不抠图），不阻塞整体
      log('segment', `region "${region.name}" 抠图失败，降级用原始裁切: ${err?.message || err}`, { region: region.name, error: true });
      regionParts[region.name] = { img: regionCanvas, width: region.w, height: region.h };
    }
    segDone += 1;
    log('segment', `分割进度 ${segDone}/${regions.length}`, { done: segDone, total: regions.length });
  }
  log('segment', `分割完成，成功 ${Object.keys(regionParts).length}/${regions.length} 个 region`);

  // ⑥ repack 打包成新 atlas sheet
  log('repack', '打包新 atlas sheet…');
  const atlasBaseName = skinName;
  const repackResult = await repackAtlas(regionParts, atlasBaseName, 2);
  log('repack', `新 atlas 打包完成: ${repackResult.sheetW}×${repackResult.sheetH}，${Object.keys(repackResult.placements).length} region`, {
    sheetW: repackResult.sheetW, sheetH: repackResult.sheetH,
  });

  // ⑦ skin_writer 写新 spine JSON
  log('skin', '生成新 spine JSON（含新 skin）…');
  // 构建 slot → placement / attachmentNames 映射
  const region2slot = regionToSlotMap(spineJson);
  const skinPlacements = {};
  const attachmentNames = {};
  for (const [origRegion, part] of Object.entries(regionParts)) {
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
    stats: {
      totalMs,
      regionCount: regions.length,
      packedCount: Object.keys(repackResult.placements).length,
      slotCount: Object.keys(skinPlacements).length,
      geminiMs,
    },
  };
}

export { ATLAS_RESKIN_PROMPT, ATLAS_RESKIN_NEGATIVE };
