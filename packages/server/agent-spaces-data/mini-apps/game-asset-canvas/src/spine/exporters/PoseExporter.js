/**
 * mini-app 姿势导出器：导出当前所有骨骼的本地变换 JSON。
 *
 * 输出格式：
 * {
 *   version: "1.0",
 *   skeletonName: "...",
 *   spineVersion: "3.8" | "4.0",
 *   pose: [
 *     { name, index, x, y, rotation(deg), scaleX, scaleY }
 *   ]
 * }
 *
 * rotation 转成度数（Spine 编辑器习惯用度）。
 */
export class PoseExporter {
  static export(spine) {
    if (!spine?.skeleton) return null;
    const bones = spine.skeleton.bones;
    const pose = bones.map((b, i) => ({
      name: b.data.name,
      index: i,
      x: round(b.x),
      y: round(b.y),
      rotation: round((b.rotation * 180) / Math.PI),
      scaleX: round(b.scaleX),
      scaleY: round(b.scaleY),
    }));
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      skeletonName: spine.name || 'unknown',
      spineVersion: spine._spineVersion || 'unknown',
      boneCount: bones.length,
      pose,
    };
  }

  static toJson(spine) {
    const data = PoseExporter.export(spine);
    return JSON.stringify(data, null, 2);
  }
}

function round(v, p = 4) {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
}

export default PoseExporter;
