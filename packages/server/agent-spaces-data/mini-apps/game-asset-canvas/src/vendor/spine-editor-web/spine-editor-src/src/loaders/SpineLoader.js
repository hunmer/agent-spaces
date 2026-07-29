/**
 * Spine 资源加载器。
 *
 * 复刻参考仓库 Spine-Viewer-Web 的 UploadAssets.loadAssets 逻辑，并扩展：
 * 1. 同时支持 .skel（二进制）和 .json（文本）两种骨架格式
 * 2. 通过 @pixi-spine/all-4.0 同时提供 3.8 和 4.0 运行时（单一包内含两个 runtime）
 * 3. 输入支持 base64 dataUrl（从父 iframe 注入）或同源 URL（角色库内置资源）
 *
 * @pixi-spine/all-4.0 导出：
 *   - SkeletonBinary (自动识别 3.8/4.0 版本)
 *   - SkeletonJson
 *   - TextureAtlas, AtlasAttachmentLoader
 *   - Spine (渲染类)
 */
import * as PIXI from 'pixi.js';
import {
  Spine, SkeletonBinary, SkeletonJson,
  TextureAtlas, AtlasAttachmentLoader,
} from '@pixi-spine/all-4.0';

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

export default { loadSpine, getAnimations, getSkins, getBoneTree };
