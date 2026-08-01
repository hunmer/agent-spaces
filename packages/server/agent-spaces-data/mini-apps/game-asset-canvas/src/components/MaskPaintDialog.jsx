import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Label, Loader, ColorPicker,
} from '@agent-spaces/ui';
import { Undo2, Redo2, Trash2, SquarePen, Eraser, Lasso, Square, Download } from '@agent-spaces/ui';
import { getFabric } from '../utils/image-ops/cdn';

// 绘制颜色预设（ColorPicker 色板）
const COLOR_PRESETS = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

// 工具枚举
const TOOL_BRUSH = 'brush';
const TOOL_LASSO = 'lasso';
const TOOL_RECT = 'rect';
const TOOL_ERASE = 'erase';
const TOOLS = [
  { id: TOOL_BRUSH, label: '画笔', icon: SquarePen },
  { id: TOOL_LASSO, label: '套索', icon: Lasso },
  { id: TOOL_RECT, label: '矩形', icon: Square },
  { id: TOOL_ERASE, label: '橡皮', icon: Eraser },
];

// 输入签名：用于判断持久化快照是否可恢复（输入图列表变化则丢弃）
const inputSignature = (urls) => (urls || []).filter(Boolean).join('|');

/**
 * 蒙版绘制对话框：用 fabric.js 在底图上绘制蒙版（白色=选中区域）。
 *
 * 三种工具：
 * - 画笔（可调大小）：自由手绘白色粗笔触
 * - 自由套索：拖动画闭合多边形，松手自动闭合填充
 * - 矩形选区：拖动画矩形，松手填充
 * - 橡皮：画笔模式擦除（用背景图重绘 + 跳过该区域）
 *
 * 数据模型（存图片原始像素坐标，与画布缩放无关）：
 * 每图 { imgW, imgH, ops: [{type, points?, rect?}] }，op.type ∈ brush/lasso/rect。
 * 画笔/套索 points=[[x,y],...]；矩形 rect={x,y,w,h}。
 * undo/redo 按 op 为单位。
 *
 * 导出：黑底 canvas + 白色绘制所有 ops → PNG dataURL → uploadFile → onSave(urls)。
 *
 * 节点对话框数据持久化（handoff 约束 #15）：业务数据（每图 ops）经 onDataChange 写回 data.paintData。
 *
 * @param {boolean} props.open
 * @param {string[]} props.inputImages 输入图 URL
 * @param {object} [props.initialData] 节点持久化快照 { inputSignature, perImage: { [url]: {imgW,imgH,ops} } }
 * @param {'default'|'binary-mask'} [props.mode] 二值蒙版模式会把输入图作为初始蒙版并锁定白色绘制
 * @param {(data:object)=>void} [props.onDataChange]
 * @param {(urls:string[])=>void} props.onSave 蒙版上传完成回调
 * @param {()=>void} props.onClose
 */
