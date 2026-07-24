import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label, ScrollArea, Loader,
  ResizablePanelGroup, ResizablePanel, ResizableHandle,
} from '@agent-spaces/ui';
import { getFabric } from '../utils/image-ops/cdn';
import {
  loadImageSource, detect, exportBox, sampleColor, cornerColor, toHex,
} from '../utils/image-ops/sprite-splitter';

/**
 * UI 拆分对话框：用 fabric.js 在画布上框选区域 + 自动检测连通域，
 * 把每个框导出成一张切片图，上传后回传给节点。
 *
 * 复刻自 sprite-splitter-web（fabric@5.3.0 + SpriteSplitter 算法），UI 改用 agent-spaces/ui 美化：
 * - 顶部工具条：检测方法/容差/最小面积/边距/吸色/撤销重做/自动检测
 * - 中部：fabric 画布（滚轮缩放、空格拖拽平移、Alt 拉框新建、选中拖拽缩放）
 * - 右侧：切片预览网格 + 下载
 * - 底部：保存全部到节点
 *
 * 交互（保留原行为）：
 * - 滚轮缩放；按住空格拖拽平移；Alt+左键拉框新建切片框
 * - 选中切片框可拖动/缩放
 * - Ctrl+Z / Ctrl+Y(Ctrl+Shift+Z) 撤销/重做
 * - 吸色棒：点击画布取色作为 picked 背景色
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图 URL（节点传入，取首张）
 * @param {(urls: string[]) => void} props.onSave 切片上传完成回调
 * @param {() => void} props.onClose
 */
