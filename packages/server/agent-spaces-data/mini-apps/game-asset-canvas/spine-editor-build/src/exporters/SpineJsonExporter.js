/**
 * Spine JSON 导出器：从 pixi-spine 运行时实例反向提取最小 spine JSON。
 *
 * pixi-spine 不支持 .skel→.json 导出，但换肤只需 skins 段标量字段。
 * 从 Skin.getAttachments() 提取 default skin 的 attachment 标量字段，
 * 构造 skinWriter.addSkin / regionToSlotMap 可消费的最小 JSON。
 *
 * 避开循环引用：只读标量字段，不读 region/atlas 对象。
 */

const ATTACH_FIELDS = [
  'x', 'y', 'width', 'height', 'rotation',
  'scaleX', 'scaleY',
  'path', 'color', 'offsetX', 'offsetY',
];

function colorToHex(c) {
  if (!c) return undefined;
  if (typeof c === 'string') return c;
  const to255 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  const hex = (n) => n.toString(16).padStart(2, '0');
  const r = to255(c.r ?? 1), g = to255(c.g ?? 1), b = to255(c.b ?? 1), a = to255(c.a ?? 1);
  return `${hex(r)}${hex(g)}${hex(b)}${hex(a)}`;
}

function attachmentType(att) {
  const ctor = att?.constructor?.name || '';
  if (/Region/i.test(ctor)) return 'region';
  if (/Mesh/i.test(ctor)) return 'mesh';
  if (/Path/i.test(ctor)) return 'path';
  if (/Point/i.test(ctor)) return 'point';
  if (/Clipping/i.test(ctor)) return 'clipping';
  return 'region';
}

function skinToJsonAttachments(skin, slotDataList) {
  const out = {};
  if (!skin?.getAttachments) return out;
  for (const entry of skin.getAttachments()) {
    const slotName = slotDataList?.[entry.slotIndex]?.name;
    if (!slotName) continue;
    const att = entry.attachment;
    if (!att) continue;
    const meta = { type: attachmentType(att) };
    const regionName = att.path || att.name || entry.name;
    if (regionName) meta.name = regionName;
    for (const k of ATTACH_FIELDS) {
      let v = att[k];
      if (v == null) continue;
      if (k === 'color') {
        v = colorToHex(v);
        if (!v) continue;
      }
      meta[k] = v;
    }
    out[slotName] = { [entry.name]: meta };
  }
  return out;
}

export class SpineJsonExporter {
  /**
   * 从 Spine 实例导出最小 spine JSON（含 default skin + 所有 skin）。
   * @param {object} spine pixi-spine Spine 实例
   * @returns {object|null} 最小 spine JSON
   */
  static export(spine) {
    const data = spine?.spineData;
    if (!data) return null;
    const slots = data.slots || [];
    const skinsRoot = {};
    for (const skin of (data.skins || [])) {
      if (!skin?.name) continue;
      skinsRoot[skin.name] = skinToJsonAttachments(skin, slots);
    }
    if (data.defaultSkin?.name && !skinsRoot[data.defaultSkin.name]) {
      skinsRoot[data.defaultSkin.name] = skinToJsonAttachments(data.defaultSkin, slots);
    }
    return {
      skeleton: { hash: data.hash || '', spine: data.version || '3.8' },
      bones: (data.bones || []).map((b) => ({ name: b.name })),
      slots: slots.map((s) => ({ name: s.name, bone: s.bone?.name || '', attachment: s.attachmentName || null })),
      skins: skinsRoot,
    };
  }
}
