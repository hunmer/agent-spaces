import { useCallback, useEffect } from 'react';
import { detect, exportBox, toHex } from '../../utils/image-ops/sprite-splitter';
import { inputSignature } from '../../utils/ui-splitter-helpers';

/**
 * UiSplitterDialog 切片框逻辑 hook：CRUD + 撤销重做 + 预览渲染 + 自动检测 + 持久化写回。
 *
 * 从主文件迁出，依赖通过 ctx 注入（refs/state setters/稳定回调）。所有 useCallback 的
 * 依赖数组与原主文件保持一致，确保 fabric 闭包读到最新值。
 *
 * @param {object} ctx
 *   refs: { fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef, thumbUrlsRef,
 *           exportEnabledRef, readyRef, drawModeRef, gridModeRef, cropModeRef, gridColsRef,
 *           gridRowsRef, vGuidesRef, hGuidesRef, gridSplitTimerRef, applyingHistoryRef,
 *           methodRef, toleranceRef, minAreaRef, paddingRef, pickedHexRef, onDataChangeRef }
 *   state: { open, thumbUrls, method, tolerance, minArea, padding, pickedHex }
 *   setters: { setStatus, setPreviews, setCount, setTotalCount, setSliceCounts, setCanUndo, setCanRedo }
 *   callbacks: { curState, computeOptions }
 */