export default function MaskPaintDialog({
  open, inputImages, initialData, mode = 'default', exportMode = 'black-white',
  onDataChange, onSave, onClose,
}) {
  const binaryMaskMode = mode === 'binary-mask';
  const binaryMaskModeRef = useRef(binaryMaskMode);
  binaryMaskModeRef.current = binaryMaskMode;
  // alpha 蒙版导出（GPT-Image 等）：涂出→alpha=0 可编辑，未涂→alpha=255 保留，RGB 全黑
  const alphaMaskExport = exportMode === 'alpha-mask';
  const alphaMaskExportRef = useRef(alphaMaskExport);
  alphaMaskExportRef.current = alphaMaskExport;
  const stageRef = useRef(null);          // fabric 容器 DOM
  const fcRef = useRef(null);             // fabric.Canvas 实例
  const fabricLibRef = useRef(null);      // fabric 命名空间
  const roRef = useRef(null);             // ResizeObserver
  // inputImages/initialData ref 镜像：避免父组件 onUpdate 导致引用变化触发 init effect 重跑（视图重置）
  const inputImagesRef = useRef(inputImages);
  inputImagesRef.current = inputImages;
  // 每图状态：imgStatesRef.current[url] = { img, imgW, imgH, ops, undo, redo }
  const imgStatesRef = useRef({});
  const activeUrlRef = useRef('');
  // 背景图变换（fabric 坐标 ↔ 图片像素坐标）
  const bgRef = useRef({ left: 0, top: 0, scaleX: 1, scaleY: 1, imgW: 1, imgH: 1 });
  // 工具/参数 ref（事件回调读 ref 拿最新值，避免重绑）
  const toolRef = useRef(TOOL_BRUSH);
  const brushSizeRef = useRef(24);
  const eraseSizeRef = useRef(36);
  const colorRef = useRef('#ffffff');
  const maskOverlayRef = useRef(null); // fabric Image：显示透明底蒙版预览层（叠加在底图上，橡皮实时挖洞可见）
  // 套索/矩形绘制临时状态
  const drawStateRef = useRef(null);      // { startX, startY, points, previewObj }
  // onUpdateRef/onSaveRef：避免闭包旧值
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [thumbUrls, setThumbUrls] = useState([]);
  // thumbUrls 的 ref 镜像：persist 读 ref 不依赖 state，避免 useCallback→useEffect 死循环
  const thumbUrlsRef = useRef([]);
  const setThumbUrlsSafe = useCallback((urls) => {
    thumbUrlsRef.current = urls;
    setThumbUrls(urls);
  }, []);
  const [tool, setTool] = useState(TOOL_BRUSH);
  const [brushSize, setBrushSize] = useState(24);
  const [eraseSize, setEraseSize] = useState(36);
  const [color, setColor] = useState('#ffffff'); // 绘制颜色（画笔/套索/矩形填充）
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ---- 坐标变换 ----
  const imgToCanvas = useCallback((px, py) => {
    const bg = bgRef.current;
    return { x: bg.left + px * bg.scaleX, y: bg.top + py * bg.scaleY };
  }, []);
  const canvasToImg = useCallback((cx, cy) => {
    const bg = bgRef.current;
    return { x: (cx - bg.left) / bg.scaleX, y: (cy - bg.top) / bg.scaleY };
  }, []);

  // ---- fit 底图到画布 ----
  const fitBg = useCallback(() => {
    const fc = fcRef.current;
    if (!fc) return;
    const bg = bgRef.current;
    const cw = fc.getWidth();
    const ch = fc.getHeight();
    const s = Math.min(cw / bg.imgW, ch / bg.imgH);
    const w = bg.imgW * s;
    const h = bg.imgH * s;
    bg.left = (cw - w) / 2;
    bg.top = (ch - h) / 2;
    bg.scaleX = s;
    bg.scaleY = s;
  }, []);

  // ---- 重绘当前图所有 ops 为白色 fabric 对象 ----
  // 用离屏 canvas 渲染所有 op（橡皮 destination-out 实时挖洞），再以 fabric.Image 覆盖在底图上显示。
  // 这样橡皮擦除立即可见（所见即所得），导出复用同一渲染逻辑（blackBackground:true）。
  const renderOps = useCallback(() => {
    const fc = fcRef.current;
    const fabric = fabricLibRef.current;
    if (!fc || !fabric) return;
    const st = imgStatesRef.current[activeUrlRef.current];
    const bg = bgRef.current;
    // 移除旧 overlay
    const old = maskOverlayRef.current;
    if (old) { fc.remove(old); maskOverlayRef.current = null; }
    if (!st) { fc.requestRenderAll(); return; }
    // 渲染透明底蒙版 canvas（橡皮实时挖洞）
    const maskCanvas = renderMaskToCanvas(st, {
      blackBackground: false,
      includeSource: binaryMaskModeRef.current,
    });
    fabric.Image.fromURL(maskCanvas.toDataURL('image/png'), (img) => {
      img.set({
        left: bg.left, top: bg.top,
        scaleX: bg.scaleX, scaleY: bg.scaleY,
        selectable: false, evented: false,
      });
      img.isMask = true;
      maskOverlayRef.current = img;
      fc.add(img);
      fc.requestRenderAll();
    });
  }, []);

  const updateHistoryButtons = useCallback(() => {
    const st = imgStatesRef.current[activeUrlRef.current];
    setCanUndo(!!st && st.ops.length > 0);
    setCanRedo(!!st && st.redo && st.redo.length > 0);
    setHasContent(!!st && (binaryMaskModeRef.current || st.ops.length > 0));
  }, []);

  // ---- 持久化写回节点 ----
  const persist = useCallback(() => {
    const fn = onDataChangeRef.current;
    if (typeof fn !== 'function') return;
    const states = imgStatesRef.current;
    const perImage = {};
    for (const [url, st] of Object.entries(states)) {
      perImage[url] = { imgW: st.imgW, imgH: st.imgH, ops: st.ops };
    }
    fn({
      inputSignature: inputSignature(thumbUrlsRef.current),
      perImage,
    });
  }, []);

  // ---- 工具切换 ----
  const switchTool = useCallback((t) => {
    toolRef.current = t;
    setTool(t);
    const fc = fcRef.current;
    if (!fc) return;
    // 画笔 & 橡皮都用 fabric 自由绘画模式（橡皮在导出时按 op.erase 挖洞）
    if (t === TOOL_BRUSH || t === TOOL_ERASE) {
      fc.isDrawingMode = true;
      const fabric = fabricLibRef.current;
      fc.freeDrawingBrush = new fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = colorRef.current;
      fc.freeDrawingBrush.width = (t === TOOL_ERASE ? eraseSizeRef.current : brushSizeRef.current) * bgRef.current.scaleX;
    } else {
      fc.isDrawingMode = false;
      fc.defaultCursor = (t === TOOL_LASSO || t === TOOL_RECT) ? 'crosshair' : 'default';
      fc.hoverCursor = fc.defaultCursor;
    }
    fc.selection = false;
  }, []);

  // ---- 撤销/重做/清空 ----
  const undo = useCallback(() => {
    const st = imgStatesRef.current[activeUrlRef.current];
    if (!st || !st.ops.length) return;
    const last = st.ops.pop();
    st.redo = st.redo || [];
    st.redo.push(last);
    renderOps();
    updateHistoryButtons();
    persist();
  }, [renderOps, updateHistoryButtons, persist]);

  const redo = useCallback(() => {
    const st = imgStatesRef.current[activeUrlRef.current];
    if (!st || !st.redo || !st.redo.length) return;
    const op = st.redo.pop();
    st.ops.push(op);
    renderOps();
    updateHistoryButtons();
    persist();
  }, [renderOps, updateHistoryButtons, persist]);

  const clearAll = useCallback(() => {
    const st = imgStatesRef.current[activeUrlRef.current];
    if (!st) return;
    st.redo = st.ops.slice();
    st.ops = [];
    renderOps();
    updateHistoryButtons();
    persist();
  }, [renderOps, updateHistoryButtons, persist]);

  // ---- fabric 事件绑定 ----
  const bindFabricEvents = useCallback((fc, fabric) => {
    // 画笔：松手后 fabric 留下 Path 对象，提取点存 op 后移除（由 renderOps 统一重绘）
    fc.on('path:created', (e) => {
      const path = e.path;
      if (!path) return;
      // path.path 是 fabric 路径命令数组，提取所有坐标点
      const pts = [];
      const cmds = path.path || [];
      for (const c of cmds) {
        // ['M',x,y] / ['L',x,y] / ['Q',cx,cy,x,y] 等，取末尾两个为锚点
        if (Array.isArray(c) && c.length >= 3) {
          const x = c[c.length - 2];
          const y = c[c.length - 1];
          if (Number.isFinite(x) && Number.isFinite(y)) {
            const p = canvasToImg(x, y);
            pts.push([p.x, p.y]);
          }
        }
      }
      fc.remove(path);
      fc.requestRenderAll();
      if (pts.length < 2) return;
      const st = imgStatesRef.current[activeUrlRef.current];
      if (!st) return;
      // 记录画笔粗细+颜色（导出时按 op 自身大小/颜色还原，与绘制时一致）
      const isErase = toolRef.current === TOOL_ERASE;
      st.ops.push({
        type: 'brush',
        points: pts,
        erase: isErase,
        color: isErase ? '#ffffff' : colorRef.current,
        size: isErase ? eraseSizeRef.current : brushSizeRef.current,
      });
      st.redo = [];
      renderOps();
      updateHistoryButtons();
      persist();
    });

    // 套索/矩形：自定义 mouse 事件
    let drawing = false;
    fc.on('mouse:down', (opt) => {
      if (fc.isDrawingMode) return; // 画笔/橡皮模式交给 path:created
      const t = toolRef.current;
      if (t !== TOOL_LASSO && t !== TOOL_RECT) return;
      drawing = true;
      const p = fc.getPointer(opt.e);
      const ip = canvasToImg(p.x, p.y);
      // points 统一存 [x,y] 数组（与画笔 op 格式一致，renderMaskToCanvas/renderOps 直接用）
      drawStateRef.current = {
        tool: t,
        startX: p.x, startY: p.y,
        startImg: [ip.x, ip.y],
        points: [[ip.x, ip.y]],
        previewObj: null,
      };
    });

    fc.on('mouse:move', (opt) => {
      if (!drawing) return;
      const ds = drawStateRef.current;
      if (!ds) return;
      const p = fc.getPointer(opt.e);
      const ip = canvasToImg(p.x, p.y);
      if (ds.tool === TOOL_LASSO) {
        ds.points.push([ip.x, ip.y]);
        // 预览线（半透明填充）
        if (ds.previewObj) fc.remove(ds.previewObj);
        const fabricLib = fabricLibRef.current;
        const cvPts = ds.points.map(([px, py]) => {
          const c = imgToCanvas(px, py);
          return { x: c.x, y: c.y };
        });
        ds.previewObj = new fabricLib.Polygon(cvPts, {
          stroke: 'rgba(255,255,255,0.9)', strokeWidth: 2,
          fill: 'rgba(255,255,255,0.25)',
          selectable: false, evented: false,
        });
        ds.previewObj.isMask = true;
        fc.add(ds.previewObj);
        fc.requestRenderAll();
      } else if (ds.tool === TOOL_RECT) {
        if (ds.previewObj) fc.remove(ds.previewObj);
        const fabricLib = fabricLibRef.current;
        const tlX = Math.min(ds.startX, p.x);
        const tlY = Math.min(ds.startY, p.y);
        ds.previewObj = new fabricLib.Rect({
          left: tlX, top: tlY,
          width: Math.abs(p.x - ds.startX), height: Math.abs(p.y - ds.startY),
          fill: 'rgba(255,255,255,0.4)', stroke: '#ffffff', strokeWidth: 1,
          selectable: false, evented: false,
        });
        ds.previewObj.isMask = true;
        fc.add(ds.previewObj);
        fc.requestRenderAll();
      }
    });

    fc.on('mouse:up', (opt) => {
      if (!drawing) return;
      drawing = false;
      const ds = drawStateRef.current;
      drawStateRef.current = null;
      if (!ds) return;
      if (ds.previewObj) { fc.remove(ds.previewObj); ds.previewObj = null; }
      const st = imgStatesRef.current[activeUrlRef.current];
      if (!st) return;
      if (ds.tool === TOOL_LASSO) {
        if (ds.points.length < 3) { fc.requestRenderAll(); return; }
        st.ops.push({ type: 'lasso', points: ds.points, color: colorRef.current });
        st.redo = [];
      } else if (ds.tool === TOOL_RECT) {
        // 取真实终点（opt.pointer），避免依赖最后一次 move
        const p = fc.getPointer(opt.e);
        const endIp = canvasToImg(p.x, p.y);
        const sx = ds.startImg[0], sy = ds.startImg[1];
        const ex = endIp.x, ey = endIp.y;
        const rect = {
          x: Math.min(sx, ex), y: Math.min(sy, ey),
          w: Math.abs(ex - sx), h: Math.abs(ey - sy),
        };
        if (rect.w < 2 || rect.h < 2) { fc.requestRenderAll(); return; }
        st.ops.push({ type: 'rect', rect, color: colorRef.current });
        st.redo = [];
      }
      renderOps();
      updateHistoryButtons();
      persist();
    });

    // 滚轮缩放（可选，提升体验）
    fc.on('mouse:wheel', (opt) => {
      const e = opt.e;
      if (!e.ctrlKey && !e.metaKey) return; // 仅 Ctrl+滚轮缩放
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      let zoom = fc.getZoom();
      zoom *= 0.999 ** delta;
      zoom = Math.max(0.2, Math.min(5, zoom));
      fc.zoomToPoint({ x: e.offsetX, y: e.offsetY }, zoom);
      fc.requestRenderAll();
    });
  }, [canvasToImg, imgToCanvas, renderOps, updateHistoryButtons, persist]);

  // ---- 切换激活图 ----
  const switchImage = useCallback(async (url) => {
    if (!url || url === activeUrlRef.current) return;
    const fabric = fabricLibRef.current;
    const fc = fcRef.current;
    if (!fabric || !fc) return;
    activeUrlRef.current = url;
    setActiveUrl(url);
    const st = imgStatesRef.current[url];
    if (!st) return;
    // 更新背景图变换
    bgRef.current.imgW = st.imgW;
    bgRef.current.imgH = st.imgH;
    fitBg();
    // 换背景图：直接用 options 的 scaleX/scaleY（背景图 fromURL 默认 1:1 像素，fitBg 已算好缩放）
    await new Promise((resolve) => {
      if (binaryMaskModeRef.current) {
        fc.backgroundColor = '#000000';
        fc.setBackgroundImage(null, () => {
          fc.renderAll();
          resolve();
        });
        return;
      }
      fabric.Image.fromURL(url, (img) => {
        const bg = bgRef.current;
        fc.setBackgroundImage(img, () => {
          fc.renderAll();
          resolve();
        }, {
          left: bg.left, top: bg.top,
          scaleX: bg.scaleX, scaleY: bg.scaleY,
        });
      });
    });
    renderOps();
    updateHistoryButtons();
    switchTool(toolRef.current);
  }, [fitBg, renderOps, updateHistoryButtons, switchTool]);

  // ---- 打开对话框：加载 fabric + 所有图（只在 open 切换时跑，读 ref 避免父 onUpdate 引用抖动重跑）----
  useEffect(() => {
    if (!open) return;
    const urls = (inputImagesRef.current || []).filter(Boolean);
    setThumbUrlsSafe(urls);
    if (!urls.length) { setError('没有输入图片'); return; }
    let disposed = false;
    setLoading(true);
    setError('');
    imgStatesRef.current = {};

    (async () => {
      try {
        const fabric = await getFabric();
        if (disposed) return;
        fabricLibRef.current = fabric;
        // 判定可恢复性
        const saved = initialDataRef.current;
        const canRestore = !!saved && saved.inputSignature === inputSignature(urls)
          && saved.perImage && typeof saved.perImage === 'object';
        const savedPerImage = canRestore ? saved.perImage : null;
        // 预加载所有图
        for (const url of urls) {
          if (disposed) return;
          const img = await loadImage(url);
          if (disposed) return;
          const savedSt = savedPerImage?.[url];
          imgStatesRef.current[url] = {
            img,
            imgW: img.naturalWidth || img.width,
            imgH: img.naturalHeight || img.height,
            ops: Array.isArray(savedSt?.ops) ? savedSt.ops.map(cloneOp).filter(isValidOp) : [],
            redo: [],
          };
        }
        // 初始化 fabric.Canvas（等一帧确保 Dialog 布局完成，取到正确尺寸）
        await new Promise((r) => requestAnimationFrame(() => r()));
        if (disposed) return;
        const el = stageRef.current?.querySelector('canvas');
        if (!el) throw new Error('画布 DOM 未就绪');
        try { fcRef.current?.dispose?.(); } catch {}
        const fc = new fabric.Canvas(el, {
          selection: false,
          preserveObjectStacking: true,
          backgroundColor: '#0f172a',
        });
        fcRef.current = fc;
        const stageEl = stageRef.current;
        // 兜底：首次取不到尺寸时用一个安全值，后续 ResizeObserver 会修正
        const w0 = stageEl?.clientWidth || 800;
        const h0 = stageEl?.clientHeight || 500;
        fc.setWidth(w0);
        fc.setHeight(h0);
        // ResizeObserver
        if (stageEl && typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            const f = fcRef.current;
            if (!f) return;
            f.setWidth(stageEl.clientWidth);
            f.setHeight(stageEl.clientHeight);
            fitBg();
            // 背景图重定位
            const url = activeUrlRef.current;
            const st = imgStatesRef.current[url];
            if (st && binaryMaskModeRef.current) {
              f.backgroundColor = '#000000';
              f.setBackgroundImage(null, () => f.renderAll());
            } else if (st) {
              const bg = bgRef.current;
              const img = st.img;
              fabric.Image.fromURL(url, (im) => {
                im.selectable = false; im.evented = false;
                f.setBackgroundImage(im, () => f.renderAll(), {
                  left: bg.left, top: bg.top, scaleX: bg.scaleX, scaleY: bg.scaleY,
                });
              });
            }
            renderOps();
          });
          ro.observe(stageEl);
          roRef.current = ro;
        }
        bindFabricEvents(fc, fabric);
        // 激活第一张
        const first = urls[0];
        activeUrlRef.current = '';
        await switchImage(first);
        switchTool(TOOL_BRUSH);
        setLoading(false);
      } catch (err) {
        console.error('MaskPaint init failed:', err);
        if (!disposed) { setError(err?.message || String(err)); setLoading(false); }
      }
    })();

    return () => {
      disposed = true;
      try { roRef.current?.disconnect(); } catch {}
      roRef.current = null;
      try { fcRef.current?.dispose?.(); } catch {}
      fcRef.current = null;
      fabricLibRef.current = null;
      activeUrlRef.current = '';
      imgStatesRef.current = {};
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- 导出黑白蒙版 ----
  const handleExport = useCallback(async () => {
    const AS = window.AgentSpaces;
    if (!AS?.uploadFile) { setError('宿主未提供 uploadFile 能力'); return; }
    setExporting(true);
    setError('');
    try {
      const urls = thumbUrls.filter(Boolean);
      const out = [];
      for (const url of urls) {
        const st = imgStatesRef.current[url];
        if (!st) continue;
        const canvas = renderMaskToCanvas(st, {
          includeSource: binaryMaskModeRef.current,
          alphaMask: alphaMaskExportRef.current,
        });
        const dataUrl = canvas.toDataURL('image/png');
        const blob = dataURLToBlob(dataUrl);
        const file = new File([blob], `mask-${out.length + 1}.png`, { type: 'image/png' });
        const uploaded = await AS.uploadFile(file);
        const httpUrl = uploaded?.url || uploaded?.httpPath;
        if (httpUrl) out.push(httpUrl);
      }
      if (!out.length) throw new Error('没有可导出的蒙版');
      await onSaveRef.current?.(out);
      onClose?.(); // 导出成功后关闭对话框
    } catch (err) {
      console.error('MaskPaint export failed:', err);
      setError(err?.message || String(err));
    } finally {
      setExporting(false);
    }
  }, [thumbUrls]);

  // ---- 画笔大小变化时同步 fabric brush width ----
  useEffect(() => {
    brushSizeRef.current = brushSize;
    const fc = fcRef.current;
    if (fc && fc.isDrawingMode && fc.freeDrawingBrush) {
      fc.freeDrawingBrush.width = brushSize * bgRef.current.scaleX;
    }
  }, [brushSize]);
  useEffect(() => { eraseSizeRef.current = eraseSize; }, [eraseSize]);

  // ---- 颜色变化时同步 colorRef + fabric brush color ----
  useEffect(() => {
    colorRef.current = color;
    const fc = fcRef.current;
    if (fc && fc.isDrawingMode && fc.freeDrawingBrush) {
      fc.freeDrawingBrush.color = color;
    }
  }, [color]);
  useEffect(() => {
    if (!binaryMaskMode) return;
    colorRef.current = '#ffffff';
    setColor('#ffffff');
    const fc = fcRef.current;
    if (fc?.freeDrawingBrush) fc.freeDrawingBrush.color = '#ffffff';
  }, [binaryMaskMode]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="!w-[80vw] !max-w-[80vw] flex flex-col gap-2 overflow-hidden p-3"
        style={{ height: '92vh', maxHeight: '92vh' }}
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <DialogTitle>{binaryMaskMode ? '重绘部件蒙版' : '蒙版绘制'}</DialogTitle>
            <DialogDescription className="text-[11px]">
              {binaryMaskMode
                ? '白色为保留区域。使用白色画笔、套索或矩形补画，使用橡皮删除区域。'
                : '支持画笔（可调大小）/ 自由套索 / 矩形选区，可选颜色填充/绘制。橡皮擦挖洞。导出蒙版图供下游使用。'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* 缩略图条 */}
        {thumbUrls.length > 1 && (
          <div className="nodrag nopan nowheel flex gap-1.5 overflow-x-auto rounded-md bg-muted/40 p-1.5">
            {thumbUrls.map((url) => (
              <button
                key={url}
                type="button"
                onClick={() => switchImage(url)}
                className={`relative h-12 w-12 shrink-0 overflow-hidden rounded border-2 transition ${
                  url === activeUrl ? 'border-primary' : 'border-transparent hover:border-border'
                }`}
                title="切换到此图"
              >
                <img src={url} alt="" draggable={false} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* 工具栏 */}
        <div className="nodrag nopan nowheel flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
          <div className="flex gap-1">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTool(t.id)}
                  title={t.label}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                    tool === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="mx-1 h-5 w-px bg-border" />

          {(tool === TOOL_BRUSH || tool === TOOL_ERASE) && (
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {(tool === TOOL_ERASE ? '橡皮' : '画笔') + '大小'}
              <input
                type="range"
                min={2}
                max={120}
                value={tool === TOOL_ERASE ? eraseSize : brushSize}
                onChange={(e) => (tool === TOOL_ERASE ? setEraseSize(+e.target.value) : setBrushSize(+e.target.value))}
                className="w-24 nodrag nopan"
              />
              <span className="w-7 text-center text-[11px] tabular-nums">
                {tool === TOOL_ERASE ? eraseSize : brushSize}
              </span>
            </Label>
          )}

          {tool !== TOOL_ERASE && !binaryMaskMode && (
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              颜色
              <ColorPicker colors={COLOR_PRESETS} value={color} onChange={setColor} />
            </Label>
          )}

          <div className="mx-1 h-5 w-px bg-border" />

          <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="撤销">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="重做">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={!hasContent} title={binaryMaskMode ? '重置修改' : '清空当前图'}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* 画布区 */}
        <div className="nodrag nopan nowheel relative h-full min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-[#0f172a]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/60 text-sm text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" /> 加载编辑器…
            </div>
          )}
          <div ref={stageRef} className="absolute inset-0">
            <canvas />
          </div>
          {error && (
            <div className="absolute bottom-2 left-2 right-2 rounded bg-destructive/90 px-2 py-1 text-xs text-destructive-foreground">
              {error}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="nodrag nopan nowheel flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground">
            {activeUrl ? `当前：${thumbUrls.indexOf(activeUrl) + 1} / ${thumbUrls.length}` : ''}
            {hasContent ? (binaryMaskMode ? ' · 可编辑原蒙版' : ' · 已绘制蒙版') : ' · 尚未绘制'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onClose?.()} disabled={exporting}>
              取消
            </Button>
            <Button size="sm" onClick={handleExport} disabled={exporting || !hasContent}>
              {exporting ? <><Loader className="mr-1 h-3.5 w-3.5 animate-spin" /> 导出中…</> : <><Download className="mr-1 h-3.5 w-3.5" /> 导出蒙版</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ 工具函数 ============

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`图片加载失败: ${url}`));
    img.src = url;
  });
}

function cloneOp(op) {
  if (!op || typeof op !== 'object') return null;
  const color = typeof op.color === 'string' ? op.color : undefined;
  if (op.type === 'rect') return { type: 'rect', rect: { ...op.rect }, ...(color ? { color } : {}) };
  if (op.type === 'brush' || op.type === 'lasso') {
    return {
      type: op.type,
      points: (op.points || []).map((p) => [p[0], p[1]]),
      ...(op.erase ? { erase: true } : {}),
      ...(op.size ? { size: op.size } : {}),
      ...(color ? { color } : {}),
    };
  }
  return null;
}

function isValidOp(op) {
  if (!op) return false;
  if (op.type === 'rect') {
    const r = op.rect;
    return r && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h);
  }
  if (op.type === 'brush' || op.type === 'lasso') {
    return Array.isArray(op.points) && op.points.length >= 2;
  }
  return false;
}

