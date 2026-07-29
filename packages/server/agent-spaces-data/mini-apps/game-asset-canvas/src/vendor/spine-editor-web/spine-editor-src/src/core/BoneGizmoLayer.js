/**
 * 骨骼手柄层：在 Pixi stage 上叠加骨骼连线 + 关节圆点，处理拖拽交互。
 *
 * 用 PIXI.Graphics 绘制：
 *  - 每根骨骼从父节点画一条线到本节点
 *  - 每个关节画一个圆点（选中时高亮）
 *
 * 拖拽：
 *  - 左键拖圆点 → 修改 bone.x / bone.y（本地坐标）
 *  - 右键拖 → 修改 bone.rotation
 *  - 拖拽中实时 skeleton.updateWorldTransform() + 重绘 gizmo
 */
import * as PIXI from 'pixi.js';
import { CoordinateUtils } from './CoordinateUtils';

export class BoneGizmoLayer {
  /**
   * @param {object} opts
   * @param {PIXI.Container} opts.container spine 所在容器（gizmo 绘制在同一容器内，坐标系一致）
   * @param {Function} opts.onSelect 选中骨骼回调 (bone|null)
   * @param {Function} opts.onTransformStart 变换开始（push 撤销快照前）
   * @param {Function} opts.onTransformEnd 变换结束（push 撤销快照）
   * @param {Function} opts.onLiveTransform 拖拽中实时（刷新面板数值）
   */
  constructor({ container, onSelect, onTransformStart, onTransformEnd, onLiveTransform }) {
    this.container = container;
    this.onSelect = onSelect || (() => {});
    this.onTransformStart = onTransformStart || (() => {});
    this.onTransformEnd = onTransformEnd || (() => {});
    this.onLiveTransform = onLiveTransform || (() => {});

    this.graphics = new PIXI.Graphics();
    this.container.addChild(this.graphics);

    this.skeleton = null;       // spine.skeleton
    this.spine = null;          // Spine 实例
    this.selectedBone = null;
    this.visible = true;        // 骨骼线显隐

    // 拖拽状态
    this.dragging = false;
    this.dragMode = null;       // 'move' | 'rotate'
    this.dragBone = null;
    this.dragStart = null;
    this.hitBone = null;        // pointerdown 时命中的骨骼（用于 move）

    this._bindEvents();
  }

  setSkeleton(spine) {
    this.spine = spine;
    this.skeleton = spine?.skeleton || null;
    this.selectedBone = null;
    this.redraw();
  }

  setVisible(v) {
    this.visible = v;
    this.graphics.visible = v;
  }

  selectBone(bone) {
    this.selectedBone = bone;
    this.redraw();
    this.onSelect(bone);
  }

  /** 每帧重绘 gizmo（跟随骨骼世界变换）。pixi v7 用旧 Graphics API。 */
  redraw() {
    const g = this.graphics;
    g.clear();
    if (!this.skeleton || !this.visible) return;

    const bones = this.skeleton.bones;
    // 先画父子连线（未选中色）
    for (const bone of bones) {
      const parent = bone.parent;
      if (!parent) continue;
      const isSel = bone === this.selectedBone;
      g.lineStyle(isSel ? 2 : 1, isSel ? 0x7aa2f7 : 0x565f89, 0.8);
      g.moveTo(parent.worldX, parent.worldY);
      g.lineTo(bone.worldX, bone.worldY);
    }
    // 再画关节圆点（选中在上层）
    for (const bone of bones) {
      const isSel = bone === this.selectedBone;
      // 描边
      g.lineStyle(1, 0x1a1b26, 0.6);
      g.beginFill(isSel ? 0x7aa2f7 : 0xc0caf5, 0.9);
      g.drawCircle(bone.worldX, bone.worldY, isSel ? 5 : 3);
      g.endFill();
    }
  }

  /** 命中测试：返回距离鼠标最近的骨骼（容差像素内） */
  hitTestBones(globalX, globalY, tolerance = 12) {
    if (!this.skeleton) return null;
    const local = this.container.toLocal(new PIXI.Point(globalX, globalY));
    let best = null;
    let bestDist = tolerance;
    for (const bone of this.skeleton.bones) {
      const dx = bone.worldX - local.x;
      const dy = bone.worldY - local.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = bone;
      }
    }
    return best;
  }

  _bindEvents() {
    // gizmo graphics 接收交互（pointerMode static）
    this.graphics.eventMode = 'static';
    this.graphics.cursor = 'pointer';
    // 注意：spine 本体也可能接收事件，gizmo 放在 spine 之后 addChild，
    // z-order 在上层，pointerdown 优先到 gizmo。

    this.graphics.on('pointerdown', (e) => {
      const button = e.button; // 0=左 2=右 1=中
      const gp = e.global;
      const bone = this.hitTestBones(gp.x, gp.y);
      if (button === 0) {
        // 左键：选中 + 准备拖拽移动
        this.selectBone(bone);
        if (bone && this.skeleton) {
          this.dragging = true;
          this.dragMode = 'move';
          this.dragBone = bone;
          this.onTransformStart();
        }
      } else if (button === 2) {
        // 右键：选中 + 准备拖拽旋转（即使没精确命中也以当前选中骨骼为目标）
        const target = bone || this.selectedBone;
        if (target) {
          this.selectBone(target);
          this.dragging = true;
          this.dragMode = 'rotate';
          this.dragBone = target;
          this.onTransformStart();
        }
      }
    });

    // 全局 pointermove（拖拽中跟随鼠标）
    this.graphics.on('globalpointermove', (e) => {
      if (!this.dragging || !this.dragBone) return;
      const gp = e.global;
      const local = this.container.toLocal(new PIXI.Point(gp.x, gp.y));
      if (this.dragMode === 'move') {
        // 转到骨骼父节点本地坐标系
        const localPt = CoordinateUtils.containerToBoneLocal(this.dragBone, local.x, local.y);
        this.dragBone.x = localPt.x;
        this.dragBone.y = localPt.y;
      } else if (this.dragMode === 'rotate') {
        const ang = CoordinateUtils.angleFromParent(this.dragBone, local.x, local.y);
        this.dragBone.rotation = ang * (Math.PI / 180);
      }
      this.skeleton.updateWorldTransform();
      this.redraw();
      this.onLiveTransform(this.dragBone);
    });

    const endDrag = () => {
      if (this.dragging) {
        this.dragging = false;
        this.dragMode = null;
        this.dragBone = null;
        this.onTransformEnd();
      }
    };
    this.graphics.on('pointerup', endDrag);
    this.graphics.on('pointerupoutside', endDrag);
  }

  destroy() {
    this.graphics.removeAllListeners();
    if (this.graphics.parent) this.graphics.parent.removeChild(this.graphics);
    this.graphics.destroy();
  }
}

export default BoneGizmoLayer;
