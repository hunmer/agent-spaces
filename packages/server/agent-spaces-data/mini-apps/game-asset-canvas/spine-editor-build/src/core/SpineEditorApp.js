/**
 * SpineEditorApp：Pixi Application 封装。
 *
 * 职责：
 * 1. 初始化 PIXI.Application（绑定 canvas 元素，开启渲染循环）
 * 2. 管理 spine 容器（一个 Container 持有 Spine 实例 + Gizmo 层）
 * 3. 视图缩放/平移（滚轮缩放、中键/空格+拖拽平移）
 * 4. 适应视图（fitView：把 spine 居中适配画布）
 * 5. 模式切换（静态姿势 vs 播放动画）
 * 6. 截图导出
 *
 * 不负责：骨骼树/变换面板等 DOM UI（由各 ui/*.js 模块处理，通过回调通信）。
 */
import * as PIXI from 'pixi.js';
import { BoneGizmoLayer } from './BoneGizmoLayer';
import { HistoryManager } from './HistoryManager';

export class SpineEditorApp {
  constructor(canvasElement) {
    this.canvasElement = canvasElement;
    this.app = null;
    this.spine = null;          // Spine 实例
    this.spineContainer = null; // 持有 spine + gizmo 的容器
    this.gizmo = null;          // BoneGizmoLayer
    this.history = new HistoryManager(50);

    // 视图状态（缩放/平移作用于 spineContainer）
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;

    // 模式
    this.mode = 'pose';         // 'pose' | 'play'
    this.currentAnimation = null;
    this.currentSkin = null;

    // 平移状态
    this.panning = false;
    this.panStart = null;
    this.spaceDown = false;

    this.onReady = null;
    this._tickerBound = null;
  }

  /** 初始化 PIXI Application */
  async init() {
    this.app = new PIXI.Application({
      view: this.canvasElement,
      background: '#eef0f3',
      antialias: true,
      // 录制 WebGL canvas 需保留绘图缓冲区，否则 captureStream 会抓到黑屏/残帧
      preserveDrawingBuffer: true,
      resizeTo: this.canvasElement.parentElement,
    });

    // spine 容器（缩放/平移作用于此）
    this.spineContainer = new PIXI.Container();
    this.app.stage.addChild(this.spineContainer);

    // gizmo 层
    this.gizmo = new BoneGizmoLayer({
      container: this.spineContainer,
      onSelect: (bone) => this._onSelectBone(bone),
      onTransformStart: () => { /* 拖拽开始：不立即 push，结束时统一 push */ },
      onTransformEnd: () => {
        // 拖拽结束：push 快照 + 标记已修改
        if (this.spine) {
          this.history.push(this.spine.skeleton, 'drag');
          this._setModified(true);
        }
      },
      onLiveTransform: (bone) => {
        // 拖拽中：通知面板刷新数值
        this._onLiveTransform?.(bone);
      },
    });

    this._bindViewControls();
    this._tickerBound = () => this._onTick();
    this.app.ticker.add(this._tickerBound);

    this.onReady?.();
  }

