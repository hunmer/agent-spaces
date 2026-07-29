/**
 * Spine 资源加载器。
 *
 * 使用 @pixi-spine/all-3.8（与参考仓库 Spine-Viewer-Web 完全一致），
 * 支持 Spine 3.8 格式（覆盖碧蓝航线角色库及大量老游戏资源）。
 *
 * 注意：@pixi-spine 的 3.8 和 4.0 loader 导出同名 class（SkeletonBinary 等），
 * 不能同时 import（命名冲突）。如需 4.0 支持，需在此按 .skel 版本路由到独立包。
 * 当前内置角色库数据（碧蓝航线）全部为 3.8 格式，故用 all-3.8。
 *
 * 复刻参考仓库 UploadAssets.loadAssets 逻辑，扩展：
 * 1. 同时支持 .skel（二进制）和 .json（文本）两种骨架格式
 * 2. 输入支持 base64 dataUrl（从父 iframe 注入）或同源 URL（角色库内置资源）
 *
 * @pixi-spine/all-3.8 导出：
 *   - SkeletonBinary (解析 3.8 二进制)
 *   - SkeletonJson (解析 3.8 JSON)
 *   - TextureAtlas, AtlasAttachmentLoader
 *   - Spine (渲染类)
 */
import { PIXI, getSpineRuntime } from '../runtime.js';

/**
 * 把 base64 dataUrl 转成 ArrayBuffer（用于 .skel 二进制解析）。
 */
async function dataUrlToArrayBuffer(dataUrl) {
  const resp = await fetch(dataUrl);
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * 把 base64 dataUrl 转成文本（用于 .atlas / .json 文本解析）。
 */
async function dataUrlToText(dataUrl) {
  const resp = await fetch(dataUrl);
  return await resp.text();
}

/**
 * 加载 Spine 资源并构造 Spine 实例。
 *
 * @param {object} input
 * @param {string|ArrayBuffer} input.skel .skel 二进制（dataUrl 或 ArrayBuffer）
 * @param {string} input.atlas .atlas 文本（dataUrl 或原文）
 * @param {string} input.png .png 贴图（dataUrl 或 URL）
 * @param {string} [input.name] 资源名（仅用于日志）
 * @returns {Promise<Spine>} spine 实例
 * @throws {Error} 版本不匹配 / 文件缺失 / 解析失败
 */
export async function loadSpine({ skel, atlas, png, name = 'spine' }) {
  const {
    Spine, SkeletonBinary, SkeletonJson,
    TextureAtlas, AtlasAttachmentLoader,
  } = getSpineRuntime();
  // 1. 准备数据
  let skelBytes;
  let atlasText;
  let isJson = false;

  if (skel instanceof ArrayBuffer || skel instanceof Uint8Array) {
    skelBytes = skel instanceof Uint8Array ? skel : new Uint8Array(skel);
  } else if (typeof skel === 'string') {
    if (skel.startsWith('data:')) {
      // dataUrl：可能是 .skel（二进制）或 .json（文本）
      const text = await dataUrlToText(skel);
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        // JSON 骨架格式
        isJson = true;
        skelBytes = trimmed; // 保留原文给 SkeletonJson
      } else {
        skelBytes = await dataUrlToArrayBuffer(skel);
      }
    } else {
      // 原始文本（JSON）
      const trimmed = skel.trim();
      if (trimmed.startsWith('{')) {
        isJson = true;
        skelBytes = trimmed;
      } else {
        throw new Error('无法识别的骨架数据格式');
      }
    }
  } else {
    throw new Error('骨架数据格式不支持');
  }

  if (typeof atlas === 'string' && atlas.startsWith('data:')) {
    atlasText = await dataUrlToText(atlas);
  } else {
    atlasText = atlas;
  }

  // 2. 加载贴图（PIXI.BaseTexture.from 兼容 dataUrl 和 URL）
  const baseTexture = PIXI.BaseTexture.from(png);

  // 3. 解析 atlas
  const spineAtlas = new TextureAtlas(atlasText, (line, callback) => {
    callback(baseTexture);
  });
  const attachmentLoader = new AtlasAttachmentLoader(spineAtlas);

  // 4. 解析骨架（按格式选 parser，版本自动路由 3.8/4.0）
  let spineData;
  if (isJson) {
    const jsonParser = new SkeletonJson(attachmentLoader);
    spineData = jsonParser.readSkeletonData(skelBytes);
  } else {
    const binaryParser = new SkeletonBinary(attachmentLoader);
    spineData = binaryParser.readSkeletonData(skelBytes);
  }

  if (!spineData || !spineData.bones || spineData.bones.length === 0) {
    throw new Error('Spine 解析失败：无骨骼数据');
  }

  // 5. 构造 Spine 实例
  const spine = new Spine(spineData);
  spine.name = name;

  // 记录版本（用于 UI 提示）
  spine._spineVersion = spineData.version || 'unknown';

  // 挂载 atlas 资源引用，供热加载换肤（replaceAtlasTexture）使用。
  // baseTexture 是所有 region 的底层贴图；换 sheet 时改它的 resource 即可，UV/region 不动。
  spine._atlas = spineAtlas;
  spine._baseTexture = baseTexture;

  return spine;
}