export default function useSplitterSlices(ctx) {
  const { refs, state, setters, callbacks } = ctx;
  const {
    fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef, thumbUrlsRef,
    exportEnabledRef, readyRef, drawModeRef, gridModeRef, cropModeRef, gridColsRef,
    gridRowsRef, gridSplitTimerRef, applyingHistoryRef,
    methodRef, toleranceRef, minAreaRef, paddingRef, pickedHexRef, onDataChangeRef,
  } = refs;
  const { open, thumbUrls, method, tolerance, minArea, padding, pickedHex } = state;
  const {
    setStatus, setPreviews, setCount, setTotalCount, setSliceCounts, setCanUndo, setCanRedo,
  } = setters;
  const { curState, computeOptions } = callbacks;

  // ===== 持久化：统一写回函数（所有增删改入口汇总到 renderList → syncSplitData）=====
  const syncSplitData = useCallback(() => {
    const urls = thumbUrlsRef.current;
    if (!urls?.length) return;
    const states = imageStatesRef.current;
    const perImage = {};
    for (const url of urls) {
      const st = states[url];
      perImage[url] = {
        rects: (st?.rects || []).map((b) => ({ ...b })),
        pickedColor: st?.pickedColor ? [...st.pickedColor] : null,
        exportEnabled: exportEnabledRef.current[url] !== false,
        gridGuides: st?.gridGuides ? {
          cols: st.gridGuides.cols,
          rows: st.gridGuides.rows,
          v: [...(st.gridGuides.v || [])],
          h: [...(st.gridGuides.h || [])],
        } : null,
      };
    }
    onDataChangeRef.current?.({
      inputSignature: inputSignature(urls),
      cutoutMethodVersion: 1,
      method: methodRef.current,
      tolerance: toleranceRef.current,
      minArea: minAreaRef.current,
      padding: paddingRef.current,
      pickedHex: pickedHexRef.current,
      gridMode: gridModeRef.current,
      gridCols: gridColsRef.current,
      gridRows: gridRowsRef.current,
      perImage,
    });
  }, []);

  // ===== fabric 切片框辅助 =====
  const rects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return [];
    return fc.getObjects().filter((o) => o.kind === 'slice');
  }, []);

  const clearRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const r of rects()) fc.remove(r);
  }, [rects]);

  const realBox = useCallback((rect) => ({
    x: rect.left,
    y: rect.top,
    width: rect.width * rect.scaleX,
    height: rect.height * rect.scaleY,
  }), []);

  const snapshot = useCallback(() => rects().map(realBox), [rects, realBox]);

  const addRect = useCallback((box) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    const rect = new fabric.Rect({
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      fill: 'rgba(0,0,0,0)',
      stroke: '#0ea5e9',
      strokeWidth: 2,
      cornerColor: '#0ea5e9',
      transparentCorners: false,
      objectCaching: false,
    });
    rect.kind = 'slice';
    fc.add(rect);
  }, []);

  const updateHistoryButtons = useCallback(() => {
    const st = curState();
    setCanUndo((st?.undo?.length || 0) > 0);
    setCanRedo((st?.redo?.length || 0) > 0);
  }, [curState]);

  const pushHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    const st = curState();
    if (!st) return;
    st.undo.push(snapshot());
    st.redo.length = 0;
    updateHistoryButtons();
  }, [snapshot, curState, updateHistoryButtons]);

  // 表单参数变化 → 写回节点持久化（detectAll 已会经 renderList 写回，
  // 此处兜底覆盖「改参数但未触发检测」的路径；syncSplitData 只读不写 state，无循环风险）。
  // 必须声明在 syncSplitData 之后（useEffect deps 在函数体同步执行时求值，引用未初始化的 const 会 TDZ）。
  useEffect(() => {
    if (!open || !readyRef.current) return;
    syncSplitData();
  }, [open, method, tolerance, minArea, padding, pickedHex, syncSplitData]);

  const renderList = useCallback(() => {
    const source = sourceRef.current;
    // 同步当前图切片框到 state（保证 totalCount 统计最新）
    const cur = curState();
    if (cur && !gridModeRef.current) cur.rects = rects().map(realBox);
    if (!source) { setPreviews([]); setCount(0); setTotalCount(0); return; }
    const boxes = cur?.rects || [];
    setCount(boxes.length);
    const items = boxes.map((box, i) => {
      const canvas = exportBox(source.imageData, box, computeOptions());
      const name = `element_${String(i + 1).padStart(2, '0')}_${Math.round(box.width)}x${Math.round(box.height)}.png`;
      return { name, url: canvas.toDataURL('image/png') };
    });
    setPreviews(items);
    // 统计每图切片数 + 启用导出图的切片总和（驱动保存按钮）
    let total = 0;
    const states = imageStatesRef.current;
    const counts = {};
    for (const url of thumbUrls) {
      const st = states[url];
      const n = st?.rects?.length || 0;
      counts[url] = n;
      // exportEnabled 是 state，renderList 闭包可能读到旧值，用 ref 兜底
      if (exportEnabledRef.current[url] !== false) total += n;
    }
    setSliceCounts(counts);
    setTotalCount(total);
    // 切片框变化 → 写回节点持久化（统一同步点）
    syncSplitData();
  }, [rects, realBox, computeOptions, curState, thumbUrls, syncSplitData]);

  // 删除当前画布上选中的切片框（带历史）
  const deleteSelectedRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return false;
    const selected = rects().filter((r) => r.active || fc.getActiveObject() === r);
    if (!selected.length) return false;
    pushHistory();
    for (const r of selected) fc.remove(r);
    fc.discardActiveObject();
    fc.renderAll();
    renderList();
    setStatus(`已删除 ${selected.length} 个切片框`);
    return true;
  }, [rects, pushHistory, renderList]);

  // 清空当前激活图的所有切片框（带历史）
  const clearAllRects = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const all = rects();
    if (!all.length) return;
    pushHistory();
    for (const r of all) fc.remove(r);
    fc.discardActiveObject();
    fc.renderAll();
    renderList();
    setStatus('已清空当前图的切片框');
  }, [rects, pushHistory, renderList]);

  // 按预览索引删除单个切片框（与 renderList 的顺序一致）
  const deleteRectAt = useCallback((index) => {
    const fc = fcRef.current;
    if (!fc) return;
    if (gridModeRef.current) {
      const st = curState();
      if (!st?.rects?.[index]) return;
      st.rects = st.rects.filter((_, i) => i !== index);
      renderList();
      setStatus('已删除该网格切片');
      return;
    }
    const all = rects();
    const r = all[index];
    if (!r) return;
    pushHistory();
    fc.remove(r);
    fc.renderAll();
    renderList();
    setStatus('已删除该切片框');
  }, [rects, pushHistory, renderList, curState]);

  const applySnapshot = useCallback((boxes) => {
    const fc = fcRef.current;
    if (!fc) return;
    applyingHistoryRef.current = true;
    clearRects();
    boxes.forEach((box) => addRect(box));
    applyingHistoryRef.current = false;
    fc.renderAll();
    renderList();
    updateHistoryButtons();
  }, [clearRects, addRect, renderList, updateHistoryButtons]);

  const undo = useCallback(() => {
    const st = curState();
    if (!st?.undo?.length) return;
    st.redo.push(snapshot());
    applySnapshot(st.undo.pop());
  }, [curState, snapshot, applySnapshot]);

  const redo = useCallback(() => {
    const st = curState();
    if (!st?.redo?.length) return;
    st.undo.push(snapshot());
    applySnapshot(st.redo.pop());
  }, [curState, snapshot, applySnapshot]);

  const setColor = useCallback((color) => {
    const st = curState();
    if (st) st.pickedColor = color;
    // setPickedHex 由主文件传入 setters（与 toHex 来自 sprite-splitter）
    ctx.setters.setPickedHex(toHex(color));
  }, [curState]);

  // ===== 自动检测 =====
  // 对指定图（url）做纯数据检测，返回 box 数组并写入该图 state。不操作 fabric 画布。
  // picked 模式下用该图自身的 pickedColor（每图独立背景色），其它参数取当前表单值。
  const detectFor = useCallback((url) => {
    const st = imageStatesRef.current[url];
    if (!st?.source) return [];
    const opts = computeOptions();
    if (opts.method === 'picked') opts.backgroundColor = st.pickedColor;
    const boxes = detect(st.source.imageData, opts);
    st.rects = boxes;
    return boxes;
  }, [computeOptions]);

  // 对所有图批量检测（非激活图只写数据不渲染；最后统一 renderList 刷新计数/预览）
  const detectAll = useCallback(() => {
    // 「不检测」模式：跳过自动连通域检测，不清空画布、不改动现有切片框，保留用户手动框。
    if (methodRef.current === 'none') return 0;
    let total = 0;
    const active = activeUrlRef.current;
    for (const url of thumbUrls) {
      const boxes = detectFor(url);
      total += boxes.length;
      // 激活图把切片框同步到画布
      if (url === active) {
        const fc = fcRef.current;
        if (fc) {
          clearRects();
          boxes.forEach(addRect);
          // 重新应用当前绘制模式
          const inDraw = drawModeRef.current;
          for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
          fc.selection = !inDraw;
          fc.defaultCursor = inDraw ? 'crosshair' : 'default';
          fc.hoverCursor = inDraw ? 'crosshair' : 'move';
          fc.renderAll();
        }
      }
    }
    renderList();
    setStatus(`已对所有图检测，共 ${total} 个区域`);
    return total;
  }, [thumbUrls, detectFor, clearRects, addRect, renderList]);

  // 表单参数变化时自动重新检测所有图（编辑器就绪后才生效，避免加载阶段空跑）
  // 网格模式 / 裁切模式下跳过：detectAll 会重置切片框，破坏网格参考线状态
  useEffect(() => {
    if (!open || !readyRef.current || gridModeRef.current || cropModeRef.current) return;
    detectAll();
  }, [open, method, tolerance, minArea, padding, pickedHex, detectAll]);

  // 网格模式下，视觉参数（背景色/容差/边距）变化只影响导出底色，不改变切片框，
  // detectAll 会被上面的 effect 跳过，这里补一次 renderList 重算切片预览。
  useEffect(() => {
    if (!open || !readyRef.current || !gridModeRef.current) return;
    renderList();
  }, [open, pickedHex, tolerance, minArea, padding, renderList]);

  return {
    syncSplitData,
    rects, clearRects, realBox, snapshot, addRect,
    updateHistoryButtons, pushHistory, applySnapshot,
    undo, redo, setColor,
    detectFor, detectAll,
    renderList,
    deleteSelectedRects, clearAllRects, deleteRectAt,
  };
}
