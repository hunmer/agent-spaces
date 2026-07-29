/**
 * 骨骼手柄层：在 Pixi stage 上叠加骨骼连线 + 关节圆点，处理拖拽交互。
 *
 * 关键坐标系处理：
 *  - bone.worldX/worldY 是 skeleton 空间坐标（相对 skeleton root）
 *  - pixi-spine 渲染 mesh 时，这些坐标经过 Spine 实例的 worldTransform 映射到舞台
 *  - gizmo graphics 挂在 spineContainer（与 spine 实例同级，跟随 viewScale 缩放/平移）
 *  - 绘制时把 bone 的 skeleton 坐标用 spine.localTransform 转成容器坐标，
 *    这样骨骼线与角色 mesh 完全对齐，且线条粗细用固定屏幕像素（不随 spine 缩放）
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
import { CoordinateUtils } from './CoordinateUtils.js';

export class BoneGizmoLayer {
  /**
   * @param {object} opts
   * @param {PIXI.Container} opts.container spineContainer（gizmo 挂这里，与 spine 同级）
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

  /**
   * 把骨骼的 skeleton 空间坐标 (worldX, worldY) 转成 spineContainer 坐标。
   * 只应用 spine 相对父容器的 localTransform；父容器的 view transform 会在渲染时统一应用。
   */
  _boneToContainer(bone) {
    if (!this.spine) return { x: bone.worldX, y: bone.worldY };
    const lt = this.spine.transform?.localTransform;
    if (!lt) return { x: bone.worldX, y: bone.worldY };
    const a = lt.a, b = lt.b, c = lt.c, d = lt.d, tx = lt.tx, ty = lt.ty;
    // PIXI Matrix: [a c tx; b d ty; 0 0 1]
    return {
      x: bone.worldX * a + bone.worldY * c + tx,
      y: bone.worldX * b + bone.worldY * d + ty,
    };
  }

  /** 每帧重绘 gizmo（跟随骨骼世界变换）。pixi v7 用旧 Graphics API。 */
  redraw() {
    const g = this.graphics;
    g.clear();
    if (!this.skeleton || !this.visible) return;

    const bones = this.skeleton.bones;
    // 先画父子连线（用转换后的容器坐标）
    for (const bone of bones) {
      const parent = bone.parent;
      if (!parent) continue;
      const isSel = bone === this.selectedBone;
      const p = this._boneToContainer(parent);
      const c = this._boneToContainer(bone);
      g.lineStyle(isSel ? 2 : 1, isSel ? 0x4c6ef5 : 0x868e96, 0.85);
      g.moveTo(p.x, p.y);
      g.lineTo(c.x, c.y);
    }
    // 再画关节圆点（选中在上层）
    for (const bone of bones) {
      const isSel = bone === this.selectedBone;
      const c = this._boneToContainer(bone);
      g.lineStyle(1, 0x212529, 0.7);
      g.beginFill(isSel ? 0x4c6ef5 : 0x868e96, 0.95);
      g.drawCircle(c.x, c.y, isSel ? 6 : 4);
      g.endFill();
    }
  }

  /** 命中测试：返回距离鼠标最近的骨骼（容差像素内，用容器坐标） */
  hitTestBones(globalX, globalY, tolerance = 12) {
    if (!this.skeleton) return null;
    const local = this.container.toLocal(new PIXI.Point(globalX, globalY));
    let best = null;
    let bestDist = tolerance;
    for (const bone of this.skeleton.bones) {
      const c = this._boneToContainer(bone);
      const dx = c.x - local.x;
      const dy = c.y - local.y;
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
      if (!this.dragging || !this.dragBone || !this.spine) return;
      const gp = e.global;
      // 鼠标坐标转到 spine 实例本地坐标（skeleton 空间）
      const spineLocal = this.spine.toLocal(new PIXI.Point(gp.x, gp.y));
      if (this.dragMode === 'move') {
        // 转到骨骼父节点本地坐标系
        const localPt = CoordinateUtils.containerToBoneLocal(this.dragBone, spineLocal.x, spineLocal.y);
        this.dragBone.x = localPt.x;
        this.dragBone.y = localPt.y;
      } else if (this.dragMode === 'rotate') {
        const ang = CoordinateUtils.angleFromParent(this.dragBone, spineLocal.x, spineLocal.y);
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
