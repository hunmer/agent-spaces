/**
 * mini-app 坐标转换工具：Spine 坐标系 ↔ Pixi 坐标系。
 *
 * Spine 坐标系：原点在角色 root，Y 轴**向上**为正（数学坐标系）。
 * Pixi 坐标系：原点在 stage 左上角，Y 轴**向下**为正（屏幕坐标系）。
 *
 * 转换核心：Y 轴翻转。Pixi 中 spine 对象通常 y = 画布高度（脚踩地），
 * 骨骼 worldX/worldY 是相对 spine 容器本地坐标（已含容器 transform）。
 * 本工具处理 spine 容器内的局部坐标转换。
 */
export class CoordinateUtils {
  /**
   * Spine 世界坐标 → Pixi 局部坐标（用于在 spine 容器内绘制 gizmo）。
   * 由于 pixi-spine 内部已把骨骼 worldTransform 转成 Pixi 坐标（Y 向下），
   * 实际上 bone.worldX / bone.worldY 已是 Pixi 系，无需额外翻转。
   * 这里保留方法以便后续若有翻转需求时统一入口。
   */
  static spineWorldToContainer(bone) {
    return { x: bone.worldX, y: bone.worldY };
  }

  /**
   * Pixi 局部坐标（容器内）→ Spine 骨骼本地坐标。
   * 把鼠标在 spine 容器内的坐标转成骨骼的本地 x/y（用于拖拽设置 bone.x/bone.y）。
   * 需要把容器坐标先转到骨骼父节点的坐标系，再求相对于父的偏移。
   *
   * @param {object} bone 目标骨骼
   * @param {number} containerX 鼠标在 spine 容器内的 x
   * @param {number} containerY 鼠标在 spine 容器内的 y
   * @returns {{x: number, y: number}} 骨骼本地坐标（可直接赋给 bone.x/bone.y）
   */
  static containerToBoneLocal(bone, containerX, containerY) {
    // 骨骼父节点的世界变换（若为 root 则用单位矩阵）
    const parent = bone.parent;
    if (!parent) {
      // root 骨骼：本地坐标 = 世界坐标（相对 spine 容器）
      return { x: containerX, y: containerY };
    }
    // 把容器坐标转到父骨骼的本地坐标系。
    // pixi-spine bone 没有直接的 worldToLocal，用 parent.appliedValid 判断，
    // 这里用 parent 的 worldTransform 求逆。
    const wt = parent.worldTransform;
    // PIXI.Matrix: a b c d tx ty，逆变换
    return CoordinateUtils.inverseTransformPoint(wt, containerX, containerY);
  }

  /**
   * PIXI Matrix 逆变换求点。PIXI.Matrix 字段: {a, b, c, d, tx, ty}
   * 矩阵: | a c tx |   逆: | d -c (c*ty - d*tx) | / det
   *       | b d ty |       | -b a (b*tx - a*ty) |
   *       | 0 0 1  |       | 0  0  det           |
   */
  static inverseTransformPoint(wt, x, y) {
    const a = wt.a, b = wt.b, c = wt.c, d = wt.d, tx = wt.tx, ty = wt.ty;
    const det = a * d - c * b;
    if (Math.abs(det) < 1e-6) return { x: x - tx, y: y - ty };
    const invDet = 1 / det;
    // 平移先减
    const px = x - tx;
    const py = y - ty;
    // 旋转+缩放逆
    return {
      x: (d * px - c * py) * invDet,
      y: (-b * px + a * py) * invDet,
    };
  }

  /**
   * 计算从 bone 尾端指向父骨骼的方向角（Pixi 系，度数），
   * 用于右键旋转时由鼠标位置反推 rotation。
   * @param {object} bone
   * @param {number} containerX 鼠标在容器的 x
   * @param {number} containerY 鼠标在容器的 y
   * @returns {number} 目标 rotation（度，已转为 Spine 习惯：顺时针为正）
   */
  static angleFromParent(bone, containerX, containerY) {
    const parent = bone.parent;
    const px = parent ? parent.worldX : 0;
    const py = parent ? parent.worldY : 0;
    // Pixi 系 Y 向下，atan2(dy, dx) 得到弧度（顺时针为正在 Pixi 系）
    const rad = Math.atan2(containerY - py, containerX - px);
    // Spine rotation 也是顺时针为正（度），与 Pixi 一致
    return (rad * 180) / Math.PI;
  }
}

export default CoordinateUtils;