export default function UiSplitterDialog({ open, inputImages, onSave, onClose }) {
  const stageRef = useRef(null);            // fabric 容器 DOM
  const fcRef = useRef(null);               // fabric.Canvas 实例
  const sourceRef = useRef(null);           // { image, canvas, ctx, imageData }
  const fabricLibRef = useRef(null);        // fabric 命名空间
  // 模式/状态用 ref（fabric 回调闭包读最新值）
  const spaceDownRef = useRef(false);
  const panningRef = useRef(false);
  const lastPanRef = useRef(null);
  const pickingRef = useRef(false);
  const drawingRef = useRef(false);
  const startRef = useRef(null);
  const draftRef = useRef(null);
  const applyingHistoryRef = useRef(false);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const pickedColorRef = useRef([239, 26, 239]);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // 受控表单状态（仅驱动 UI 显示，fabric 逻辑直接读 ref/getter）
  const [method, setMethod] = useState('corner');
  const [tolerance, setTolerance] = useState(70);
  const [minArea, setMinArea] = useState(500);
  const [padding, setPadding] = useState(2);
  const [pickedHex, setPickedHex] = useState(toHex(pickedColorRef.current));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('选择图片开始。滚轮缩放，空格拖拽，Alt 拉框。');
  const [loading, setLoading] = useState(false);   // fabric 库/图片加载
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const imageUrl = (inputImages || [])[0] || '';

  // 当前选项快照（fabric 闭包用）
  const optionsRef = useRef({});
  const computeOptions = useCallback(() => {
    const opts = {
      method,
      tolerance: Number(tolerance) || 0,
      minArea: Number(minArea) || 0,
      padding: Number(padding) || 0,
    };
    if (method === 'picked') opts.backgroundColor = pickedColorRef.current;
    optionsRef.current = opts;
    return opts;
  }, [method, tolerance, minArea, padding]);
  useEffect(() => { computeOptions(); }, [computeOptions]);

  // ===== fabric 切片框辅助 =====
  // 声明顺序严格按依赖自上而下：被依赖的先定义，避免 useCallback deps 在初始化时触发 TDZ。
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
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const pushHistory = useCallback(() => {
    if (applyingHistoryRef.current) return;
    undoStackRef.current.push(snapshot());
    redoStackRef.current.length = 0;
    updateHistoryButtons();
  }, [snapshot, updateHistoryButtons]);

  // 右侧预览列表（被 applySnapshot/runDetect/bindFabricEvents 引用，先定义）
  const [previews, setPreviews] = useState([]); // [{ name, url }]
  const renderList = useCallback(() => {
    const source = sourceRef.current;
    if (!source) { setPreviews([]); setCount(0); return; }
    const boxes = rects().map(realBox);
    setCount(boxes.length);
    const items = boxes.map((box, i) => {
      const canvas = exportBox(source.imageData, box, computeOptions());
      const name = `element_${String(i + 1).padStart(2, '0')}_${Math.round(box.width)}x${Math.round(box.height)}.png`;
      return { name, url: canvas.toDataURL('image/png') };
    });
    setPreviews(items);
  }, [rects, realBox, computeOptions]);

  const applySnapshot = useCallback((boxes) => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    applyingHistoryRef.current = true;
    clearRects();
    boxes.forEach((box) => addRect(box));
    applyingHistoryRef.current = false;
    fc.renderAll();
    renderList();
    updateHistoryButtons();
  }, [clearRects, addRect, renderList, updateHistoryButtons]);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) return;
    redoStackRef.current.push(snapshot());
    applySnapshot(undoStackRef.current.pop());
  }, [snapshot, applySnapshot]);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) return;
    undoStackRef.current.push(snapshot());
    applySnapshot(redoStackRef.current.pop());
  }, [snapshot, applySnapshot]);

  const setColor = useCallback((color) => {
    pickedColorRef.current = color;
    setPickedHex(toHex(color));
  }, []);

  // ===== 自动检测 =====
  const runDetect = useCallback(() => {
    const fc = fcRef.current;
    const source = sourceRef.current;
    if (!fc || !source) return;
    pushHistory();
    clearRects();
    const boxes = detect(source.imageData, computeOptions());
    boxes.forEach(addRect);
    fc.renderAll();
    renderList();
    setStatus(`已检测 ${boxes.length} 个区域`);
  }, [pushHistory, clearRects, computeOptions, addRect, renderList]);

  // ===== 打开对话框：加载 fabric + 图片 =====
  useEffect(() => {
    if (!open || !imageUrl) return;
    let disposed = false;
    setLoading(true);
    setError('');
    setStatus('正在加载编辑器…');

    (async () => {
      try {
        const fabric = await getFabric();
        if (disposed) return;
        fabricLibRef.current = fabric;
        const source = await loadImageSource(imageUrl);
        if (disposed) return;
        sourceRef.current = source;
        // 四角色作为默认背景色估计
        setColor(cornerColor(source.imageData));

        // 初始化 fabric.Canvas（挂到 stage 容器内的 <canvas>
        const el = stageRef.current?.querySelector('canvas');
        if (!el) throw new Error('画布 DOM 未就绪');
        // 销毁旧实例（重复打开兜底）
        try { fcRef.current?.dispose?.(); } catch {}
        const fc = new fabric.Canvas(el, {
          selection: true,
          preserveObjectStacking: true,
          backgroundColor: '#0f172a',
        });
        fcRef.current = fc;
        fc.setWidth(source.canvas.width);
        fc.setHeight(source.canvas.height);
        fabric.Image.fromURL(source.canvas.toDataURL('image/png'), (img) => {
          if (disposed) return;
          img.selectable = false;
          img.evented = false;
          fc.setBackgroundImage(img, fc.renderAll.bind(fc));
        });

        bindFabricEvents(fc, fabric);
        setLoading(false);
        setStatus('编辑器就绪。滚轮缩放，空格拖拽，Alt 拉框新建切片。');
        // 自动跑一次检测
        setTimeout(() => { if (!disposed) runDetect(); }, 50);
      } catch (err) {
        console.error('[ui-splitter] init failed:', err);
        if (!disposed) {
          setLoading(false);
          setError(err?.message || String(err));
        }
      }
    })();

    return () => {
      disposed = true;
      try { fcRef.current?.dispose?.(); } catch {}
      fcRef.current = null;
      sourceRef.current = null;
      fabricLibRef.current = null;
      undoStackRef.current = [];
      redoStackRef.current = [];
      spaceDownRef.current = false;
      panningRef.current = false;
      drawingRef.current = false;
      pickingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageUrl]);

  // 重置预览/计数（打开时）
  useEffect(() => {
    if (open) {
      setPreviews([]);
      setCount(0);
      setSavedCount(0);
      setCanUndo(false);
      setCanRedo(false);
    }
  }, [open]);

  // ===== fabric 事件绑定（单独函数，避免重建 fc 时回调读旧闭包） =====
  // 所有状态读 ref，回调间共享同一份逻辑
  const bindFabricEvents = useCallback((fc, fabric) => {
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
        setStatus(`已吸取背景色 ${toHex(pickedColorRef.current)}`);
        return;
      }
      if (!event.e.altKey) return;
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
    fc.on('object:moving', () => {
      if (!fc.__historyMoveStarted) { pushHistory(); fc.__historyMoveStarted = true; }
    });
    fc.on('object:scaling', () => {
      if (!fc.__historyScaleStarted) { pushHistory(); fc.__historyScaleStarted = true; }
    });
    fc.on('object:modified', () => {
      fc.__historyMoveStarted = false;
      fc.__historyScaleStarted = false;
      renderList();
    });
  }, [pushHistory, renderList, setColor]);

  // ===== 键盘：空格平移 / Ctrl+Z 撤销 / Ctrl+Y(Ctrl+Shift+Z) 重做 =====
  // 挂到 window（fabric canvas 不接收焦点），焦点在表单控件时不拦截
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      const t = e.target;
      const tag = t?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
      if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) {
        e.preventDefault(); redo(); return;
      }
      if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault(); undo(); return;
      }
      if (e.code !== 'Space' || inField) return;
      e.preventDefault();
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
        fc.selection = true;
        for (const r of fc.getObjects().filter((o) => o.kind === 'slice')) r.selectable = true;
        fc.defaultCursor = 'default';
      }
      spaceDownRef.current = false;
      panningRef.current = false;
      lastPanRef.current = null;
      stageRef.current?.classList.remove('is-panning');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [open, undo, redo]);

  // ===== 保存：每张切片转 Blob 上传 =====
  const handleSave = useCallback(async () => {
    const source = sourceRef.current;
    const AS = window.AgentSpaces;
    if (!source || !AS?.uploadFile) { setError('无可保存切片或宿主 uploadFile 不可用'); return; }
    const boxes = rects().map(realBox);
    if (!boxes.length) { setError('没有切片框，先自动检测或 Alt 拉框'); return; }
    setSaving(true);
    setSavedCount(0);
    setError('');
    const urls = [];
    try {
      for (let i = 0; i < boxes.length; i++) {
        const canvas = exportBox(source.imageData, boxes[i], computeOptions());
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        const file = new File([blob], `element_${String(i + 1).padStart(2, '0')}.png`, { type: 'image/png' });
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
  }, [rects, realBox, computeOptions, onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: '94vw', maxWidth: '94vw', maxHeight: '94vh', height: '94vh' }}
      >
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-4 py-2 !gap-0">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm">🧩 UI 拆分编辑器</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              自动检测 + 手动框选切片
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || count === 0}>
              {saving ? `保存中 ${savedCount}/${count}` : `保存 ${count} 张切片`}
            </Button>
          </div>
        </DialogHeader>

        {/* 工具条 */}
        <div className="grid grid-cols-2 gap-2 border-b border-border bg-muted/30 px-4 py-3 sm:grid-cols-4 lg:grid-cols-7">
          <Field label="检测方法">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            >
              <option value="corner">四角背景色</option>
              <option value="picked">吸取背景色</option>
              <option value="alpha">Alpha 非透明</option>
              <option value="brightness">暗色前景</option>
            </select>
          </Field>
          <Field label={`容差 ${tolerance}`}>
            <Input type="number" min={0} max={765} value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              className="h-8" />
          </Field>
          <Field label={`最小面积 ${minArea}`}>
            <Input type="number" min={1} value={minArea}
              onChange={(e) => setMinArea(e.target.value)}
              className="h-8" />
          </Field>
          <Field label={`边距 ${padding}`}>
            <Input type="number" min={0} value={padding}
              onChange={(e) => setPadding(e.target.value)}
              className="h-8" />
          </Field>
          <Field label="背景色">
            <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-2">
              <span className="h-4 w-4 rounded border border-border" style={{ background: pickedHex }} />
              <span className="text-[11px] text-muted-foreground">{pickedHex}</span>
            </div>
          </Field>
          <div className="flex items-end gap-1.5">
            <Button size="sm" variant="outline" className="h-8 flex-1"
              onClick={() => { pickingRef.current = true; setStatus('点击画布上的背景色'); }}>
              💧 吸色
            </Button>
            <Button size="sm" variant="outline" className="h-8 flex-1" disabled={canUndo === false}
              onClick={undo}>
              ↶ 撤销
            </Button>
            <Button size="sm" variant="outline" className="h-8 flex-1" disabled={canRedo === false}
              onClick={redo}>
              ↷ 重做
            </Button>
          </div>
          <div className="flex items-end">
            <Button size="sm" className="h-8 w-full" onClick={runDetect} disabled={loading}>
              ✨ 自动检测
            </Button>
          </div>
        </div>

        {error && (
          <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-500">{error}</p>
        )}
        {status && (
          <p className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">{status}</p>
        )}

        {/* 主区：左侧 fabric 画布 + 右侧切片结果（可拖拽调宽） */}
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          {/* 左：fabric 画布。
              fabric@5 会在 <canvas> 外套 .canvas-container（display:inline-block，固定宽高）。
              通过 CSS 让该 wrapper 撑满父容器并居中，fabric 内部 canvas 仍按图片像素固定，
              超出部分由 .ui-splitter-stage 的 overflow-auto 滚动查看。 */}
          <ResizablePanel id="split-stage" order={1} minSize="40%">
            <div className="relative h-full min-h-0 overflow-hidden bg-muted/20">
              <div
                ref={stageRef}
                className="ui-splitter-stage h-full w-full overflow-auto"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <canvas />
              </div>
              {/* fabric 生成的 .canvas-container 居中后撑满视觉区域 */}
              <style>{`
                .ui-splitter-stage .canvas-container {
                  margin: auto !important;
                  max-width: 100% !important;
                  max-height: 100% !important;
                }
              `}</style>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Loader className="mr-2 h-4 w-4" />
                  <span className="text-sm text-muted-foreground">加载编辑器…</span>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle />

          {/* 右：切片结果 */}
          <ResizablePanel id="split-result" order={2} minSize="20%" maxSize="55%" defaultSize="28%">
            <aside className="flex h-full min-h-0 flex-col border-l border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-medium">切片 {count}</span>
                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={renderList} disabled={loading}>
                  刷新预览
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-1">
                  {previews.length === 0 && (
                    <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                      {loading ? '加载中…' : '无切片。点「自动检测」或 Alt 拉框'}
                    </p>
                  )}
                  {previews.map((it, i) => (
                    <div key={i} className="overflow-hidden rounded-md border border-border bg-background">
                      <div className="flex min-h-[120px] items-center justify-center bg-[conic-gradient(#e2e8f0_25%,transparent_0_50%,#e2e8f0_0_75%,transparent_0)] [background-size:16px_16px] p-2">
                        <img src={it.url} alt={it.name} className="max-h-[110px] max-w-full object-contain" />
                      </div>
                      <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px]">
                        <span className="truncate text-muted-foreground" title={it.name}>{it.name}</span>
                        <a href={it.url} download={it.name}
                          className="shrink-0 font-medium text-primary hover:underline">下载</a>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </aside>
          </ResizablePanel>
        </ResizablePanelGroup>

        <div className="border-t border-border bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground">
          滚轮缩放 · 按住 <kbd className="rounded border border-border bg-background px-1">空格</kbd> 拖拽平移 ·
          按住 <kbd className="rounded border border-border bg-background px-1">Alt</kbd> 拉框新建切片 ·
          <kbd className="rounded border border-border bg-background px-1">Ctrl+Z</kbd> 撤销
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <Label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </Label>
  );
}
