/**
 * 绑定 UiSplitterDialog 键盘事件：空格平移 / Delete 删切片框 / Ctrl+Z 撤销 / Ctrl+Y 重做。
 * 普通函数，返回 cleanup。由主文件 useEffect 包一层（含 open 守卫与依赖）。
 *
 * @param {object} ctx
 *   refs: { fcRef, spaceDownRef, panningRef, lastPanRef, stageRef, drawModeRef }
 *   callbacks: { undo, redo, deleteSelectedRects }
 * @returns {() => void} cleanup
 */
export default function bindSplitterKeyboard(ctx) {
  const { refs, callbacks } = ctx;
  const { fcRef, spaceDownRef, panningRef, lastPanRef, stageRef, drawModeRef } = refs;
  const { undo, redo, deleteSelectedRects } = callbacks;

  const onKeyDown = (e) => {
    const t = e.target;
    const tag = t?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
    // Delete/Backspace：对话框打开时一律阻止冒泡（避免触发 ReactFlow 删节点）；
    // 有选中切片框时顺带删除它们
    if ((e.code === 'Delete' || e.code === 'Backspace') && !inField) {
      deleteSelectedRects();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
      e.preventDefault(); e.stopPropagation(); redo(); return;
    }
    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault(); e.stopPropagation(); undo(); return;
    }
    if (e.code !== 'Space' || inField) return;
    e.preventDefault();
    e.stopPropagation();
    const fc = fcRef.current;
    if (fc && !spaceDownRef.current) {
      spaceDownRef.current = true;
      fc.selection = false;
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = false;
      fc.defaultCursor = 'grab';
      stageRef.current?.classList.add('is-panning');
    }
  };
  const onKeyUp = (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    const fc = fcRef.current;
    if (fc) {
      const inDraw = drawModeRef.current;
      fc.selection = !inDraw;
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
      fc.defaultCursor = inDraw ? 'crosshair' : 'default';
    }
    spaceDownRef.current = false;
    panningRef.current = false;
    lastPanRef.current = null;
    stageRef.current?.classList.remove('is-panning');
  };
  window.addEventListener('keydown', onKeyDown, true);  // capture 阶段，抢在 ReactFlow 之前
  window.addEventListener('keyup', onKeyUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp);
  };
}
