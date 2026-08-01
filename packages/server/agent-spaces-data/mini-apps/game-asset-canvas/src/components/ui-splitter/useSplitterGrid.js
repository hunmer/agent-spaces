import { useCallback, useEffect } from 'react';
import {
  normalizeGridCount, gridSplitThrottleMs, evenlySpacedGuides,
  resolveGridGuides, gridBoxesFromGuides,
} from '../../utils/ui-splitter-helpers';

/**
 * UiSplitterDialog 网格模式 hook：参考线 CRUD + 进入/退出网格 + 实时拆分。
 *
 * 依赖 slices hook 返回的 renderList/pushHistory/clearRects/addRect/curState。
 *
 * @param {object} ctx
 *   refs: { fcRef, fabricLibRef, sourceRef, gridModeRef, gridColsRef, gridRowsRef,
 *           vGuidesRef, hGuidesRef, gridSplitTimerRef, lastGridSplitAtRef,
 *           cropDraftRef, cropModeRef, drawModeRef, imageStatesRef, activeUrlRef }
 *   state: { activeUrl, gridMode }
 *   setters: { setStatus, setGridCols, setGridRows, setGridMode, setCropMode, setCropBox }
 *   sliceApi: { curState, renderList, pushHistory, clearRects, addRect }
 */
