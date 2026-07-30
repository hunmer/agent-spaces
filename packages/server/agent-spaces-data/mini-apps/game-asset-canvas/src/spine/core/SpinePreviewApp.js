/**
 * SpinePreviewApp：Spine 展示节点的轻量 PIXI 渲染封装。
 *
 * 从 SpineEditorApp 裁剪而来，只保留「只读预览」所需：
 *   init / setSpine / setAnimation / setSkin / setPlaybackSpeed / play|pause / _onTick / fitView / destroy
 *
 * 删除：BoneGizmoLayer、HistoryManager、骨骼变换、视图缩放平移交互、换肤AI、录制。
 * 展示节点只做动画播放预览，不做任何编辑。
 */
import { PIXI } from '../runtime.js';
import { calculateFitTransform } from './ViewUtils.js';

export class SpinePreviewApp {
  /**
   * @param {HTMLElement} container 承载 canvas 的容器元素。
   *   PIXI 自建 canvas 并 append 进容器（同 SpineEditorApp，避免 React 管理 canvas 触发 WebGL 异常）。
   */
  constructor(container) {
    this.container = container;
    this.canvasElement = null; // PIXI 创建并挂载的真实 canvas（app.view）
    this.app = null;
    this.spine = null;
    this.spineContainer = null;

    // 播放状态（展示节点只有 play/pause，无 pose 编辑模式）
    this.playing = true;
    this.currentAnimation = null;
    this.currentSkin = null;
    this.playbackSpeed = 1;

    // 视图缩放/平移（仅 fitView 用，不暴露交互）
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;

    this._tickerBound = null;
  }

  /** 初始化 PIXI Application（自建 canvas，不接收外部 view） */
  async init() {
    // 先读取容器尺寸：absolute/inset-0 容器在 NodeShell 视口门控下，
    // 首次挂载时 resizeTo 的 ResizeObserver 可能拿到 0。故显式给定初值，再监听变化。
    const rect = this.container.getBoundingClientRect();
    const initWidth = Math.max(1, Math.floor(rect.width) || 300);
    const initHeight = Math.max(1, Math.floor(rect.height) || 180);
    this.app = new PIXI.Application({
      width: initWidth,
      height: initHeight,
      background: '#eef0f3',
      antialias: true,
      preserveDrawingBuffer: true, // 截图需要（虽展示节点不强用，保留一致性）
      resizeTo: this.container,
    });
    this.canvasElement = this.app.view;
    this.canvasElement.style.width = '100%';
    this.canvasElement.style.height = '100%';
    this.canvasElement.style.display = 'block';
    this.container.appendChild(this.canvasElement);

    this.spineContainer = new PIXI.Container();
    this.app.stage.addChild(this.spineContainer);

    this._tickerBound = () => this._onTick();
    this.app.ticker.add(this._tickerBound);
  }

  /** 应用视图缩放/平移到 spineContainer */
  _applyView() {
    if (!this.spineContainer) return;
    this.spineContainer.scale.set(this.viewScale);
    this.spineContainer.position.set(this.viewX, this.viewY);
  }

  /** 把 spine 居中适配画布 */
  fitView() {
    if (!this.spine) return;
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
    this._applyView();
    this.spineContainer.updateTransform();
    const bounds = this.spine.getBounds();
    const transform = calculateFitTransform(bounds, this.app.screen, {
      padding: 40,
      minScale: 0.1,
      maxScale: 5,
    });
    if (!transform) return;
    this.viewScale = transform.scale;
    this.viewX = transform.x;
    this.viewY = transform.y;
    this._applyView();
  }

  /** 加载 Spine 实例并放入容器 */
  setSpine(spine) {
    if (this.spine) {
      this.spineContainer.removeChild(this.spine);
      this.spine.destroy();
    }
    this.spine = spine;
    try {
      this.spineContainer.addChild(spine);
      spine.state.timeScale = this.playbackSpeed;
      // 先更新一次计算 mesh 顶点 + bounds，否则 fitView 拿到空 bounds
      spine.skeleton.setToSetupPose();
      spine.update(0);
      // 驱动 4.2 spine-pixi 首次 renderMeshes 建立 mesh 子树
      this.app.render();
      this.spineContainer.updateTransform();
    } catch (err) {
      console.error('[SpinePreview.setSpine] FAILED', err);
      try { this.spineContainer.removeChild(spine); } catch { /* ignore */ }
      this.spine = null;
      throw err;
    }

    // 默认选第一个动画（优先 stand2）
    const anims = spine.spineData.animations;
    if (anims && anims.length) {
      const stand2 = anims.find((a) => a.name === 'stand2');
      this.currentAnimation = stand2 ? stand2.name : anims[0].name;
    }

    // 重置视图
    this.viewScale = 1;
    this.viewX = 0;
    this.viewY = 0;
    this._applyView();
    this.fitView();
  }

  setAnimation(name) {
    this.currentAnimation = name;
    if (this.playing && this.spine && name) {
      this.spine.state.setAnimation(0, name, true);
    }
  }

  /** 播放 / 暂停 */
  setPlaying(playing) {
    console.debug('[SpinePreviewApp] setPlaying', playing, { hasSpine: !!this.spine, curAnim: this.currentAnimation });
    this.playing = playing;
    if (!this.spine) return;
    if (playing) {
      if (this.currentAnimation) {
        this.spine.state.setAnimation(0, this.currentAnimation, true);
      }
    } else {
      this.spine.state.clearTracks();
    }
  }

  setPlaybackSpeed(speed) {
    const value = Number(speed);
    if (!Number.isFinite(value) || value <= 0) return;
    this.playbackSpeed = value;
    if (this.spine?.state) this.spine.state.timeScale = value;
  }

  setSkin(name) {
    this.currentSkin = name;
    if (!this.spine) return;
    this.spine.skeleton.setSkinByName(name);
    this.spine.skeleton.setSlotsToSetupPose();
    this.spine.skeleton.updateWorldTransform();
  }

  /** 渲染循环：playing 时推进动画 state */
  _onTick() {
    const dt = this.app.ticker.deltaMS / 1000;
    if (this.spine) {
      if (this.playing) {
        this.spine.update(dt);
      } else {
        this.spine.skeleton.updateWorldTransform();
      }
      this.spineContainer.updateTransform();
    }
  }

  destroy() {
    if (this._tickerBound) this.app?.ticker.remove(this._tickerBound);
    this.app?.destroy(true);
    this.app = null;
    this.spine = null;
    this.spineContainer = null;
  }
}

export default SpinePreviewApp;