/**
 * 获取角色的动画列表。
 */
export function getAnimations(spine) {
  if (!spine?.spineData?.animations) return [];
  return spine.spineData.animations.map((a) => a.name);
}

/**
 * 获取角色的皮肤列表。
 */
export function getSkins(spine) {
  if (!spine?.spineData?.skins) return [];
  return spine.spineData.skins.map((s) => s.name);
}

/**
 * 获取骨骼层级树（用于左侧骨骼树渲染）。
 * 返回 [{ bone, depth, children: [...] }]，root bones 在顶层。
 */
export function getBoneTree(spine) {
  if (!spine?.skeleton?.bones) return [];
  const all = spine.skeleton.bones;
  const byIndex = new Map();
  all.forEach((b, i) => byIndex.set(i, { bone: b, index: i, depth: 0, children: [] }));
  const roots = [];
  for (const node of byIndex.values()) {
    const parent = node.bone.parent;
    if (parent) {
      // 找父节点 index
      let parentIdx = -1;
      for (const [idx, n] of byIndex) {
        if (n.bone === parent) { parentIdx = idx; break; }
      }
      if (parentIdx >= 0) {
        const parentNode = byIndex.get(parentIdx);
        node.depth = parentNode.depth + 1;
        parentNode.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/**
 * 骨骼显隐管理。
 *
 * Spine 的骨骼（Bone）本身是变换节点，不直接绘制；绘制的是绑定到骨骼的 slot.attachment（mesh）。
 * 隐藏一根骨骼 = 把绑定到该骨骼（及其所有子孙骨骼）的 slot 的 attachment 临时置 null，
 * 恢复时从缓存还原。缓存 key 用 bone.data.name。
 *
 * _hiddenAttachments: Map<boneName, Array<{slot, attachment}>>
 */
export class BoneVisibility {
  constructor() {
    this.hidden = new Set(); // 已隐藏的骨骼名（含用户显式隐藏的根）
    this.saved = new Map();  // boneName -> [{slot, attachment}]
  }

  /** 收集某骨骼及其所有子孙骨骼 */
  _collectBones(bone, acc = []) {
    acc.push(bone);
    for (const child of bone.children || []) {
      this._collectBones(child, acc);
    }
    return acc;
  }

  /**
   * 隐藏一根骨骼（及其子级）相关的所有 slot attachment。
   * @param {object} spine Spine 实例
   * @param {object} bone 目标骨骼
   */
  hide(spine, bone) {
    if (!spine?.skeleton || !bone) return;
    const name = bone.data.name;
    if (this.hidden.has(name)) return;
    this.hidden.add(name);
    const bones = this._collectBones(bone);
    const boneSet = new Set(bones);
    const savedSlots = [];
    for (const slot of spine.skeleton.slots) {
      if (boneSet.has(slot.bone) && slot.attachment) {
        savedSlots.push({ slot, attachment: slot.attachment });
        slot.setAttachment(null);
      }
    }
    this.saved.set(name, savedSlots);
    spine.skeleton.updateWorldTransform();
  }

  /**
   * 显示一根骨骼（及其子级）相关的所有 slot attachment。
   */
  show(spine, bone) {
    if (!spine?.skeleton || !bone) return;
    const name = bone.data.name;
    if (!this.hidden.has(name)) return;
    this.hidden.delete(name);
    const savedSlots = this.saved.get(name) || [];
    for (const { slot, attachment } of savedSlots) {
      slot.setAttachment(attachment);
    }
    this.saved.delete(name);
    spine.skeleton.updateWorldTransform();
  }

  /** 切换显隐 */
  toggle(spine, bone) {
    const name = bone.data.name;
    if (this.hidden.has(name)) this.show(spine, bone);
    else this.hide(spine, bone);
  }

  /** 某骨骼是否已隐藏（含被祖先隐藏的间接情况） */
  isHidden(bone) {
    let cur = bone;
    while (cur) {
      if (this.hidden.has(cur.data.name)) return true;
      cur = cur.parent;
    }
    return false;
  }

  /** 重置所有显隐（恢复全部 attachment） */
  reset(spine) {
    for (const name of this.hidden) {
      const savedSlots = this.saved.get(name) || [];
      for (const { slot, attachment } of savedSlots) {
        slot.setAttachment(attachment);
      }
    }
    this.hidden.clear();
    this.saved.clear();
    if (spine?.skeleton) spine.skeleton.updateWorldTransform();
  }
}

export default { loadSpine, getAnimations, getSkins, getBoneTree, BoneVisibility };
