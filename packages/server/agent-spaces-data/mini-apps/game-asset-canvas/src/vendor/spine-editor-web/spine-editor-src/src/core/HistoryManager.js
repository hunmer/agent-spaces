/**
 * 撤销/重做管理器。
 *
 * 每次骨骼变换（拖拽结束 / 应用变换面板 / 翻转 / 重置）记录一次快照。
 * 快照 = 所有骨骼本地变换的深拷贝 [{index, x, y, rotation, scaleX, scaleY}]。
 *
 * 用法：
 *   const h = new HistoryManager();
 *   h.push(skeleton);      // 记录当前状态（变换前调用）
 *   ... 用户操作骨骼 ...
 *   h.push(skeleton);      // 变换后再 push 一次（作为撤销的目标态）
 *   h.undo(skeleton);      // 回退到上一快照
 *   h.redo(skeleton);      // 重做
 */
export class HistoryManager {
  constructor(maxSize = 50) {
    this.stack = [];     // 已记录的快照
    this.cursor = -1;    // 当前位置（redo 栈顶 = cursor+1）
    this.maxSize = maxSize;
  }

  /** 采集 skeleton 当前所有骨骼的本地变换快照 */
  snapshot(skeleton) {
    const bones = skeleton.bones || [];
    return bones.map((b, i) => ({
      index: i,
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      scaleX: b.scaleX,
      scaleY: b.scaleY,
      shearX: b.shearX,
      shearY: b.shearY,
    }));
  }

  /** 把 skeleton 恢复到指定快照 */
  restore(skeleton, snap) {
    if (!snap || !skeleton?.bones) return;
    const bones = skeleton.bones;
    for (const s of snap) {
      const b = bones[s.index];
      if (!b) continue;
      b.x = s.x;
      b.y = s.y;
      b.rotation = s.rotation;
      b.scaleX = s.scaleX;
      b.scaleY = s.scaleY;
      b.shearX = s.shearX;
      b.shearY = s.shearY;
    }
    skeleton.updateWorldTransform();
  }

  /**
   * 记录一次快照（变换后调用）。
   * 如果当前 cursor 不在栈顶（之前 undo 过），丢弃 redo 部分。
   */
  push(skeleton, label = '') {
    const snap = this.snapshot(skeleton);
    snap._label = label;
    snap._time = Date.now();
    // 丢弃 redo 部分
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(snap);
    // 限制大小
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
    this.cursor = this.stack.length - 1;
  }

  /** 撤销：回到上一个快照。返回是否成功 */
  undo(skeleton) {
    if (this.cursor <= 0) return false;
    this.cursor--;
    this.restore(skeleton, this.stack[this.cursor]);
    return true;
  }

  /** 重做：前进到下一个快照。返回是否成功 */
  redo(skeleton) {
    if (this.cursor >= this.stack.length - 1) return false;
    this.cursor++;
    this.restore(skeleton, this.stack[this.cursor]);
    return true;
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  /** 清空历史（加载新角色时调用） */
  clear() {
    this.stack = [];
    this.cursor = -1;
  }
}

export default HistoryManager;