export default function useSplitterGrid(ctx) {
  const { refs, state, setters, sliceApi } = ctx;
  const {
    fcRef, fabricLibRef, sourceRef, gridModeRef, gridColsRef, gridRowsRef,
    vGuidesRef, hGuidesRef, gridSplitTimerRef, lastGridSplitAtRef,
    cropDraftRef, cropModeRef, drawModeRef,
  } = refs;
  const { activeUrl, gridMode } = state;
  const { setStatus, setGridCols, setGridRows, setGridMode, setCropMode, setCropBox } = setters;
  const { curState, renderList, pushHistory, clearRects, addRect } = sliceApi;

  // 把画布上所有参考线坐标重排写回 ref（拖动结束、拆分前调用）
  const syncGuidesFromCanvas = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const vs = [];
    const hs = [];
    for (const o of fc.getObjects()) {
      if (o.kind !== 'guide') continue;
      if (o.axis === 'v') vs.push(Math.round(o.left));
      else if (o.axis === 'h') hs.push(Math.round(o.top));
    }
    vGuidesRef.current = vs.sort((a, b) => a - b);
    hGuidesRef.current = hs.sort((a, b) => a - b);
    const st = curState();
    if (st) {
      st.gridGuides = {
        cols: gridColsRef.current,
        rows: gridRowsRef.current,
        v: [...vGuidesRef.current],
        h: [...hGuidesRef.current],
      };
    }
  }, [curState]);

  // 清除画布上的网格覆盖层（不动切片框）；重绘时保留参考线坐标。
  const clearGuides = useCallback((resetPositions = true) => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const o of fc.getObjects().filter((g) => (
      g.kind === 'guide' || g.kind === 'grid-boundary' || g.kind === 'grid-distance'
    ))) fc.remove(o);
    if (resetPositions) {
      vGuidesRef.current = [];
      hGuidesRef.current = [];
    }
  }, []);

  // 拖动参考线时，显示该轴全部相邻线（含两侧边框）之间的图片像素距离。
  const renderGuideDistances = useCallback((axis) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    const src = sourceRef.current;
    if (!fc || !fabric || !src) return;
    for (const o of fc.getObjects().filter((item) => item.kind === 'grid-distance')) fc.remove(o);

    const isVertical = axis === 'v';
    const size = isVertical ? src.canvas.width : src.canvas.height;
    const crossSize = isVertical ? src.canvas.height : src.canvas.width;
    const positions = fc.getObjects()
      .filter((item) => item.kind === 'guide' && item.axis === axis)
      .map((item) => Math.round(isVertical ? item.left : item.top))
      .sort((a, b) => a - b);
    const boundaries = [0, ...positions, size];

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      const distance = Math.max(0, end - start);
      const label = new fabric.Text(`${distance}px`, {
        left: isVertical ? (start + end) / 2 : Math.min(8, crossSize / 2),
        top: isVertical ? Math.min(8, crossSize / 2) : (start + end) / 2,
        originX: isVertical ? 'center' : 'left',
        originY: isVertical ? 'top' : 'center',
        fontSize: 13,
        fontWeight: 'bold',
        fill: '#111827',
        backgroundColor: 'rgba(254, 240, 138, 0.92)',
        padding: 3,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
      label.kind = 'grid-distance';
      fc.add(label);
    }
    fc.requestRenderAll();
  }, []);

  const clearGuideDistances = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    for (const o of fc.getObjects().filter((item) => item.kind === 'grid-distance')) fc.remove(o);
    fc.requestRenderAll();
  }, []);

  // 在当前图片上渲染网格边界，并按 vGuidesRef/hGuidesRef 绘制内部参考线。
  const renderGuides = useCallback(() => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    const src = sourceRef.current;
    if (!fc || !fabric || !src) return;
    clearGuides(false);
    const iw = src.canvas.width;
    const ih = src.canvas.height;
    const boundary = new fabric.Rect({
      left: 0, top: 0, width: iw, height: ih,
      fill: 'rgba(234,179,8,0.04)', stroke: '#eab308', strokeWidth: 2,
      strokeDashArray: [6, 4], selectable: false, evented: false,
      objectCaching: false,
    });
    boundary.kind = 'grid-boundary';
    fc.add(boundary);
    const mkLine = (x1, y1, x2, y2, axis) => {
      // fabric.Line 的 left/top 是包围盒左上角，构造时 x1==x2 的垂直线 left 即为 x1
      const line = new fabric.Line([x1, y1, x2, y2], {
        stroke: '#eab308', strokeWidth: 2, selectable: true, evented: true,
        hasControls: false, hasBorders: false, hoverCursor: axis === 'v' ? 'ew-resize' : 'ns-resize',
        objectCaching: false,
      });
      line.kind = 'guide';
      line.axis = axis;
      // 单轴锁定：垂直线只允许水平移动，水平线只允许垂直移动
      if (axis === 'v') {
        line.set({ lockMovementY: true, lockScalingY: true, lockScalingX: true, lockRotation: true });
      } else {
        line.set({ lockMovementX: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
      }
      fc.add(line);
    };
    for (const x of vGuidesRef.current) mkLine(x, 0, x, ih, 'v');
    for (const y of hGuidesRef.current) mkLine(0, y, iw, y, 'h');
    fc.renderAll();
  }, [clearGuides]);

  const restoreGridForCurrent = useCallback(() => {
    const src = sourceRef.current;
    const st = curState();
    if (!src || !st) return null;
    const guides = resolveGridGuides(
      st.gridGuides,
      src.canvas.width,
      src.canvas.height,
      gridColsRef.current,
      gridRowsRef.current,
    );
    gridColsRef.current = guides.cols;
    gridRowsRef.current = guides.rows;
    vGuidesRef.current = [...guides.v];
    hGuidesRef.current = [...guides.h];
    st.gridGuides = { ...guides, v: [...guides.v], h: [...guides.h] };
    setGridCols(guides.cols);
    setGridRows(guides.rows);
    renderGuides();
    return guides;
  }, [curState, renderGuides]);

  const buildGridBoxes = useCallback(() => {
    const src = sourceRef.current;
    if (!src) return [];
    return gridBoxesFromGuides(src.canvas.width, src.canvas.height, vGuidesRef.current, hGuidesRef.current);
  }, []);

  const applyGridSplit = useCallback(() => {
    if (!gridModeRef.current) return [];
    syncGuidesFromCanvas();
    const boxes = buildGridBoxes();
    const st = curState();
    if (st) st.rects = boxes;
    renderList();
    setStatus(`网格实时拆分：${boxes.length} 个切片`);
    return boxes;
  }, [syncGuidesFromCanvas, buildGridBoxes, curState, renderList]);

  const scheduleGridSplit = useCallback((immediate = false) => {
    const run = () => {
      gridSplitTimerRef.current = null;
      lastGridSplitAtRef.current = Date.now();
      applyGridSplit();
    };
    const throttleMs = gridSplitThrottleMs(gridColsRef.current, gridRowsRef.current);
    const remaining = throttleMs - (Date.now() - lastGridSplitAtRef.current);
    if (immediate || remaining <= 0) {
      if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
      run();
    } else if (!gridSplitTimerRef.current) {
      gridSplitTimerRef.current = setTimeout(run, remaining);
    }
  }, [applyGridSplit]);

  // 网格态切换图片或恢复对话框时，优先恢复该图片最后一次参考线位置。
  useEffect(() => {
    if (!gridMode || !sourceRef.current) return;
    restoreGridForCurrent();
    scheduleGridSplit(true);
  }, [activeUrl, gridMode, restoreGridForCurrent, scheduleGridSplit]);

  // 进入网格模式：优先恢复当前图片上次参考线，没有快照时按行列均分。
  const enterGridMode = useCallback(() => {
    const fc = fcRef.current;
    const src = sourceRef.current;
    if (!fc || !src) return;
    pushHistory();
    clearRects();
    clearGuides();
    fc.selection = false;
    fc.defaultCursor = 'default';
    fc.hoverCursor = 'default';
    if (cropDraftRef.current) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
    cropModeRef.current = false;
    setCropMode(false);
    setCropBox(null);
    gridModeRef.current = true;
    setGridMode(true);
    restoreGridForCurrent();
    scheduleGridSplit(true);
  }, [pushHistory, clearRects, clearGuides, restoreGridForCurrent, scheduleGridSplit]);

  // 退出网格模式：固化最后一次实时拆分结果为普通切片框。
  const exitGridMode = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
    gridSplitTimerRef.current = null;
    const boxes = applyGridSplit();
    clearGuides();
    clearRects();
    for (const box of boxes) addRect(box);
    gridModeRef.current = false;
    setGridMode(false);
    // 恢复绘制模式的光标/选择态
    const inDraw = drawModeRef.current;
    for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
    fc.selection = !inDraw;
    fc.defaultCursor = inDraw ? 'crosshair' : 'default';
    fc.hoverCursor = inDraw ? 'crosshair' : 'move';
    fc.renderAll();
    renderList();
    setStatus(`已退出网格模式，保留 ${boxes.length} 个切片`);
  }, [applyGridSplit, clearGuides, clearRects, addRect, renderList]);

  // 顶部网格按钮直接切换模式。
  const toggleGridMode = useCallback((force) => {
    const target = typeof force === 'boolean' ? force : !gridModeRef.current;
    if (target === gridModeRef.current) return;
    if (target) {
      enterGridMode();
    } else {
      exitGridMode();
      setStatus('已退出网格模式');
    }
  }, [enterGridMode, exitGridMode]);

  // 网格参数变化：重置为均分位置并立即刷新实时切片。
  const applyGridSize = useCallback((cols, rows) => {
    const c = normalizeGridCount(cols, 1);
    const r = normalizeGridCount(rows, 1);
    setGridCols(c);
    setGridRows(r);
    gridColsRef.current = c;
    gridRowsRef.current = r;
    const src = sourceRef.current;
    if (!src) return;
    vGuidesRef.current = evenlySpacedGuides(src.canvas.width, c);
    hGuidesRef.current = evenlySpacedGuides(src.canvas.height, r);
    const st = curState();
    if (st) st.gridGuides = { cols: c, rows: r, v: [...vGuidesRef.current], h: [...hGuidesRef.current] };
    renderGuides();
    scheduleGridSplit(true);
  }, [curState, renderGuides, scheduleGridSplit]);

  return {
    syncGuidesFromCanvas, clearGuides,
    renderGuideDistances, clearGuideDistances, renderGuides,
    restoreGridForCurrent, buildGridBoxes, applyGridSplit, scheduleGridSplit,
    enterGridMode, exitGridMode, toggleGridMode, applyGridSize,
  };
}
