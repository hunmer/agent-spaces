/**
 * 往 Spine JSON 加一个新 skin（对译 app/backend/spine/skin_writer.py:add_skin）。
 *
 * 关键约束：
 *  - bones / animations / IK / 已有 skin 绝不改动，只增广 skins 段
 *  - 新 skin 的 attachment 继承 default skin 的全部非区域字段（rotation/scale/color/path...）
 *  - width/height 仅在 default 没有时用 placement 填充（避免 trimmed region 渲染偏心）
 *  - attachment name = region 名（slot 名含特殊字符被 sanitize 时需 nameMap 映射）
 *  - 兼容 Spine 3.8（dict skins）和 4.0（array skins），原样写回
 */

/** 在 skins 根里取某 slot 在 sourceSkin 的 attachment meta（用于继承字段） */
function _attachmentMeta(skinsRoot, slot, sourceSkin = 'default') {
  let atts;
  if (Array.isArray(skinsRoot)) {
    const skinObj = skinsRoot.find((s) => s && s.name === sourceSkin);
    atts = (skinObj || {}).attachments || {};
  } else {
    atts = (skinsRoot || {})[sourceSkin] || {};
  }
  const slotAtts = atts[slot];
  if (!slotAtts) return null;
  return Object.values(slotAtts)[0] || null;
}

/**
 * 返回 spineJson 的深拷贝，skins[skinName] 已填入新 attachment。
 *
 * @param {object} spineJson 原始 Spine JSON
 * @param {string} skinName 新皮肤名
 * @param {Object<string,{x:number,y:number,w:number,h:number}>} placements slot → 新 region 偏移/尺寸
 * @param {Object} [opts]
 * @param {string} [opts.sourceSkin='default'] 继承源 skin
 * @param {boolean} [opts.overwrite=true] 同名 skin 是否覆盖
 * @param {Object<string,string>} [opts.attachmentNames] slot → atlas region 名（sanitize 后）
 * @returns {object} 新的 Spine JSON（深拷贝，不改原）
 */
export function addSkin(spineJson, skinName, placements, opts = {}) {
  const { sourceSkin = 'default', overwrite = true, attachmentNames = {} } = opts;
  const out = structuredClone(spineJson);
  let skins = out.skins;

  const newSkinAtts = {};
  for (const [slotName, placement] of Object.entries(placements)) {
    const existing = _attachmentMeta(skins, slotName, sourceSkin) || {};
    const meta = { ...existing };
    // width/height 仅在 default 没有时填（保留未裁剪尺寸，防渲染偏心）
    if (meta.width == null) meta.width = placement.w;
    if (meta.height == null) meta.height = placement.h;
    // region 名（slot 名被 sanitize 时需映射）
    meta.name = attachmentNames[slotName] ?? slotName;
    const attKey = slotName;
    newSkinAtts[slotName] = { [attKey]: meta };
  }

  const newEntry = { name: skinName, attachments: newSkinAtts };

  if (Array.isArray(skins)) {
    if (overwrite) skins = skins.filter((s) => s && s.name !== skinName);
    skins.push(newEntry);
    out.skins = skins;
  } else if (skins && typeof skins === 'object') {
    if (overwrite || !(skinName in skins)) skins[skinName] = newSkinAtts;
    out.skins = skins;
  } else {
    // 无 skins 块 → 创建 array 形式（Spine 4.x 默认）
    out.skins = [{ name: 'default', attachments: {} }, newEntry];
  }
  return out;
}

/**
 * 取 default skin 里 slot → region 名的映射（用于反向查 region 对应哪个 slot）。
 * 对译 atlas_rebake._region_for_slot 的逆向。
 *
 * @param {object} spineJson
 * @returns {Object<string,string>} region 名 → slot 名
 */
export function regionToSlotMap(spineJson) {
  const skins = spineJson.skins;
  let atts;
  if (Array.isArray(skins)) {
    const def = skins.find((s) => s && s.name === 'default');
    atts = (def || {}).attachments || {};
  } else {
    atts = (skins || {}).default || {};
  }
  const out = {};
  for (const [slotName, slotAtts] of Object.entries(atts)) {
    if (!slotAtts) continue;
    const [attKey, attMeta] = Object.entries(slotAtts)[0];
    const region = (attMeta && attMeta.name) ? attMeta.name : attKey;
    if (!(region in out)) out[region] = slotName;
  }
  return out;
}