  /** 绑定视图缩放/平移（滚轮、中键、空格） */
  _bindViewControls() {
    const canvas = this.canvasElement;
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;

    // 滚轮缩放
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // ctrl/cmd/shift + 滚轮 = 缩放；普通滚轮也缩放（PRD：Shift+滚轮/Ctrl+滚轮缩放）
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomAt(e.offsetX, e.offsetY, factor);
    }, { passive: false });

    // 中键 / 空格+左键 平移
    stage.on('pointerdown', (e) => {
      // 只在没命中骨骼时平移（gizmo 的 pointerdown 会 stopPropagation? 不会，pixi 事件冒泡）
      // 用 button 判断：1=中键，或空格+左键
      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        this.panning = true;
        this.panStart = { x: e.global.x, y: e.global.y, vx: this.viewX, vy: this.viewY };
        // 抑制 gizmo 拖拽：临时不处理（gizmo pointerdown 检查 button===0 且非中键）
      }
    });
    stage.on('globalpointermove', (e) => {
      if (this.panning) {
        const dx = e.global.x - this.panStart.x;
        const dy = e.global.y - this.panStart.y;
        this.viewX = this.panStart.vx + dx;
        this.viewY = this.panStart.vy + dy;
        this._applyView();
      }
    });
    const endPan = () => { this.panning = false; this.panStart = null; };
    stage.on('pointerup', endPan);
    stage.on('pointerupoutside', endPan);

    // 空格键
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this._isInputFocused()) {
        e.preventDefault();
        this.spaceDown = true;
        canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        canvas.style.cursor = '';
      }
    });

    // 禁用右键菜单（右键用于旋转）
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _isInputFocused() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  /** 在指定屏幕点缩放（保持该点不动） */
  zoomAt(screenX, screenY, factor) {
    const newScale = Math.max(0.1, Math.min(5, this.viewScale * factor));
    const realFactor = newScale / this.viewScale;
    // 保持 (screenX, screenY) 对应的世界点不动
    this.viewX = screenX - (screenX - this.viewX) * realFactor;
    this.viewY = screenY - (screenY - this.viewY) * realFactor;
    this.viewScale = newScale;
    this._applyView();
  }

  _applyView() {
    if (!this.spineContainer) return;
    this.spineContainer.scale.set(this.viewScale);
    this.spineContainer.position.set(this.viewX, this.viewY);
  }

  /** 适应视图：居中并适配画布 */
  fitView() {
    if (!this.spine) return;
    // 用 spine 的 bounds
    const bounds = this.spine.getBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
    const screen = this.app.screen;
    const padding = 60;
    const scaleX = (screen.width - padding * 2) / bounds.width;
    const scaleY = (screen.height - padding * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY, 2);
    this.viewScale = scale;
    // 居中：让 bounds 中心对齐画布中心
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    this.viewX = screen.width / 2 - cx * scale;
    this.viewY = screen.height / 2 - cy * scale;
    this._applyView();
  }

  /** 加载 Spine 实例并放入容器 */
  setSpine(spine) {
    // 清除旧的（不销毁 children：gizmo graphics 由 BoneGizmoLayer 自管理）
    if (this.spine) {
      this.spineContainer.removeChild(this.spine);
      this.spine.destroy();
    }
    this.spine = spine;
    this.spineContainer.addChild(spine);
    // 确保新 spine 先更新一次（计算 mesh 顶点 + bounds），否则 fitView 拿到空 bounds
    spine.skeleton.setToSetupPose();
    spine.update(0);
    // 强制更新 transform，确保 getBounds/fitView 读到最新值
    this.spineContainer.updateTransform();
    // gizmo 挂在 spineContainer（与 spine 同级），redraw 时只应用 spine 的本地变换
    this.gizmo.setSkeleton(spine);
    this.history.clear();

    // 默认状态：第一个动画（参考仓库逻辑）
    const anims = spine.spineData.animations;
    if (anims && anims.length) {
      // 优先 stand2，否则第一个
      const stand2 = anims.find((a) => a.name === 'stand2');
      this.currentAnimation = stand2 ? stand2.name : anims[0].name;
    }
    // 保持当前模式：若用户在播放模式，新角色自动播放当前动画；否则 pose 模式
    this.setMode(this.mode);

    // 重置视图缩放/平移（避免旧角色的 viewScale/viewX/viewY 残留）
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
    this._applyView();
    // 初始视图：居中（spine 已 update + updateTransform，bounds 有效且准确）
    this.fitView();

    // 记录初始快照
    this.history.push(spine.skeleton, 'init');
    this._setModified(false);
  }

  /** 切换模式：pose（静态姿势）/ play（播放动画） */
  setMode(mode) {
    this.mode = mode;
    if (!this.spine) return;
    if (mode === 'pose') {
      // 停止动画，回到 setup pose（保留用户已调整的本地变换）
      this.spine.state.clearTracks();
      this.spine.skeleton.setToSetupPose();
      this.spine.skeleton.updateWorldTransform();
      // 恢复历史快照（保留用户编辑）
      if (this.history.cursor >= 0) {
        this.history.restore(this.spine.skeleton, this.history.stack[this.history.cursor]);
      }
    } else if (mode === 'play' && this.currentAnimation) {
      this.spine.state.setAnimation(0, this.currentAnimation, true);
    }
    this.gizmo.redraw();
  }

  setAnimation(name) {
    this.currentAnimation = name;
    if (this.mode === 'play' && this.spine) {
      this.spine.state.setAnimation(0, name, true);
    }
  }

  setSkin(name) {
    this.currentSkin = name;
    if (!this.spine) return;
    this.spine.skeleton.setSkinByName(name);
    this.spine.skeleton.setSlotsToSetupPose();
    this.spine.skeleton.updateWorldTransform();
    this.gizmo.redraw();
  }

  /** 渲染循环 */
  _onTick() {
    const dt = this.app.ticker.deltaMS / 1000;
    if (this.spine) {
      // play 模式才更新动画 state；pose 模式只更新世界变换
      if (this.mode === 'play') {
        this.spine.update(dt);
      } else {
        this.spine.skeleton.updateWorldTransform();
      }
      // 手动同步 transform，确保 getBounds 和交互读取当前帧矩阵。
      this.spineContainer.updateTransform();
      this.gizmo.redraw();
    }
  }

  /** 截图导出为 dataUrl（PNG）。pixi v7: app.renderer.extract.canvas(target) */
  exportScreenshot() {
    if (!this.app) return null;
    // 暂时隐藏 gizmo 以干净截图
    const wasVisible = this.gizmo.visible;
    this.gizmo.setVisible(false);
    this.app.render();
    const canvas = this.app.renderer.extract.canvas();
    const url = canvas.toDataURL('image/png');
    this.gizmo.setVisible(wasVisible);
    return url;
  }

  /**
   * 热加载新 atlas sheet 贴图（换肤预览）。
   * 方案 A：替换 baseTexture 的底层 resource，UV/region 不动。
   * 前提：新 sheet 的 region 布局与原 atlas 完全一致（同一套骨骼换贴图）。
   *
   * @param {string} pngDataUrl 新 atlas sheet 的 PNG dataUrl
   * @returns {Promise<void>}
   */
  async replaceAtlasTexture(pngDataUrl) {
    if (!this.spine?._baseTexture) throw new Error('当前 spine 无 baseTexture，无法热加载');
    const newBaseTex = PIXI.BaseTexture.from(pngDataUrl);
    // 等待新贴图加载完成
    if (!newBaseTex.valid) {
      await new Promise((resolve) => {
        const onLoaded = () => resolve();
        newBaseTex.once('loaded', onLoaded);
        newBaseTex.once('update', onLoaded);
        // 兜底：500ms 后强制 resolve
        setTimeout(resolve, 500);
      });
    }
    // 用新 resource 替换原 baseTexture 的底层资源
    const newResource = newBaseTex.resource;
    this.spine._baseTexture.setResource(newResource, 0);
    this.spine._baseTexture.update();
    // 销毁临时 baseTexture（保留 resource 给原 baseTexture 用）
    newBaseTex.destroy(true);
    // 强制刷新渲染
    this.app.render();
    this.gizmo.redraw();
  }

  /**
   * 获取当前 atlas 信息（用于校验/展示）。
   * @returns {{sheetW:number, sheetH:number, regionCount:number}|null}
   */
  getAtlasInfo() {
    const bt = this.spine?._baseTexture;
    const atlas = this.spine?._atlas;
    if (!bt) return null;
    const regions = atlas?.regions || [];
    return {
      sheetW: bt.width,
      sheetH: bt.height,
      regionCount: regions.length,
    };
  }

  // ===== 选中 / 变换回调（由 UI 设置）=====
  setCallbacks({ onSelect, onLiveTransform, onModified }) {
    this._onSelectBone = onSelect;
    this._onLiveTransform = onLiveTransform;
    this._onModified = onModified;
  }

  _setModified(v) { this._onModified?.(v); }
  _onSelectBone(bone) { /* 由 setCallbacks 覆盖 */ }
  _onLiveTransform(bone) { /* 由 setCallbacks 覆盖 */ }

  /** 应用变换面板的数值到选中骨骼 */
  applyTransform(bone, values) {
    if (!bone) return;
    bone.x = values.x;
    bone.y = values.y;
    bone.rotation = (values.rotation * Math.PI) / 180;
    bone.scaleX = values.scaleX;
    bone.scaleY = values.scaleY;
    this.spine.skeleton.updateWorldTransform();
    this.gizmo.redraw();
    this.history.push(this.spine.skeleton, 'apply');
    this._setModified(true);
  }

  /** 水平/竖直翻转选中骨骼及其子级 */
  flip(bone, axis) {
    if (!bone) return;
    if (axis === 'x') bone.scaleX *= -1;
    else bone.scaleY *= -1;
    this.spine.skeleton.updateWorldTransform();
    this.gizmo.redraw();
    this.history.push(this.spine.skeleton, 'flip');
    this._setModified(true);
  }

  /**
   * 翻转整个角色（镜像）。通过 skeleton.scaleX/scaleY 取反，
   * 影响所有骨骼及 attachment，视觉上整体翻转。
   */
  flipCharacter(axis) {
    if (!this.spine) return;
    if (axis === 'x') this.spine.skeleton.scaleX *= -1;
    else this.spine.skeleton.scaleY *= -1;
    this.spine.skeleton.updateWorldTransform();
    this.spineContainer.updateTransform();
    this.gizmo.redraw();
    this.history.push(this.spine.skeleton, 'flipChar');
    this._setModified(true);
  }

  /** 重置选中骨骼到 setup pose 的值 */
  resetBone(bone) {
    if (!bone) return;
    bone.x = bone.data.x;
    bone.y = bone.data.y;
    bone.rotation = bone.data.rotation;
    bone.scaleX = bone.data.scaleX;
    bone.scaleY = bone.data.scaleY;
    this.spine.skeleton.updateWorldTransform();
    this.gizmo.redraw();
    this.history.push(this.spine.skeleton, 'reset');
    this._setModified(true);
  }

  /** 全部重置到 setup pose */
  resetAll() {
    if (!this.spine) return;
    this.spine.skeleton.setToSetupPose();
    this.spine.skeleton.updateWorldTransform();
    this.gizmo.redraw();
    this.history.push(this.spine.skeleton, 'resetAll');
    this._setModified(false);
  }

  undo() { const ok = this.history.undo(this.spine.skeleton); this.gizmo.redraw(); this._setModified(true); return ok; }
  redo() { const ok = this.history.redo(this.spine.skeleton); this.gizmo.redraw(); this._setModified(true); return ok; }
  canUndo() { return this.history.canUndo(); }
  canRedo() { return this.history.canRedo(); }

  destroy() {
    if (this._tickerBound) this.app?.ticker.remove(this._tickerBound);
    this.gizmo?.destroy();
    this.app?.destroy(true);
  }
}

export default SpineEditorApp;
