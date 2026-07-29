/**
 * 右侧变换面板。
 *
 * 显示当前选中骨骼的本地变换，可编辑 X/Y/旋转/ScaleX/ScaleY，
 * 点击「应用变换」写入骨骼。「翻转」「重置」按钮。
 */
export class TransformPanel {
  constructor(container, { onApply, onFlip, onReset, onResetAll }) {
    this.container = container;
    this.onApply = onApply || (() => {});
    this.onFlip = onFlip || (() => {});
    this.onReset = onReset || (() => {});
    this.onResetAll = onResetAll || (() => {});
    this.bone = null;
    this._renderEmpty();
  }

  _renderEmpty() {
    this.container.innerHTML = `
      <div class="panel-title">变换 Transform</div>
      <div class="panel-empty">未选中骨骼<br/>点击骨骼树或画布圆点选择</div>
    `;
  }

  /** 设置当前骨骼（选中时调用）。liveUpdate=true 表示拖拽中实时刷新输入框 */
  setBone(bone, liveUpdate = false) {
    this.bone = bone;
    if (!bone) { this._renderEmpty(); return; }
    const rotDeg = (bone.rotation * 180) / Math.PI;
    const xInput = this.container.querySelector('#field-x');
    if (liveUpdate && xInput) {
      // 拖拽中：只更新值，不重建 DOM（避免输入框失焦）
      xInput.value = round(bone.x);
      this.container.querySelector('#field-y').value = round(bone.y);
      this.container.querySelector('#field-rot').value = round(rotDeg);
      this.container.querySelector('#field-sx').value = round(bone.scaleX);
      this.container.querySelector('#field-sy').value = round(bone.scaleY);
      return;
    }
    this._render(bone, rotDeg);
  }

  _render(bone, rotDeg) {
    this.container.innerHTML = `
      <div class="panel-title">变换 Transform</div>
      <div style="margin-bottom:10px;font-size:12px;color:var(--accent);font-weight:500;">${escapeHtml(bone.data.name)}</div>
      <div class="field-row">
        <label>X</label>
        <input id="field-x" type="number" step="0.01" value="${round(bone.x)}" />
      </div>
      <div class="field-row">
        <label>Y</label>
        <input id="field-y" type="number" step="0.01" value="${round(bone.y)}" />
      </div>
      <div class="field-row">
        <label>旋转°</label>
        <input id="field-rot" type="number" step="0.1" value="${round(rotDeg)}" />
      </div>
      <div class="field-row">
        <label>Scale X</label>
        <input id="field-sx" type="number" step="0.01" value="${round(bone.scaleX)}" />
      </div>
      <div class="field-row">
        <label>Scale Y</label>
        <input id="field-sy" type="number" step="0.01" value="${round(bone.scaleY)}" />
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btn-apply">应用变换</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-sm" id="btn-flip-x">水平翻转</button>
        <button class="btn btn-sm" id="btn-flip-y">竖直翻转</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-sm" id="btn-reset">重置骨骼</button>
        <button class="btn btn-sm btn-danger" id="btn-reset-all">全部重置</button>
      </div>
    `;

    this.container.querySelector('#btn-apply').onclick = () => {
      if (!this.bone) return;
      this.onApply(this.bone, {
        x: parseFloat(val('#field-x')),
        y: parseFloat(val('#field-y')),
        rotation: parseFloat(val('#field-rot')),
        scaleX: parseFloat(val('#field-sx')),
        scaleY: parseFloat(val('#field-sy')),
      });
    };
    this.container.querySelector('#btn-flip-x').onclick = () => this.onFlip(this.bone, 'x');
    this.container.querySelector('#btn-flip-y').onclick = () => this.onFlip(this.bone, 'y');
    this.container.querySelector('#btn-reset').onclick = () => this.onReset(this.bone);
    this.container.querySelector('#btn-reset-all').onclick = () => this.onResetAll();

    const val = (sel) => this.container.querySelector(sel)?.value || 0;
  }
}

function round(v, p = 2) {
  const f = Math.pow(10, p);
  return Math.round(v * f) / f;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default TransformPanel;
