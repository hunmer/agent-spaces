import { useCallback } from 'react';
import { exportBox, loadImageSource, cornerColor, toHex } from '../../utils/image-ops/sprite-splitter';

/**
 * UiSplitterDialog 裁切 hook：拉框选范围 → 应用裁切（上传替换原图）/ 取消 / 模式切换。
 *
 * @param {object} ctx
 *   refs: { fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef,
 *           onDataChangeRef, onReplaceImageRef, cropModeRef, cropDraftRef,
 *           gridModeRef, gridSplitTimerRef, drawModeRef }
 *   state: { cropBox, gridOnly }
 *   setters: { setCropBusy, setError, setStatus, setThumbUrls, setActiveUrl,
 *              setCropMode, setCropBox, setPickedHex }
 *   deps: { fitToStage, renderList, updateHistoryButtons, enterGridMode, syncGuidesFromCanvas }
 */
export default function useSplitterCrop(ctx) {
  const { refs, state, setters, deps } = ctx;
  const {
    fcRef, fabricLibRef, sourceRef, imageStatesRef, activeUrlRef,
    onDataChangeRef, onReplaceImageRef, cropModeRef, cropDraftRef,
    gridModeRef, gridSplitTimerRef, drawModeRef,
  } = refs;
  const { cropBox, gridOnly } = state;
  const {
    setCropBusy, setError, setStatus, setThumbUrls, setActiveUrl,
    setCropMode, setCropBox, setPickedHex,
  } = setters;
  const { fitToStage, renderList, updateHistoryButtons, enterGridMode, syncGuidesFromCanvas } = deps;

  // 应用裁切：导出裁切区域 → 上传 → 替换/追加原图 → 重建 source
  const applyCrop = useCallback(async () => {
    const AS = window.AgentSpaces;
    const box = cropBox;
    const src = sourceRef.current;
    if (!AS?.uploadFile || !box || !src) return;
    const url = activeUrlRef.current;
    if (!url) return;
    setCropBusy(true);
    setError('');
    setStatus('正在裁切并上传…');
    try {
      // 导出裁切区域（不透明背景，避免被 exportBox 的背景色替换逻辑影响）
      const canvas = exportBox(src.imageData, box, { transparent: false });
      const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
      if (!blob) throw new Error('裁切导出失败');
      const file = new File([blob], `crop_${Date.now()}.png`, { type: 'image/png' });
      const uploaded = await AS.uploadFile(file);
      const httpUrl = uploaded?.url || uploaded?.httpPath;
      if (!httpUrl) throw new Error('裁切结果上传失败');
      // 通知节点替换原图（uploadedImages 原地替换；若为上游只读图则节点内追加为上传图）
      const replaced = onReplaceImageRef.current?.(url, httpUrl);
      // 重建该图 source（含新 imageData/canvas），用新 URL 作为 imageStates 的键以保持一致性
      const newSource = await loadImageSource(httpUrl);
      // 更新 imageStates：旧 key 删除，新 key 写入（URL 变了，键也要换）
      delete imageStatesRef.current[url];
      imageStatesRef.current[httpUrl] = {
        source: newSource,
        pickedColor: cornerColor(newSource.imageData),
        undo: [],
        redo: [],
        rects: [],
      };
      // 同步 thumbUrls / activeUrl 到新 URL
      setThumbUrls((prev) => prev.map((u) => (u === url ? httpUrl : u)));
      activeUrlRef.current = httpUrl;
      setActiveUrl(httpUrl);
      sourceRef.current = newSource;
      // 刷新 fabric 背景图
      const fabric = fabricLibRef.current;
      const fc = fcRef.current;
      if (fabric && fc) {
        fabric.Image.fromURL(newSource.canvas.toDataURL('image/png'), (img) => {
          img.selectable = false;
          img.evented = false;
          fc.setBackgroundImage(img, () => {
            fitToStage();
            fc.renderAll();
          });
        });
      }
      // 清裁切框 + 退出裁切模式
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      cropModeRef.current = false;
      setCropMode(false);
      setCropBox(null);
      updateHistoryButtons();
      renderList();
      setPickedHex(toHex(cornerColor(newSource.imageData)));
      // grid-only：裁切完成后自动回到网格模式（裁切会改图，重进网格按新图尺寸重建参考线）
      if (gridOnly) {
        enterGridMode();
      }
      // 裁切后输入图集合变化，清旧 splitData（遵守持久化规范）
      onDataChangeRef.current?.(null);
      setStatus(replaced === false ? '已裁切（上游只读图，结果已追加为新上传图）' : '已裁切并替换原图');
    } catch (err) {
      console.error('[ui-splitter] crop failed:', err);
      setError(err?.message || String(err));
    } finally {
      setCropBusy(false);
    }
  }, [cropBox, fitToStage, renderList, updateHistoryButtons, gridOnly, enterGridMode]);

  // 切换裁切模式：进入时退出网格；退出时清未应用的裁切框
  const toggleCropMode = useCallback(() => {
    const fc = fcRef.current;
    const next = !cropModeRef.current;
    if (next) {
      // 进入裁切：先清掉网格覆盖层（参考线+边界+切片框），让画布只剩背景图便于拉框。
      // grid-only 下不走 exitGridMode（它会把切片框画回去）；参考线坐标已固化在 st.gridGuides，
      // 退出裁切回网格时 restoreGridForCurrent 会按新图尺寸重建。
      if (gridModeRef.current) {
        if (gridSplitTimerRef.current) clearTimeout(gridSplitTimerRef.current);
        gridSplitTimerRef.current = null;
        syncGuidesFromCanvas();          // 固化当前参考线到 state（含 cols/rows/v/h）
        gridModeRef.current = false;
        ctx.setters.setGridMode(false);
      }
      if (fc) {
        // 清掉所有网格/切片覆盖对象，只留背景图
        for (const o of fc.getObjects().filter((g) => g.kind === 'guide' || g.kind === 'grid-boundary' || g.kind === 'slice')) fc.remove(o);
        fc.selection = false;
        fc.defaultCursor = 'crosshair';
        fc.hoverCursor = 'crosshair';
        fc.renderAll();
      }
      // 清未应用裁切框
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      setCropBox(null);
      setStatus('裁切模式：在图上拉框选择范围，松开后点【应用裁切】');
    } else {
      // 退出裁切：grid-only 回网格；否则恢复绘制/选择态
      if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
      setCropBox(null);
      if (gridOnly) {
        cropModeRef.current = false;
        setCropMode(false);
        enterGridMode();
        return;
      }
      if (fc) {
        const inDraw = drawModeRef.current;
        for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
        fc.selection = !inDraw;
        fc.defaultCursor = inDraw ? 'crosshair' : 'default';
        fc.hoverCursor = inDraw ? 'crosshair' : 'move';
      }
      setStatus('');
    }
    cropModeRef.current = next;
    setCropMode(next);
  }, [syncGuidesFromCanvas, gridOnly, enterGridMode]);

  // 取消裁切（确认条 ✖）
  const cancelCrop = useCallback(() => {
    const fc = fcRef.current;
    if (cropDraftRef.current && fc) { fc.remove(cropDraftRef.current); cropDraftRef.current = null; }
    setCropBox(null);
    cropModeRef.current = false;
    setCropMode(false);
    // grid-only：取消裁切后自动回到网格模式
    if (gridOnly) {
      enterGridMode();
      setStatus('已取消裁切');
      return;
    }
    if (fc) {
      const inDraw = drawModeRef.current;
      for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = !inDraw;
      fc.selection = !inDraw;
      fc.defaultCursor = inDraw ? 'crosshair' : 'default';
      fc.hoverCursor = inDraw ? 'crosshair' : 'move';
    }
    setStatus('已取消裁切');
  }, [gridOnly, enterGridMode]);

  return { applyCrop, toggleCropMode, cancelCrop };
}