// 把某图状态渲染为蒙版 canvas（图片原始尺寸）。
// blackBackground=true → 导出用（黑底 + 蒙版）；false → 预览用（透明底蒙版，叠加在底图上）。
// alphaMask=true → alpha 蒙版导出（GPT-Image 等）：涂出→alpha=0(透明/可编辑)，未涂→alpha=255(不透明/保留)，RGB 全黑。
// 蒙版层逻辑：source-over 画 ops，橡皮 destination-out 实时挖洞。
function renderMaskToCanvas(st, {
  blackBackground = true, includeSource = false, alphaMask = false,
} = {}) {
  const w = st.imgW || (st.img?.naturalWidth) || 1;
  const h = st.imgH || (st.img?.naturalHeight) || 1;

  // 1. 蒙版层：透明底，按 op 顺序绘制，橡皮 destination-out 挖洞
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = w;
  maskCanvas.height = h;
  const mctx = maskCanvas.getContext('2d');
  if (includeSource && st.img) mctx.drawImage(st.img, 0, 0, w, h);
  for (const op of st.ops) {
    const opColor = op.color || '#ffffff';
    if (op.type === 'brush') {
      const pts = op.points;
      if (!pts || pts.length < 2) continue;
      const size = op.size || 24;
      mctx.globalCompositeOperation = op.erase ? 'destination-out' : 'source-over';
      mctx.strokeStyle = opColor;
      mctx.lineWidth = size;
      mctx.lineCap = 'round';
      mctx.lineJoin = 'round';
      mctx.beginPath();
      mctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i][0], pts[i][1]);
      mctx.stroke();
    } else if (op.type === 'lasso') {
      const pts = op.points;
      if (!pts || pts.length < 3) continue;
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = opColor;
      mctx.beginPath();
      mctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i][0], pts[i][1]);
      mctx.closePath();
      mctx.fill();
    } else if (op.type === 'rect') {
      const r = op.rect;
      if (!r) continue;
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = opColor;
      mctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
  mctx.globalCompositeOperation = 'source-over';

  // 2. 预览模式直接返回透明底蒙版层
  if (!blackBackground) return maskCanvas;

  // 3. alpha 蒙版导出（GPT-Image 等）：RGB 全黑，alpha = 255 - 涂出覆盖度
  //    涂出区(alpha=0, 可编辑) / 未涂区(alpha=255, 保留)。
  if (alphaMask) {
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    // 先填全黑不透明（alpha=255 = 保留区）
    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, w, h);
    // 再用 maskCanvas（涂出覆盖度）以 destination-out 挖出可编辑区（alpha=0）
    octx.globalCompositeOperation = 'destination-out';
    octx.drawImage(maskCanvas, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    return out;
  }

  // 4. 黑底白笔触导出（原行为）
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, w, h);
  octx.drawImage(maskCanvas, 0, 0);
  return out;
}

function dataURLToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/png';
  const bin = atob(body);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
