/**
 * 顶部工具栏。
 *
 * 包含：
 * - 模式切换（静态姿势 / 播放动画）
 * - 动画下拉（仅播放模式可用）
 * - 皮肤下拉
 * - 撤销 / 重做
 * - 适应视图
 * - 导出（姿势 JSON / 截图 PNG / Spine 文件包）
 */
export class Toolbar {
  constructor(container, {
    onModeChange, onAnimationChange, onSkinChange,
    onUndo, onRedo, onFitView,
    onExportPose, onExportScreenshot, onExportSpine,
    onToggleRecord,
  }) {
    this.container = container;
    this.cb = { onModeChange, onAnimationChange, onSkinChange, onUndo, onRedo, onFitView, onExportPose, onExportScreenshot, onExportSpine, onToggleRecord };
    this.animations = [];
    this.skins = [];
    this.mode = 'pose';
    this.recording = false;
    this._render();
  }

  setAnimations(anims) {
    this.animations = anims || [];
    this._updateAnimSelect();
  }

  setSkins(skins) {
    this.skins = skins || [];
    this._updateSkinSelect();
  }

  setMode(mode) {
    this.mode = mode;
    const modeSelect = this.container.querySelector('#mode-select');
    if (modeSelect) modeSelect.value = mode;
    const animSelect = this.container.querySelector('#anim-select');
    if (animSelect) animSelect.disabled = mode !== 'play';
  }

  updateUndoRedo(canUndo, canRedo) {
    const u = this.container.querySelector('#btn-undo');
    const r = this.container.querySelector('#btn-redo');
    if (u) u.disabled = !canUndo;
    if (r) r.disabled = !canRedo;
  }

  /** 同步录制按钮状态（文案 + 样式） */
  setRecording(recording) {
    this.recording = !!recording;
    const btn = this.container.querySelector('#btn-record');
    if (btn) {
      btn.textContent = this.recording ? '■ 停止录制' : '● 录制';
      btn.classList.toggle('recording', this.recording);
    }
  }

  _render() {
    this.container.innerHTML = `
      <div class="tb-group">
        <label>模式</label>
        <select id="mode-select">
          <option value="pose">静态姿势</option>
          <option value="play">播放动画</option>
        </select>
      </div>
      <div class="tb-group">
        <label>动画</label>
        <select id="anim-select" disabled></select>
      </div>
      <div class="tb-group">
        <label>皮肤</label>
        <select id="skin-select" disabled></select>
      </div>
      <div class="tb-sep"></div>
      <div class="tb-group">
        <button class="btn btn-sm" id="btn-undo" title="撤销 (Ctrl+Z)" disabled>↶ 撤销</button>
        <button class="btn btn-sm" id="btn-redo" title="重做 (Ctrl+Y)" disabled>↷ 重做</button>
      </div>
      <div class="tb-sep"></div>
      <div class="tb-group">
        <button class="btn btn-sm" id="btn-fit" title="适应视图">⊕ 适应视图</button>
      </div>
      <div class="tb-sep"></div>
      <div class="tb-group">
        <button class="btn btn-sm btn-record" id="btn-record" title="录制画布动作（WebM）">● 录制</button>
      </div>
      <div class="tb-sep"></div>
      <div class="tb-group">
        <button class="btn btn-sm" id="btn-export-pose">导出姿势</button>
        <button class="btn btn-sm" id="btn-export-shot">截图</button>
        <button class="btn btn-sm" id="btn-export-spine">下载 Spine</button>
      </div>
    `;

    this.container.querySelector('#mode-select').onchange = (e) => {
      this.mode = e.target.value;
      this.setMode(this.mode);
      this.cb.onModeChange?.(this.mode);
    };
    this.container.querySelector('#anim-select').onchange = (e) => this.cb.onAnimationChange?.(e.target.value);
    this.container.querySelector('#skin-select').onchange = (e) => this.cb.onSkinChange?.(e.target.value);
    this.container.querySelector('#btn-undo').onclick = () => this.cb.onUndo?.();
    this.container.querySelector('#btn-redo').onclick = () => this.cb.onRedo?.();
    this.container.querySelector('#btn-fit').onclick = () => this.cb.onFitView?.();
    this.container.querySelector('#btn-record').onclick = () => this.cb.onToggleRecord?.();
    this.container.querySelector('#btn-export-pose').onclick = () => this.cb.onExportPose?.();
    this.container.querySelector('#btn-export-shot').onclick = () => this.cb.onExportScreenshot?.();
    this.container.querySelector('#btn-export-spine').onclick = () => this.cb.onExportSpine?.();
  }

  _updateAnimSelect() {
    const sel = this.container.querySelector('#anim-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const a of this.animations) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      sel.appendChild(opt);
    }
    sel.disabled = this.animations.length === 0 || this.mode !== 'play';
  }

  _updateSkinSelect() {
    const sel = this.container.querySelector('#skin-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const s of this.skins) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    }
    sel.disabled = this.skins.length === 0;
  }
}

export default Toolbar;
