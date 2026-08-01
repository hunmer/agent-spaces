import { useCallback } from 'react';
import { exportBox } from '../../utils/image-ops/sprite-splitter';
import { hexToRgb } from '../../utils/ui-splitter-helpers';

/**
 * UiSplitterDialog 保存 + 轻量 toggle hook。
 *
 * @param {object} ctx
 *   refs: { fcRef, imageStatesRef, gridModeRef, exportEnabledRef, onSaveRef,
 *           drawModeRef, spaceDownRef, pickingRef }
 *   state: { thumbUrls, method, tolerance, minArea, padding }
 *   setters: { setError, setSaving, setSavedCount, setMethod, setDrawMode, setExportEnabled }
 *   props:  { onClose }
 *   deps:   { curState, snapshot, setColor, renderList }
 */
export default function useSplitterSave(ctx) {
  const { refs, state, setters, props, deps } = ctx;
  const {
    fcRef, imageStatesRef, gridModeRef, exportEnabledRef, onSaveRef,
    drawModeRef, spaceDownRef, pickingRef,
  } = refs;
  const { thumbUrls, method, tolerance, minArea, padding } = state;
  const { setError, setSaving, setSavedCount, setMethod, setDrawMode, setExportEnabled } = setters;
  const { onClose } = props;
  const { curState, snapshot, setColor, renderList } = deps;

  // 保存：把所有图的所有切片转 Blob 上传
  const handleSave = useCallback(async () => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) { setError('宿主 uploadFile 不可用'); return; }
    // 先把当前画布上的切片框同步回当前图 state（保证最新）
    const cur = curState();
    if (cur && !gridModeRef.current) cur.rects = snapshot();
    // 收集每张图的切片（跳过无切片框的图）
    const states = imageStatesRef.current;
    const tasks = [];
    thumbUrls.forEach((url, idx) => {
      const st = states[url];
      if (!st?.source) return;
      if (exportEnabledRef.current[url] === false) return; // 跳过禁用导出的图
      // st.rects 已是 box 对象（{x,y,width,height}），无需再 realBox
      const boxes = (st.rects || []).slice();
      if (!boxes.length) return;
      boxes.forEach((box, i) => tasks.push({ st, box, imgIdx: idx, sliceIdx: i }));
    });
    if (!tasks.length) { setError('没有切片框，先自动检测或 Alt 拉框'); return; }
    setSaving(true);
    setSavedCount(0);
    setError('');
    const urls = [];
    // 保存时按每图各自记录的背景色导出（picked 模式才用，其它模式 backgroundColor 不生效）
    const optsBase = { method, tolerance: Number(tolerance) || 0, minArea: Number(minArea) || 0, padding: Number(padding) || 0 };
    try {
      for (let n = 0; n < tasks.length; n++) {
        const { st, box, imgIdx, sliceIdx } = tasks[n];
        const opts = { ...optsBase };
        if (opts.method === 'picked') opts.backgroundColor = st.pickedColor;
        const canvas = exportBox(st.source.imageData, box, opts);
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        const file = new File(
          [blob],
          thumbUrls.length > 1
            ? `img${imgIdx + 1}_element_${String(sliceIdx + 1).padStart(2, '0')}.png`
            : `element_${String(sliceIdx + 1).padStart(2, '0')}.png`,
          { type: 'image/png' },
        );
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) { urls.push(httpUrl); setSavedCount(urls.length); }
      }
      if (!urls.length) throw new Error('全部切片上传失败');
      onSaveRef.current?.(urls);
      onClose?.();
    } catch (err) {
      console.error('[ui-splitter] save failed:', err);
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }, [curState, snapshot, thumbUrls, method, tolerance, minArea, padding, onClose]);

  // 吸色 / 背景色选择
  const togglePicking = useCallback(() => {
    pickingRef.current = !pickingRef.current;
    ctx.setters.setStatus(pickingRef.current ? '点击画布上的背景色' : '');
  }, []);
  const handlePickColor = useCallback((hex) => {
    setColor(hexToRgb(hex));
    setMethod('picked');
  }, [setColor]);

  // 切换绘制模式：true=左键拉框新建切片，false=左键选择/移动切片框
  const toggleDrawMode = useCallback(() => {
    const next = !drawModeRef.current;
    drawModeRef.current = next;
    setDrawMode(next);
    const fc = fcRef.current;
    if (fc && !spaceDownRef.current) {
      // 绘制模式：切片框不可选（避免点空白误选），光标十字；选择模式：切片框可选，光标默认
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !next;
      fc.selection = !next;
      fc.defaultCursor = next ? 'crosshair' : 'default';
      fc.hoverCursor = next ? 'crosshair' : 'move';
    }
  }, []);

  // 切换某图是否导出
  const toggleExport = useCallback((url, on) => {
    setExportEnabled((prev) => ({ ...prev, [url]: on }));
    // renderList 依赖 exportEnabledRef（下次渲染同步），这里手动触发一次计数刷新
    setTimeout(() => renderList(), 0);
  }, [renderList]);

  return { handleSave, togglePicking, handlePickColor, toggleDrawMode, toggleExport };
}
