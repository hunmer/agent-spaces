/**
 * 从 pixi-spine 运行时 Spine 实例反向提取「最小 spine JSON」。
 *
 * pixi-spine 不支持 .skel→.json 导出（运行时只有 readSkeletonData）。
 * 但换肤 pipeline 只需要 skins 段的标量字段（name/x/y/w/h/rotation/scale/color），
 * 故从已加载的 spine 实例的 Skin.getAttachments() 反向构造一个含 default skin 的最小 JSON。
 *
 * 避开循环引用：只读 attachment 的标量字段，不读 region/atlas 对象。
 *
 * 产出格式对齐 skinWriter.addSkin / regionToSlotMap 的期望：
 *   { skins: { default: { <slotName>: { <attName>: { name, x, y, ... } } } } }
 *   （3.8 dict 形式；skinWriter 已兼容 dict/array 两种）
 */

// Attachment 标量字段白名单（驼峰，与 pixi-spine 运行时一致）
const ATTACH_FIELDS = [
  'x', 'y', 'width', 'height', 'rotation',
  'scaleX', 'scaleY',
  'path', 'color', 'type',
  'offsetX', 'offsetY',
];

/** Color 实例 → "r,g,b,a" 或 hex 字符串（3.8 JSON 里 color 是 rgba 8 位 hex） */
function colorToHex(c) {
  if (!c) return undefined;
  // pixi-spine Color: { r, g, b, a } 为 0..1 浮点
  if (typeof c === 'string') return c;
  const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const hex = (n) => n.toString(16).padStart(2, '0');
  const r = to255(c.r ?? 1), g = to255(c.g ?? 1), b = to255(c.b ?? 1), a = to255(c.a ?? 1);
  return `${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

/** attachment 类 → Spine JSON type 名 */
function attachmentType(att) {
  const ctor = att?.constructor?.name || '';
  if (/Region/i.test(ctor)) return 'region';
  if (/Mesh/i.test(ctor)) return 'mesh';
  if (/Path/i.test(ctor)) return 'path';
  if (/Point/i.test(ctor)) return 'point';
  if (/Clipping/i.test(ctor)) return 'clipping';
  return 'region'; // 默认
}

/**
 * 提取单个 skin 为 JSON attachments 结构。
 * @param {object} skin pixi-spine Skin 实例（必须含 getAttachments()）
 * @param {Array} slotDataList spineData.slots（用于 slotIndex → slotName）
 * @returns {Object} { <slotName>: { <attName>: { name, x, y, ... } } }
 */
function skinToJsonAttachments(skin, slotDataList) {
  const out = {};
  if (!skin?.getAttachments) return out;
  const entries = skin.getAttachments();
  for (const entry of entries) {
    const slotName = slotDataList?.[entry.slotIndex]?.name;
    if (!slotName) continue;
    const att = entry.attachment;
    if (!att) continue;
    const meta = {};
    // region 名：优先 path，回退 name
    const regionName = att.path || att.name || entry.name;
    if (regionName) meta.name = regionName;
    meta.type = attachmentType(att);
    // 拷贝标量字段（避开对象引用，防循环）
    for (const k of ATTACH_FIELDS) {
      if (k === 'type') continue;
      let v = att[k];
      if (v == null) continue;
      if (k === 'color') {
        v = colorToHex(v);
        if (!v) continue;
      }
      meta[k] = v;
    }
    // entry.name 是 attachment 在 skin 字典里的 key
    out[slotName] = { [entry.name]: meta };
  }
  return out;
}

/**
 * 从 Spine 实例构造最小 spine JSON（含 default skin + 所有 skin）。
 *
 * @param {object} spine pixi-spine Spine 实例（含 spineData）
 * @returns {object} 最小 spine JSON，可喂给 skinWriter.addSkin / regionToSlotMap
 */
export function spineDataToJson(spine) {
  const data = spine?.spineData || spine; // 兼容直接传 spineData
  if (!data) throw new Error('spineDataToJson: 无 spineData');

  const slots = data.slots || [];
  const skinsRoot = {};

  // 遍历所有 skin（通常只有 default）
  const skins = data.skins || [];
  for (const skin of skins) {
    if (!skin?.name) continue;
    skinsRoot[skin.name] = skinToJsonAttachments(skin, slots);
  }
  // defaultSkin 兜底（pixi-spine 有时 skins 数组不含 default 但 defaultSkin 有值）
  if (data.defaultSkin?.name && !skinsRoot[data.defaultSkin.name]) {
    skinsRoot[data.defaultSkin.name] = skinToJsonAttachments(data.defaultSkin, slots);
  }

  // 构造最小骨架 JSON（bones/slots 只放 name，skins 是核心）
  return {
    skeleton: { hash: data.hash || '', spine: data.version || '3.8' },
    bones: (data.bones || []).map((b) => ({ name: b.name })),
    slots: slots.map((s) => ({ name: s.name, bone: s.bone?.name || '', attachment: s.attachmentName || null })),
    skins: skinsRoot,
  };
}

export default spineDataToJson;
