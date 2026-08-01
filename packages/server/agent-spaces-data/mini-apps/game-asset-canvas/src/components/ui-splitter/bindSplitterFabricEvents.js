import { sampleColor, toHex } from '../../utils/image-ops/sprite-splitter';

/**
 * 绑定 fabric 画布事件（wheel/mouse/object）。
 * 普通函数（非 hook），由主文件 fabric 初始化时调用一次。
 *
 * @param {object} fc       fabric.Canvas 实例
 * @param {object} fabric   fabric 命名空间
 * @param {object} ctx
 *   refs: { sourceRef, spaceDownRef, panningRef, lastPanRef, pickingRef, drawingRef, startRef,
 *           draftRef, stageRef, cropModeRef, croppingRef, cropStartRef, cropDraftRef, cropSizeLabelRef,
 *           gridModeRef, drawModeRef }
 *   setters: { setMethod, setStatus, setCropBox }
 *   callbacks: { pushHistory, renderList, setColor, curState, scheduleGridSplit,
 *                renderGuideDistances, clearGuideDistances }
 */
export default function bindSplitterFabricEvents(fc, fabric, ctx) {
  const { refs, setters, callbacks } = ctx;
  const {
    sourceRef, spaceDownRef, panningRef, lastPanRef, pickingRef, drawingRef, startRef,
    draftRef, stageRef, cropModeRef, croppingRef, cropStartRef, cropDraftRef, cropSizeLabelRef,
    gridModeRef, drawModeRef,
  } = refs;
  const { setMethod, setStatus, setCropBox } = setters;
  const {
    pushHistory, renderList, setColor, curState, scheduleGridSplit,
    renderGuideDistances, clearGuideDistances,
  } = callbacks;

  const pointerPoint = (event) => {
    const p = fc.getPointer(event.e);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  };

  const setPanMode = (enabled) => {
    spaceDownRef.current = enabled;
    stageRef.current?.classList.toggle('is-panning', enabled);
    fc.selection = !enabled;
    for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !enabled;
    fc.defaultCursor = enabled ? 'grab' : 'default';
  };

  fc.on('mouse:wheel', (event) => {
    if (!sourceRef.current) return;
    let zoom = fc.getZoom() * Math.pow(0.999, event.e.deltaY);
    zoom = Math.max(0.1, Math.min(6, zoom));
    fc.zoomToPoint({ x: event.e.offsetX, y: event.e.offsetY }, zoom);
    event.e.preventDefault();
    event.e.stopPropagation();
  });

  fc.on('mouse:down', (event) => {
    if (!sourceRef.current) return;
    if (spaceDownRef.current) {
      panningRef.current = true;
      lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
      fc.defaultCursor = 'grabbing';
      return;
    }
    const p = pointerPoint(event);
    if (pickingRef.current) {
      setColor(sampleColor(sourceRef.current.imageData, p.x, p.y));
      setMethod('picked');
      pickingRef.current = false;
      setStatus(`已吸取背景色 ${toHex(curState()?.pickedColor)}`);
      return;
    }
    // 裁切模式：左键点空白启动裁切拉框（不进切片 undo 栈）。点中已有对象（参考线/切片框）放行给 fabric。
    if (cropModeRef.current && !event.target) {
      croppingRef.current = true;
      cropStartRef.current = p;
      // 清除上一个未应用的裁切框
      if (cropDraftRef.current) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      if (cropSizeLabelRef.current) { fc.remove(cropSizeLabelRef.current); cropSizeLabelRef.current = null; }
      cropDraftRef.current = new fabric.Rect({
        left: p.x, top: p.y, width: 1, height: 1,
        fill: 'rgba(234,179,8,0.08)', stroke: '#eab308', strokeWidth: 2,
        strokeDashArray: [6, 4], objectCaching: false,
        selectable: false, evented: false,
      });
      cropDraftRef.current.kind = 'crop';
      fc.add(cropDraftRef.current);
      cropSizeLabelRef.current = new fabric.Text('1 × 1 px', {
        left: p.x, top: p.y, originX: 'center', originY: 'center',
        fontSize: 13, fontWeight: 'bold', fill: '#111827',
        backgroundColor: 'rgba(254, 240, 138, 0.92)', padding: 3,
        selectable: false, evented: false, objectCaching: false,
      });
      cropSizeLabelRef.current.kind = 'crop-size';
      fc.add(cropSizeLabelRef.current);
      setCropBox(null);
      return;
    }
    // 网格模式下禁止切片拉框（参考线独占交互）
    if (gridModeRef.current) return;
    // 绘制模式：左键点空白 或 任意模式下 Alt+左键 都拉框新建。
    // 点中已有切片框（event.target 存在）时不拦截，交给 fabric 选择/移动。
    const wantDraw = (drawModeRef.current && !event.target) || event.e.altKey;
    if (!wantDraw) return;
    pushHistory();
    drawingRef.current = true;
    startRef.current = p;
    draftRef.current = new fabric.Rect({
      left: p.x, top: p.y, width: 1, height: 1,
      fill: 'rgba(0,0,0,0)', stroke: '#f97316', strokeWidth: 2, objectCaching: false,
    });
    draftRef.current.kind = 'slice';
    fc.add(draftRef.current);
  });

  fc.on('mouse:move', (event) => {
    if (panningRef.current && lastPanRef.current) {
      const vpt = fc.viewportTransform;
      vpt[4] += event.e.clientX - lastPanRef.current.x;
      vpt[5] += event.e.clientY - lastPanRef.current.y;
      lastPanRef.current = { x: event.e.clientX, y: event.e.clientY };
      fc.requestRenderAll();
      return;
    }
    // 裁切框尺寸更新
    if (croppingRef.current && cropDraftRef.current) {
      const p = pointerPoint(event);
      const s = cropStartRef.current;
      const left = Math.min(s.x, p.x);
      const top = Math.min(s.y, p.y);
      const width = Math.abs(p.x - s.x);
      const height = Math.abs(p.y - s.y);
      cropDraftRef.current.set({ left, top, width, height });
      cropSizeLabelRef.current?.set({
        text: `${Math.round(width)} × ${Math.round(height)} px`,
        left: left + width / 2,
        top: top + height / 2,
      });
      fc.renderAll();
      return;
    }
    if (!drawingRef.current || !draftRef.current) return;
    const p = pointerPoint(event);
    const s = startRef.current;
    draftRef.current.set({
      left: Math.min(s.x, p.x),
      top: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    });
    fc.renderAll();
  });

  fc.on('mouse:up', () => {
    if (panningRef.current) {
      panningRef.current = false;
      lastPanRef.current = null;
      fc.defaultCursor = spaceDownRef.current ? 'grab' : 'default';
      return;
    }
    // 裁切框松开：太小则丢弃，否则保留并驱动确认条
    if (croppingRef.current) {
      croppingRef.current = false;
      const d = cropDraftRef.current;
      if (cropSizeLabelRef.current) { fc.remove(cropSizeLabelRef.current); cropSizeLabelRef.current = null; }
      if (!d) return;
      if (d.width < 2 || d.height < 2) {
        fc.remove(d); cropDraftRef.current = null; setCropBox(null); fc.renderAll(); return;
      }
      setCropBox({ x: d.left, y: d.top, width: d.width, height: d.height });
      setStatus(`已选择裁切范围 ${Math.round(d.width)}×${Math.round(d.height)}，点【应用裁切】确认`);
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const d = draftRef.current;
    draftRef.current = null;
    if (!d) return;
    if (d.width < 2 || d.height < 2) { fc.remove(d); return; }
    d.set({ stroke: '#0ea5e9' });
    renderList();
  });

  // 拖动/缩放切片框时记录历史（一次操作一条）
  // 参考线拖动时 clamp 到图片范围并实时同步到 vGuidesRef/hGuidesRef
  fc.on('object:moving', (event) => {
    const t = event?.target;
    if (t?.kind === 'guide' && sourceRef.current) {
      const iw = sourceRef.current.canvas.width;
      const ih = sourceRef.current.canvas.height;
      if (t.axis === 'v') {
        // 垂直线，只能左右移：left 是线中心，fabric.Line 用 [x1,y1,x2,y2] 构造，移动后 left 表征中心
        const inset = iw > 2 ? 1 : 0;
        const clamped = Math.max(inset, Math.min(iw - inset, t.left));
        t.set({ left: clamped });
      } else if (t.axis === 'h') {
        const inset = ih > 2 ? 1 : 0;
        const clamped = Math.max(inset, Math.min(ih - inset, t.top));
        t.set({ top: clamped });
      }
      renderGuideDistances(t.axis);
      scheduleGridSplit();
      return;
    }
    if (!fc.__historyMoveStarted) { pushHistory(); fc.__historyMoveStarted = true; }
  });
  fc.on('object:scaling', () => {
    if (!fc.__historyScaleStarted) { pushHistory(); fc.__historyScaleStarted = true; }
  });
  fc.on('object:modified', (event) => {
    const t = event?.target;
    if (t?.kind === 'guide') {
      // 松手立即补最后一次，确保节流期间的最终位置不丢失。
      clearGuideDistances();
      scheduleGridSplit(true);
      fc.__historyMoveStarted = false;
      fc.__historyScaleStarted = false;
      return;
    }
    fc.__historyMoveStarted = false;
    fc.__historyScaleStarted = false;
    renderList();
  });
}
